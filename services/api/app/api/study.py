from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from app.api.deps import AppSettings, Conn, StorageDep, User, require_ai
from app.domain import avatars, chat, page_images, plans, study, topics, usage
from app.rag.explain import PROMPT_VERSION
from app.worker import queue

router = APIRouter(tags=["study"])

Style = Literal["standard", "simple", "exam"]


class TopicOut(BaseModel):
    id: UUID
    ordinal: int
    title: str
    summary: str | None
    page_start: int | None
    page_end: int | None
    # The student's own view (FR-TOP-03): the name before they changed it, and the original topics
    # this one covers (more than one after a merge; quizzes and explanations use all of them).
    original_title: str | None = None
    parts: list[UUID] = []
    part_titles: list[str] = []  # the original names of `parts`, for the merged explanation


class TopicName(BaseModel):
    # None or blank goes back to the original name.
    title: Annotated[str, Field(max_length=topics.TITLE_MAX)] | None = None


class TopicMerge(BaseModel):
    title: Annotated[str, Field(max_length=topics.TITLE_MAX)] | None = None


class OutlineDocument(BaseModel):
    id: UUID
    title: str
    course_id: UUID | None = None
    course_code: str | None
    page_count: int | None
    topic_count: int
    # OCR'd pages that were hard to read (FR-DOC-07); the app lists them.
    low_ocr_pages: list[int] = []


class OutlineOut(BaseModel):
    document: OutlineDocument
    topics: list[TopicOut]


class PageOut(BaseModel):
    page_number: int
    page_count: int | None
    text: str
    # In a course shared with the student, only a short quoted passage (FR-SHARE-02).
    quote: bool = False


QUOTE_CHARS = 600
PAGES_NOT_SHARED = "Original pages aren't shared. You can read the quoted passage."


class PageImageOut(BaseModel):
    # A 5-minute signed URL, or null when the file has no page images (slides): show the text.
    url: str | None


class ExplanationOut(BaseModel):
    id: UUID
    style: Style
    # pending/generating while the worker writes it; ready or failed after.
    status: str
    content_md: str | None
    citations: list[int]
    # Waiting because every AI provider is busy or the day's budget is spent (FR-LIM-03).
    busy: bool = False


class ExplanationRequest(BaseModel):
    style: Style = "standard"


class FeedbackIn(BaseModel):
    target_type: Literal["explanation", "chat_message"]
    target_id: UUID
    rating: Literal[-1, 1]


class ReportIn(BaseModel):
    # "avatar": a coursemate's profile photo; target_id is that student's id (FR-MOD-06).
    target_type: Literal["explanation", "question", "chat_message", "avatar"]
    target_id: UUID
    reason: Literal["wrong", "unclear", "inappropriate", "other"]
    note: str | None = Field(default=None, max_length=500)


async def _document(conn, user_id: UUID, document_id: UUID) -> dict:
    doc = await study.ready_document(conn, user_id, document_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found or not ready yet")
    return doc


async def _topic(conn, doc: dict, topic_id: UUID) -> dict:
    found = next(
        (t for t in await study.topics(conn, doc["source_file_id"]) if t["id"] == topic_id), None
    )
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Topic not found")
    return found


def _out(row: dict) -> ExplanationOut:
    return ExplanationOut(
        id=row["id"],
        style=row["style"],
        status=row["status"],
        content_md=row["content_md"] if row["status"] == "ready" else None,
        citations=row["citations"] or [],
        busy=bool(row.get("busy")),
    )


async def _outline(conn, user_id: UUID, doc: dict) -> OutlineOut:
    """The outline with this student's renames and merges, and nobody else's (FR-TOP-03)."""
    rows = await topics.outline(
        conn, user_id, doc["source_file_id"], await study.topics(conn, doc["source_file_id"])
    )
    return OutlineOut(
        document=OutlineDocument(**doc, topic_count=len(rows)),
        topics=[TopicOut(**t) for t in rows],
    )


@router.get("/v1/documents/{document_id}/outline")
async def outline(document_id: UUID, user: User, conn: Conn) -> OutlineOut:
    """The document's topics with the student's own renames, merges and splits applied."""
    return await _outline(conn, user.id, await _document(conn, user.id, document_id))


async def _visible(conn, user_id: UUID, doc: dict, topic_id: UUID) -> tuple[list[dict], int]:
    """The student's outline and the position of a topic in it; merged-away topics aren't there."""
    rows = await topics.outline(
        conn, user_id, doc["source_file_id"], await study.topics(conn, doc["source_file_id"])
    )
    at = next((i for i, t in enumerate(rows) if t["id"] == topic_id), None)
    if at is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Topic not found")
    return rows, at


def _clean_title(title: str | None) -> str | None:
    return " ".join((title or "").split()) or None


@router.put("/v1/documents/{document_id}/topics/{topic_id}/name")
async def rename_topic(
    document_id: UUID, topic_id: UUID, body: TopicName, user: User, conn: Conn
) -> OutlineOut:
    """Screen 27b: a name that makes sense to the student, for their eyes only."""
    doc = await _document(conn, user.id, document_id)
    await _visible(conn, user.id, doc, topic_id)
    await topics.rename(conn, user.id, topic_id, _clean_title(body.title))
    return await _outline(conn, user.id, doc)


@router.post("/v1/documents/{document_id}/topics/{topic_id}/merge")
async def merge_topic(
    document_id: UUID, topic_id: UUID, body: TopicMerge, user: User, conn: Conn
) -> OutlineOut:
    """Screen 27c: this topic and the next one become one, for this student only."""
    doc = await _document(conn, user.id, document_id)
    rows, at = await _visible(conn, user.id, doc, topic_id)
    if at == len(rows) - 1:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "There's no next topic to merge")
    await topics.merge(conn, user.id, topic_id, rows[at + 1]["id"], _clean_title(body.title))
    return await _outline(conn, user.id, doc)


@router.post("/v1/documents/{document_id}/topics/{topic_id}/split")
async def split_topic(document_id: UUID, topic_id: UUID, user: User, conn: Conn) -> OutlineOut:
    """Undo a merge: back to the original topics."""
    doc = await _document(conn, user.id, document_id)
    await _visible(conn, user.id, doc, topic_id)
    await topics.split(conn, user.id, topic_id)
    return await _outline(conn, user.id, doc)


@router.get("/v1/documents/{document_id}/pages/{number}")
async def source_page(document_id: UUID, number: int, user: User, conn: Conn) -> PageOut:
    """Text of one page, for citation chips (FR-DOC-10)."""
    doc = await _document(conn, user.id, document_id)
    row = await study.page(conn, doc["source_file_id"], number)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Page not found")
    if doc.get("shared"):
        text = row["text"].strip()
        quote = text if len(text) <= QUOTE_CHARS else text[:QUOTE_CHARS].rsplit(" ", 1)[0] + " …"
        return PageOut(page_number=number, page_count=doc["page_count"], text=quote, quote=True)
    return PageOut(page_number=number, page_count=doc["page_count"], text=row["text"])


@router.get("/v1/documents/{document_id}/pages/{number}/image")
async def source_page_image(
    document_id: UUID, number: int, user: User, conn: Conn, storage: StorageDep
) -> PageImageOut:
    """The page as the student uploaded it, for the source viewer (FR-DOC-10)."""
    doc = await _document(conn, user.id, document_id)
    if doc.get("shared"):  # members never get a storage URL (FR-SHARE-02)
        raise HTTPException(status.HTTP_403_FORBIDDEN, PAGES_NOT_SHARED)
    if not 1 <= number <= (doc["page_count"] or 0):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Page not found")
    source = await study.source_file(conn, doc["source_file_id"])
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Page not found")
    return PageImageOut(url=await page_images.image_url(storage, source, number))


@router.get("/v1/documents/{document_id}/topics/{topic_id}/explanation")
async def get_explanation(
    document_id: UUID,
    topic_id: UUID,
    user: User,
    conn: Conn,
    style: Annotated[Style, Query()] = "standard",
) -> ExplanationOut:
    """Poll while an explanation is being written."""
    doc = await _document(conn, user.id, document_id)
    await _topic(conn, doc, topic_id)
    row = await study.explanation(conn, topic_id, style, PROMPT_VERSION)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No explanation requested yet")
    return _out(row)


@router.post("/v1/documents/{document_id}/topics/{topic_id}/explanation")
async def request_explanation(
    document_id: UUID,
    topic_id: UUID,
    body: ExplanationRequest,
    user: User,
    conn: Conn,
    settings: AppSettings,
) -> ExplanationOut:
    """Cached explanations come back at once and are free (FR-EXPL-04); otherwise one is
    queued, using one of the student's daily explanations (FR-LIM-01)."""
    doc = await _document(conn, user.id, document_id)
    await _topic(conn, doc, topic_id)
    row = await study.explanation(conn, topic_id, body.style, PROMPT_VERSION)
    if row is None:
        require_ai(user)  # a new explanation is AI work; a cached one is free (FR-LIM-06)
        limit = plans.daily_limit(settings, user.plan, "explanation")
        if await usage.take(conn, user.id, "explanation", limit, settings.timezone) is None:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                plans.used_up(settings, user.plan, "explanation"),
            )
        await study.create_explanation(
            conn, doc["source_file_id"], topic_id, body.style, PROMPT_VERSION
        )
        row = await study.explanation(conn, topic_id, body.style, PROMPT_VERSION)
    elif row["status"] == "failed":
        # Our failure, not the student's request: retry without using another explanation.
        await study.retry_explanation(conn, row["id"])
        row = {**row, "status": "pending"}
    if row["status"] == "pending":
        await queue.enqueue(
            conn,
            "generate_explanation",
            {"explanation_id": str(row["id"])},
            user_id=user.id,
            dedupe_key=f"explain:{row['id']}",
        )
    return _out(row)


async def _check_target(conn, user_id: UUID, target_id: UUID, kind: str = "explanation") -> None:
    can_see = {
        "question": study.can_see_question,
        "chat_message": chat.can_see_message,
        "avatar": avatars.can_see,  # only a photo shown to them, of someone in a shared course
    }.get(kind, study.can_see_explanation)
    if not await can_see(conn, user_id, target_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")


@router.post("/v1/feedback", status_code=status.HTTP_204_NO_CONTENT)
async def feedback(body: FeedbackIn, user: User, conn: Conn) -> Response:
    """Thumbs up/down (FR-MOD-03)."""
    await _check_target(conn, user.id, body.target_id, body.target_type)
    await study.rate(conn, user.id, body.target_type, body.target_id, body.rating)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/v1/reports", status_code=status.HTTP_204_NO_CONTENT)
async def report(body: ReportIn, user: User, conn: Conn) -> Response:
    """Wrong / unclear / inappropriate (FR-MOD-01)."""
    await _check_target(conn, user.id, body.target_id, body.target_type)
    note = body.note.strip() or None if body.note else None
    await study.report(conn, user.id, body.target_type, body.target_id, body.reason, note)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
