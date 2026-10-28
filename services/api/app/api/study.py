from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from app.api.deps import AppSettings, Conn, StorageDep, User
from app.domain import chat, page_images, study, usage
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


class OutlineDocument(BaseModel):
    id: UUID
    title: str
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
    target_type: Literal["explanation", "question", "chat_message"]
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


@router.get("/v1/documents/{document_id}/outline")
async def outline(document_id: UUID, user: User, conn: Conn) -> OutlineOut:
    doc = await _document(conn, user.id, document_id)
    rows = await study.topics(conn, doc["source_file_id"])
    return OutlineOut(
        document=OutlineDocument(**doc, topic_count=len(rows)),
        topics=[TopicOut(**t) for t in rows],
    )


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
        limit = settings.daily_explanations
        if await usage.take(conn, user.id, "explanation", limit, settings.timezone) is None:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"You've used today's {limit} explanations. Resets at 12:00 AM.",
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
