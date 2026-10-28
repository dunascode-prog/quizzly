"""Course sharing routes (FR-SHARE-01..11, FR-MOD-05)."""

import time
from collections import defaultdict, deque
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.api.deps import AppSettings, Conn, User
from app.domain import sharing

router = APIRouter(tags=["sharing"])

SHARE_LIMIT = "You've shared with 20 people today. You can share again tomorrow."
TAKEN_DOWN = "This course is no longer available."
LINK_RATE = 30  # share-link lookups per minute per IP (FR-SHARE-10)


def _gone(exc: sharing.ShareGone) -> HTTPException:
    if exc.taken_down:
        return HTTPException(status.HTTP_410_GONE, TAKEN_DOWN)
    who = exc.owner or "the person who shared it"
    return HTTPException(
        status.HTTP_410_GONE, f"This course isn't shared any more. Ask {who} for a new link."
    )


def _full(exc: sharing.ShareFull) -> HTTPException:
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        f"This shared course is full. Ask {exc.owner} to make a new one, "
        "or upload the notes yourself.",
    )


_lookups: dict[str, deque] = defaultdict(deque)


def _rate_limit(request: Request) -> None:
    """At most 30 share-link lookups a minute per IP, so codes can't be guessed in bulk. Per API
    process; enough for one instance (the link page has its own limit, D6)."""
    ip = request.client.host if request.client else "?"
    now, window = time.monotonic(), _lookups[ip]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= LINK_RATE:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many tries. Wait a minute.")
    window.append(now)


class ShareIn(BaseModel):
    user_ids: list[UUID] = Field(default=[], max_length=20)  # coursemates (quick picks)
    codes: list[str] = Field(default=[], max_length=20)  # Quizzly codes typed in


class ShareOut(BaseModel):
    code: str
    link: str
    member_count: int
    sent: int | None = None


class MemberOut(BaseModel):
    member_id: UUID
    display_name: str | None  # "Ada O.": the only name shown (FR-SHARE-07)
    status: Literal["pending", "active"]
    joined_at: datetime | None


class CoursemateOut(BaseModel):
    user_id: UUID
    display_name: str | None


class PreviewOut(BaseModel):
    member_id: UUID | None
    status: str | None
    course_id: UUID
    code: str
    accent: str = "lagoon"
    title: str | None
    owner_name: str | None
    institution: str | None
    level: str | None
    notes: int
    topics: int
    questions: int
    member_count: int | None  # null below 3 (FR-SHARE-04)
    own_course: bool = False


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=20)


class JoinedOut(BaseModel):
    member_id: UUID | None
    course_id: UUID


class BlockIn(BaseModel):
    user_id: UUID


class BlockedOut(BaseModel):
    user_id: UUID
    display_name: str | None
    created_at: datetime


class CourseReportIn(BaseModel):
    reason: Literal["copyright", "wrong", "spam", "other"]
    note: str | None = Field(default=None, max_length=500)


def _out(share: dict, settings, sent: int | None = None) -> ShareOut:
    return ShareOut(
        code=share["code"],
        link=f"https://{settings.invite_domain}/c/{share['code']}",
        member_count=share["member_count"],
        sent=sent,
    )


@router.get("/v1/courses/{course_id}/share")
async def get_share(course_id: UUID, user: User, conn: Conn, settings: AppSettings) -> ShareOut:
    try:
        share = await sharing.get_share(conn, user.id, course_id)
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found") from exc
    if share is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not shared")
    return _out(share, settings)


@router.post("/v1/courses/{course_id}/share")
async def share_course(
    course_id: UUID, body: ShareIn, user: User, conn: Conn, settings: AppSettings
) -> ShareOut:
    """Makes the share link if needed and sends the course to people in Quizzly (FR-SHARE-01)."""
    try:
        share = await sharing.share_course(
            conn,
            user.id,
            course_id,
            body.user_ids,
            body.codes,
            settings.daily_share_recipients,
            settings.timezone,
        )
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found") from exc
    except sharing.ShareLimit as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, SHARE_LIMIT) from exc
    return _out(share, settings, share["sent"])


@router.post("/v1/courses/{course_id}/share/regenerate")
async def regenerate(course_id: UUID, user: User, conn: Conn, settings: AppSettings) -> ShareOut:
    share = await sharing.regenerate(conn, user.id, course_id)
    if share is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    return _out(share, settings)


@router.post("/v1/courses/{course_id}/share/stop", status_code=status.HTTP_204_NO_CONTENT)
async def stop_sharing(course_id: UUID, user: User, conn: Conn) -> Response:
    if not await sharing.stop(conn, user.id, course_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not shared")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/v1/courses/{course_id}/members")
async def members(course_id: UUID, user: User, conn: Conn) -> list[MemberOut]:
    try:
        return [MemberOut(**m) for m in await sharing.members(conn, user.id, course_id)]
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found") from exc


@router.delete(
    "/v1/courses/{course_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_member(course_id: UUID, member_id: UUID, user: User, conn: Conn) -> Response:
    if not await sharing.remove_member(conn, user.id, course_id, member_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not shared")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/v1/courses/{course_id}/report", status_code=status.HTTP_204_NO_CONTENT)
async def report_course(course_id: UUID, body: CourseReportIn, user: User, conn: Conn) -> Response:
    """FR-MOD-05: 5 different members unshare a course pending review."""
    if not await sharing.report_course(conn, user.id, course_id, body.reason, body.note):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/v1/coursemates")
async def coursemates(user: User, conn: Conn) -> list[CoursemateOut]:
    return [CoursemateOut(**m) for m in await sharing.coursemates(conn, user.id)]


@router.get("/v1/shares/code/{code}")
async def preview_code(code: str, request: Request, user: User, conn: Conn) -> PreviewOut:
    """Screen 20 from a share link (FR-SHARE-04)."""
    _rate_limit(request)
    try:
        return PreviewOut(**await sharing.preview_code(conn, user.id, code))
    except sharing.ShareGone as exc:
        raise _gone(exc) from exc


@router.post("/v1/shares/join")
async def join(body: JoinIn, request: Request, user: User, conn: Conn) -> JoinedOut:
    """Add to library from a link."""
    _rate_limit(request)
    try:
        return JoinedOut(**await sharing.join(conn, user.id, body.code))
    except sharing.ShareGone as exc:
        raise _gone(exc) from exc
    except sharing.ShareFull as exc:
        raise _full(exc) from exc


@router.get("/v1/shares/{member_id}")
async def preview_invite(member_id: UUID, user: User, conn: Conn) -> PreviewOut:
    """Screen 20 for a course sent in Quizzly."""
    try:
        data = await sharing.preview_invite(conn, user.id, member_id)
    except sharing.ShareGone as exc:
        raise _gone(exc) from exc
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
    return PreviewOut(**data)


@router.post("/v1/shares/{member_id}/{action}")
async def respond(
    member_id: UUID, action: Literal["accept", "decline", "leave"], user: User, conn: Conn
) -> JoinedOut:
    """Add to library / Not now / Leave course (FR-SHARE-03, 07)."""
    try:
        done = await sharing.respond(conn, user.id, member_id, action)
    except sharing.ShareGone as exc:
        raise _gone(exc) from exc
    except sharing.ShareFull as exc:
        raise _full(exc) from exc
    if done is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
    return JoinedOut(**done)


@router.get("/v1/blocks")
async def blocked(user: User, conn: Conn) -> list[BlockedOut]:
    """Privacy and blocking: the people you've blocked."""
    return [BlockedOut(**b) for b in await sharing.blocked(conn, user.id)]


@router.delete("/v1/blocks/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unblock(user_id: UUID, user: User, conn: Conn) -> Response:
    await sharing.unblock(conn, user.id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/v1/blocks", status_code=status.HTTP_204_NO_CONTENT)
async def block(body: BlockIn, user: User, conn: Conn) -> Response:
    """FR-SHARE-09: they can't send you courses or appear as a coursemate."""
    await sharing.block(conn, user.id, body.user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
