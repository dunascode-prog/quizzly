import logging
from typing import Annotated, Any, Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field, field_validator

from app.api.deps import AppSettings, AvatarStorageDep, Conn, StorageDep, User
from app.core import auth_admin
from app.core.auth import CurrentUser
from app.domain import accounts, avatars, invites, usage
from app.worker import queue

log = logging.getLogger("quizzly.api")

router = APIRouter()

Level = Literal["100L", "200L", "300L", "400L", "500L", "600L", "700L", "other"]
PracticeTime = Literal["commute", "lectures", "evening", "night"]
BAD_PHOTO_STATUS = status.HTTP_422_UNPROCESSABLE_CONTENT


class InstitutionOut(BaseModel):
    id: UUID
    name: str
    short_name: str | None
    type: str | None = None
    state: str | None = None


class MeOut(BaseModel):
    id: UUID
    email: str | None
    full_name: str | None = None
    institution: InstitutionOut | None = None
    institution_other: str | None = None
    department: str | None = None
    level: Level | None = None
    explanation_style: str = "standard"
    terms_accepted: bool = False
    # The app keeps students out of the home screen until this is true (FR-PROF-01).
    onboarded: bool = False
    # Profile photo (FR-PROF-04): a signed URL for a week, or null for initials.
    avatar_url: str | None = None
    avatar_visible: bool = False  # "Show my photo to classmates" (FR-PROF-05)
    practice_times: list[PracticeTime] = []  # FR-PROF-06
    weekly_goal_days: int = 4  # FR-PROF-07


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    institution_id: UUID | None = None
    institution_other: str | None = Field(default=None, max_length=160)
    department: str | None = Field(default=None, max_length=120)
    level: Level | None = None
    accept_terms: bool = False
    # Profile setup v2 (docs/PROFILE_V2.md).
    explanation_style: Literal["standard", "simple", "exam"] | None = None
    weekly_goal_days: int | None = Field(default=None, ge=1, le=7)
    avatar_visible: bool | None = None
    practice_times: list[PracticeTime] | None = Field(default=None, max_length=4)

    @field_validator("full_name", "institution_other", "department")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() or None if v is not None else None


async def _me(user: CurrentUser, profile: dict[str, Any] | None, photos) -> MeOut:
    if profile is None:
        return MeOut(id=user.id, email=user.email)
    avatar_url = None
    if profile.get("avatar_path"):
        try:
            avatar_url = await photos.signed_url(profile["avatar_path"], avatars.SIGNED_SECONDS)
        except httpx.HTTPError:
            log.warning("profile photo URL unavailable")  # the app shows initials
    institution = (
        InstitutionOut(
            id=profile["institution_id"],
            name=profile["institution_name"],
            short_name=profile["institution_short_name"],
        )
        if profile["institution_id"]
        else None
    )
    terms_accepted = profile["terms_accepted_at"] is not None
    return MeOut(
        id=user.id,
        email=user.email,
        full_name=profile["full_name"],
        institution=institution,
        institution_other=profile["institution_other"],
        department=profile["department"],
        level=profile["level"],
        explanation_style=profile["explanation_style"],
        terms_accepted=terms_accepted,
        onboarded=bool(
            (institution or profile["institution_other"]) and profile["level"] and terms_accepted
        ),
        avatar_url=avatar_url,
        avatar_visible=bool(profile.get("avatar_visible")),
        practice_times=profile.get("practice_times") or [],
        weekly_goal_days=profile.get("weekly_goal_days") or 4,
    )


@router.get("/healthz", tags=["ops"])
async def healthz() -> dict:
    """Liveness check; doesn't need a token or the database."""
    return {"status": "ok"}


@router.get("/v1/me", tags=["account"])
async def me(user: User, conn: Conn, photos: AvatarStorageDep) -> MeOut:
    """The signed-in student's profile. The app keeps them in onboarding until it's complete
    (FR-PROF-01)."""
    return await _me(user, await accounts.get_profile(conn, user.id), photos)


@router.patch("/v1/me", tags=["account"])
async def update_me(
    body: ProfileUpdate,
    user: User,
    conn: Conn,
    settings: AppSettings,
    photos: AvatarStorageDep,
) -> MeOut:
    """Changes only the fields sent. A listed institution and a typed-in one are
    alternatives: setting one clears the other. `accept_terms` records the current terms."""
    fields = body.model_dump(exclude_unset=True, exclude={"accept_terms"})
    # A listed school and a typed-in one are alternatives; setting one clears the other.
    if fields.get("institution_id"):
        if not await accounts.institution_exists(conn, fields["institution_id"]):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown institution")
        fields["institution_other"] = None
    elif fields.get("institution_other"):
        fields["institution_id"] = None
    terms_version = settings.terms_version if body.accept_terms else None
    profile = await accounts.update_profile(conn, user.id, fields, terms_version)
    if "practice_times" in fields:
        await accounts.apply_practice_times(conn, user.id, fields["practice_times"])  # FR-PROF-06
    await invites.check(conn, user.id)  # finishing onboarding may credit their inviter
    return await _me(user, profile, photos)


@router.put("/v1/me/avatar", tags=["account"])
async def put_avatar(
    request: Request, user: User, conn: Conn, photos: AvatarStorageDep, settings: AppSettings
) -> MeOut:
    """Sets the profile photo (FR-PROF-04). The body is the cropped 512x512 WebP the app made
    (`Content-Type: image/webp`, at most 300 KB). The server checks and re-encodes it, which
    strips EXIF and GPS data, and names the file itself; the old photo is deleted."""
    if request.headers.get("content-type", "").split(";")[0].strip() != "image/webp":
        raise HTTPException(BAD_PHOTO_STATUS, "Send the photo as a WebP image.")
    # Counted before the work, so refused photos count too (FR-SEC-22).
    limit = settings.daily_avatar_uploads
    if await usage.take(conn, user.id, "avatar_upload", limit, settings.timezone) is None:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"You've changed your photo {limit} times today. You can change it again tomorrow.",
        )
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > avatars.MAX_BYTES:
            raise HTTPException(
                status.HTTP_413_CONTENT_TOO_LARGE,
                "That photo is too big. Try again; the app shrinks it before sending.",
            )
    try:
        clean = avatars.process(bytes(data))
    except avatars.BadPhoto as exc:
        raise HTTPException(BAD_PHOTO_STATUS, str(exc)) from exc
    path = avatars.new_path(user.id)
    await photos.upload(path, clean, "image/webp")
    old = await avatars.set_photo(conn, user.id, path)
    if old and old != path:
        try:
            await photos.remove([old])
        except httpx.HTTPError:
            log.warning("old profile photo not deleted yet")
    return await _me(user, await accounts.get_profile(conn, user.id), photos)


@router.delete("/v1/me/avatar", tags=["account"])
async def delete_avatar(user: User, conn: Conn, photos: AvatarStorageDep) -> MeOut:
    """Removes the profile photo and deletes the file (FR-PROF-04). Initials show again."""
    old = await avatars.clear_photo(conn, user.id)
    if old:
        try:
            await photos.remove([old])
        except httpx.HTTPError:
            log.warning("removed profile photo not deleted from storage yet")
    return await _me(user, await accounts.get_profile(conn, user.id), photos)


@router.delete("/v1/me", status_code=status.HTTP_204_NO_CONTENT, tags=["account"])
async def delete_me(
    user: User,
    conn: Conn,
    storage: StorageDep,
    settings: AppSettings,
    photos: AvatarStorageDep,
) -> Response:
    """Deletes the account and everything only this student owns (FR-AUTH-05, NDPA), including
    the profile photo. Files Storage can't remove right now are retried by the worker, well within
    the 24 h allowed."""
    photo = await avatars.own_path(conn, user.id)
    if photo:
        try:
            await photos.remove([photo])
        except httpx.HTTPError:
            log.warning("profile photo of a deleted account not removed yet")
    paths = await accounts.delete_account_data(conn, user.id)
    try:
        await storage.remove(paths)
    except httpx.HTTPError:
        log.warning("storage clean-up deferred for a deleted account (%d paths)", len(paths))
        await queue.enqueue(conn, "delete_account", {"storage_paths": paths})
    try:
        await auth_admin.delete_user(settings, user.id)
    except httpx.HTTPError as exc:
        log.error("auth user deletion failed: %r", exc)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "We couldn't finish deleting your account. Try again in a few minutes.",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/v1/institutions", tags=["account"])
async def institutions(
    _: User,
    conn: Conn,
    q: Annotated[str, Query(max_length=80)] = "",
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> list[InstitutionOut]:
    """Searches institutions for onboarding: short names by prefix ("UNILAG"), full names
    by substring or similarity."""
    rows = await accounts.search_institutions(conn, q, limit)
    return [InstitutionOut(**row) for row in rows]
