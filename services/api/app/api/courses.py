from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator

from app.api.deps import AppSettings, Conn, StorageDep, User
from app.domain import courses, documents, offline, sharing
from app.worker import cleanup

router = APIRouter(prefix="/v1/courses", tags=["courses"])

# FR-CRS-05: the course accents (ink is the app's own colour, never a course's).
Accent = Literal["lagoon", "ankara", "palm", "lavender"]
PAST_EXAM = "Pick today or a later date for the exam."


class CourseOut(BaseModel):
    id: UUID
    code: str
    title: str | None
    document_count: int
    created_at: datetime
    exam_date: date | None = None  # FR-CRS-04
    accent: Accent = "lagoon"
    # Sharing (FR-SHARE-05/07): a course you shared shows its member count; a course shared with
    # you shows who shared it, and is read-only.
    shared: bool = False
    member_count: int | None = None
    shared_by: str | None = None
    member_id: UUID | None = None


class _CourseFields(BaseModel):
    @field_validator("code", "title", check_fields=False)
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() or None if v is not None else None

    @field_validator("code", check_fields=False)
    @classmethod
    def _code_length(cls, v: str | None) -> str | None:
        if v is not None and not 2 <= len(courses.normalize_code(v)) <= 12:
            raise ValueError("Course code must be 2–12 characters")
        return v


class CourseCreate(_CourseFields):
    code: str = Field(max_length=40)  # normalised, then 2-12 characters (FR-CRS-01)
    title: str | None = Field(default=None, max_length=80)  # FR-SEC-10
    exam_date: date | None = None
    accent: Accent | None = None  # None: next in the rotation


class CourseUpdate(_CourseFields):
    code: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, max_length=80)
    exam_date: date | None = None  # null clears it
    accent: Accent | None = None


async def _check_exam_date(conn, user_id: UUID, exam_date: date | None) -> None:
    """FR-CRS-04: today or later, in the student's time zone."""
    if exam_date is not None and exam_date < await courses.today(conn, user_id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, PAST_EXAM)


def _duplicate(code: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, f"You already have a course called {code}.")


READ_ONLY = "This course was shared with you, so only its owner can change it."


@router.get("")
async def list_courses(user: User, conn: Conn) -> list[CourseOut]:
    """The student's courses, then courses shared with them (FR-SHARE-05)."""
    shared = await courses.shared_course_ids(conn, user.id)
    own = [
        CourseOut(**c, shared=c["id"] in shared, member_count=shared.get(c["id"]))
        for c in await courses.list_courses(conn, user.id)
    ]
    return own + [CourseOut(**c) for c in await courses.joined_courses(conn, user.id)]


async def _not_member(conn, user_id: UUID, course_id: UUID) -> None:
    """FR-DOC-12: a member trying to change a shared course gets 403, not "not found"."""
    if await documents.is_course_member(conn, user_id, course_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, READ_ONLY)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_course(body: CourseCreate, user: User, conn: Conn) -> CourseOut:
    """Adds a course. A code the student already uses is a 409; the exam date must be
    today or later (FR-CRS-04)."""
    if not body.code:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Course code is required")
    await _check_exam_date(conn, user.id, body.exam_date)
    try:
        return CourseOut(
            **await courses.create_course(
                conn, user.id, body.code, body.title, body.exam_date, body.accent
            )
        )
    except courses.DuplicateCourse as exc:
        raise _duplicate(str(exc)) from exc


@router.patch("/{course_id}")
async def update_course(course_id: UUID, body: CourseUpdate, user: User, conn: Conn) -> CourseOut:
    """Changes only the fields sent. A course shared with the student is a 403 (FR-DOC-12)."""
    fields = body.model_dump(exclude_unset=True)
    if "code" in fields and not fields["code"]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Course code is required")
    if "accent" in fields and fields["accent"] is None:
        del fields["accent"]  # an accent can be changed, not removed
    await _check_exam_date(conn, user.id, fields.get("exam_date"))
    try:
        course = await courses.update_course(conn, user.id, course_id, fields)
    except courses.DuplicateCourse as exc:
        raise _duplicate(str(exc)) from exc
    if course is None:
        await _not_member(conn, user.id, course_id)
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    return CourseOut(**course)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    course_id: UUID,
    user: User,
    conn: Conn,
    storage: StorageDep,
    settings: AppSettings,
    documents: Annotated[Literal["delete", "unfile"], Query()],
) -> Response:
    """FR-CRS-03: the app asks whether to delete the course's documents or move them to Unfiled.
    A shared course stops being shared first, so members are told (FR-CRS-03)."""
    await sharing.stop(conn, user.id, course_id)
    paths = await courses.delete_course(
        conn, user.id, course_id, documents == "delete", settings.timezone
    )
    if paths is None:
        await _not_member(conn, user.id, course_id)
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    await cleanup.remove_or_queue(conn, storage, paths)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class OfflineDocument(BaseModel):
    id: UUID
    title: str
    bytes: int


class OfflineExplanation(BaseModel):
    document_id: UUID
    topic_id: UUID
    style: str
    bytes: int


class OfflineQuiz(BaseModel):
    id: UUID
    document_id: UUID
    questions: int
    bytes: int


class OfflineManifest(BaseModel):
    """What "Save for offline" fetches, with sizes, so the size shows first (FR-OFF-03)."""

    course_id: UUID
    documents: list[OfflineDocument]
    explanations: list[OfflineExplanation]
    quizzes: list[OfflineQuiz]
    bytes: int


@router.get("/{course_id}/offline")
async def offline_manifest(course_id: UUID, user: User, conn: Conn) -> OfflineManifest:
    """Outlines, written explanations and the student's quizzes for one of their courses, or a
    course shared with them. Original files are never included (FR-SHARE-02)."""
    data = await offline.manifest(conn, user.id, course_id)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    return OfflineManifest(**data)
