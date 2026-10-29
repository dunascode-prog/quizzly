from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from app.api.deps import AppSettings, Conn, StorageDep, User
from app.domain import documents, uploads, usage
from app.worker import cleanup, queue

router = APIRouter(tags=["documents"])

READ_ONLY = "This course was shared with you, so its notes can't be changed."
PAST_PAPER_COURSE = "Pick the course this past paper is for."


class DocumentOut(BaseModel):
    id: UUID
    title: str
    original_filename: str
    course_id: UUID | None
    # awaiting_upload → uploaded → processing → ready | failed (FR-DOC-05)
    status: str
    progress: int | None
    failure_reason: str | None
    failure_message: str | None
    page_count: int | None
    topic_count: int
    low_ocr_page_count: int
    created_at: datetime
    # A document in a course shared with the student: study only (FR-DOC-12).
    read_only: bool = False
    # "past_paper": only its style is used, for quizzes; never studied or shared (FR-QGEN-09).
    kind: str = "notes"
    paper_year: str | None = None

    @classmethod
    def of(cls, row: dict) -> "DocumentOut":
        reason = row["failure_reason"]
        return cls(
            **{k: row[k] for k in cls.model_fields if k in row},
            failure_message=documents.FAILURE_MESSAGES.get(reason) if reason else None,
        )


class UploadOut(BaseModel):
    document: DocumentOut
    # PUT the raw file bytes to each URL, in order; no auth header needed (FR-DOC-03).
    # One URL for a PDF/PPTX, one per photo for a photo set.
    upload_urls: list[str]


class DocumentCreate(BaseModel):
    # The file name, or for a photo set the document's title.
    filename: str = Field(min_length=1, max_length=255)
    # Total size; for a photo set, all photos together.
    size_bytes: int = Field(gt=0)
    course_id: UUID | None = None
    # 1–30 photos combined into one document, in order (FR-DOC-01).
    image_count: int | None = Field(default=None, ge=1, le=documents.MAX_IMAGES)
    # A past question paper for one of the student's courses (FR-QGEN-09, screen 26a).
    kind: Literal["notes", "past_paper"] = "notes"
    paper_year: Annotated[str, Field(pattern=r"^(\d{4}|older)$")] | None = None


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=80)  # FR-SEC-10
    # Explicit null moves the document to Unfiled.
    course_id: UUID | None = None


class Allowance(BaseModel):
    used: int
    limit: int
    remaining: int


class UsageOut(BaseModel):
    uploads: Allowance
    explanations: Allowance
    question_sets: Allowance
    markings: Allowance
    chat_messages: Allowance


async def _found(conn, user_id: UUID, document_id: UUID) -> dict:
    doc = await documents.get_document(conn, user_id, document_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return doc


async def _check_course(conn, user_id: UUID, course_id: UUID | None) -> None:
    if course_id and not await documents.course_belongs_to(conn, user_id, course_id):
        if await documents.is_course_member(conn, user_id, course_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, READ_ONLY)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown course")


def _owned(doc: dict) -> dict:
    """Documents in a course shared with the student can be studied, not changed (FR-DOC-12)."""
    if doc.get("read_only"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, READ_ONLY)
    return doc


async def _upload_urls(conn, storage, doc: dict, user_id: UUID) -> list[str]:
    """Signed URLs for the document's own server-named paths only (FR-SEC-02), valid for the
    next 10 minutes (FR-SEC-17)."""
    if not uploads.owned(doc, user_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "This upload can't be used")
    await documents.upload_url_issued(conn, doc["id"])
    return [await storage.signed_upload_url(p) for p in uploads.files(doc)]


@router.get("/v1/usage", tags=["account"])
async def get_usage(user: User, conn: Conn, settings: AppSettings) -> UsageOut:
    """Today's use of each daily allowance and what's left; resets at midnight (FR-LIM-01)."""
    used = await usage.used_today(conn, user.id, settings.timezone)

    def allowance(resource: str, limit: int) -> Allowance:
        n = used.get(resource, 0)
        return Allowance(used=n, limit=limit, remaining=max(limit - n, 0))

    return UsageOut(
        uploads=allowance("upload", settings.daily_uploads),
        explanations=allowance("explanation", settings.daily_explanations),
        question_sets=allowance("question_set", settings.daily_question_sets),
        markings=allowance("marking", settings.daily_markings),
        chat_messages=allowance("chat_message", settings.daily_chat_messages),
    )


@router.get("/v1/documents")
async def list_documents(
    user: User,
    conn: Conn,
    course_id: UUID | None = None,
    unfiled: Annotated[bool, Query()] = False,
) -> list[DocumentOut]:
    """The documents the student can open. Filter with `course_id`, or `unfiled=true` for
    those not in a course."""
    rows = await documents.list_documents(conn, user.id, course_id, unfiled)
    return [DocumentOut.of(r) for r in rows]


@router.post("/v1/documents", status_code=status.HTTP_201_CREATED)
async def create_document(
    body: DocumentCreate, user: User, conn: Conn, settings: AppSettings, storage: StorageDep
) -> UploadOut:
    """Registers an upload and returns signed URLs; the files go straight to Storage."""
    if not body.image_count and documents.file_kind(body.filename) is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Upload a PDF or PowerPoint (.pptx) file."
        )
    if body.size_bytes > settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, documents.FAILURE_MESSAGES["too_large"]
        )
    await _check_course(conn, user.id, body.course_id)
    if body.kind == "past_paper" and body.course_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, PAST_PAPER_COURSE)
    limit = settings.daily_uploads
    if await usage.take(conn, user.id, "upload", limit, settings.timezone) is None:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"You've used today's {limit} uploads. Resets at 12:00 AM.",
        )
    doc = await documents.create_document(
        conn,
        user.id,
        body.filename.strip(),
        body.course_id,
        body.image_count,
        body.kind,
        body.paper_year if body.kind == "past_paper" else None,
    )
    urls = await _upload_urls(conn, storage, doc, user.id)
    return UploadOut(document=DocumentOut.of(doc), upload_urls=urls)


@router.post("/v1/documents/{document_id}/upload-url")
async def new_upload_url(
    document_id: UUID, user: User, conn: Conn, storage: StorageDep
) -> UploadOut:
    """A fresh signed URL to retry an upload that didn't finish (FR-DOC-04)."""
    doc = await _found(conn, user.id, document_id)
    if doc["status"] not in ("awaiting_upload", "failed") or doc["source_file_id"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "This document is already uploaded")
    urls = await _upload_urls(conn, storage, doc, user.id)
    return UploadOut(document=DocumentOut.of(doc), upload_urls=urls)


@router.post("/v1/documents/{document_id}/uploaded")
async def upload_finished(
    document_id: UUID, user: User, conn: Conn, storage: StorageDep, settings: AppSettings
) -> DocumentOut:
    """The app calls this after its PUT succeeds; processing starts in the background. The files
    must be in the document's own folder, in time, within size and really of their type
    (FR-SEC-02). Otherwise the document stays waiting so the app can upload again."""
    doc = await _found(conn, user.id, document_id)
    if doc["status"] in ("awaiting_upload", "failed") and not doc["source_file_id"]:
        if not uploads.owned(doc, user.id):
            raise HTTPException(status.HTTP_409_CONFLICT, "This upload can't be used")
        problem = await uploads.check(storage, doc, settings.max_upload_bytes)
        if problem:
            if problem in ("upload_expired", "wrong_type", "too_large"):
                await storage.remove(uploads.files(doc))  # so a fresh upload can take its place
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, uploads.MESSAGES[problem])
    if not await documents.mark_uploaded(conn, user.id, document_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "This document is already uploaded")
    await queue.enqueue(
        conn,
        "ingest_document",
        {"document_id": str(document_id)},
        user_id=user.id,
        dedupe_key=documents.job_key(document_id),
    )
    return DocumentOut.of(await _found(conn, user.id, document_id))


@router.get("/v1/documents/{document_id}")
async def get_document(document_id: UUID, user: User, conn: Conn) -> DocumentOut:
    """One document, with its processing status; poll this while it's being processed."""
    return DocumentOut.of(await _found(conn, user.id, document_id))


@router.patch("/v1/documents/{document_id}")
async def update_document(
    document_id: UUID, body: DocumentUpdate, user: User, conn: Conn
) -> DocumentOut:
    """Renames a document or moves it to another course (`course_id: null` for Unfiled).
    Documents in a course shared with the student can't be changed (FR-DOC-12)."""
    fields = body.model_dump(exclude_unset=True)
    if "title" in fields:
        fields["title"] = fields["title"].strip() or None
        if not fields["title"]:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Title is required")
    _owned(await _found(conn, user.id, document_id))
    if "course_id" in fields:
        await _check_course(conn, user.id, fields["course_id"])
    return DocumentOut.of(await documents.update_document(conn, user.id, document_id, fields))


@router.delete("/v1/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID, user: User, conn: Conn, storage: StorageDep, settings: AppSettings
) -> Response:
    """Also gives back today's upload if the document was uploaded today."""
    _owned(await _found(conn, user.id, document_id))
    paths = await documents.delete_document(conn, user.id, document_id, settings.timezone)
    if paths is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    await cleanup.remove_or_queue(conn, storage, paths)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
