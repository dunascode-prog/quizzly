from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator

from app.api.deps import AppSettings, Conn, StorageDep, User
from app.domain import courses

router = APIRouter(prefix="/v1/courses", tags=["courses"])


class CourseOut(BaseModel):
    id: UUID
    code: str
    title: str | None
    document_count: int
    created_at: datetime


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


class CourseUpdate(_CourseFields):
    code: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, max_length=80)


def _duplicate(code: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, f"You already have a course called {code}.")


@router.get("")
async def list_courses(user: User, conn: Conn) -> list[CourseOut]:
    return [CourseOut(**c) for c in await courses.list_courses(conn, user.id)]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_course(body: CourseCreate, user: User, conn: Conn) -> CourseOut:
    if not body.code:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Course code is required")
    try:
        return CourseOut(**await courses.create_course(conn, user.id, body.code, body.title))
    except courses.DuplicateCourse as exc:
        raise _duplicate(str(exc)) from exc


@router.patch("/{course_id}")
async def update_course(course_id: UUID, body: CourseUpdate, user: User, conn: Conn) -> CourseOut:
    fields = body.model_dump(exclude_unset=True)
    if "code" in fields and not fields["code"]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Course code is required")
    try:
        course = await courses.update_course(conn, user.id, course_id, fields)
    except courses.DuplicateCourse as exc:
        raise _duplicate(str(exc)) from exc
    if course is None:
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
    """FR-CRS-03: the app asks whether to delete the course's documents or move them to Unfiled."""
    paths = await courses.delete_course(
        conn, user.id, course_id, documents == "delete", settings.timezone
    )
    if paths is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    await storage.remove(paths)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
