import logging
from typing import Annotated, Any, Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator

from app.api.deps import AppSettings, Conn, StorageDep, User
from app.core import auth_admin
from app.core.auth import CurrentUser
from app.domain import accounts
from app.worker import queue

log = logging.getLogger("quizzly.api")

router = APIRouter()

Level = Literal["100L", "200L", "300L", "400L", "500L", "600L", "700L", "other"]


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


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    institution_id: UUID | None = None
    institution_other: str | None = Field(default=None, max_length=160)
    department: str | None = Field(default=None, max_length=120)
    level: Level | None = None
    accept_terms: bool = False

    @field_validator("full_name", "institution_other", "department")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() or None if v is not None else None


def _me(user: CurrentUser, profile: dict[str, Any] | None) -> MeOut:
    if profile is None:
        return MeOut(id=user.id, email=user.email)
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
    )


@router.get("/healthz", tags=["ops"])
async def healthz() -> dict:
    return {"status": "ok"}


@router.get("/v1/me", tags=["account"])
async def me(user: User, conn: Conn) -> MeOut:
    return _me(user, await accounts.get_profile(conn, user.id))


@router.patch("/v1/me", tags=["account"])
async def update_me(
    body: ProfileUpdate,
    user: User,
    conn: Conn,
    settings: AppSettings,
) -> MeOut:
    fields = body.model_dump(exclude_unset=True, exclude={"accept_terms"})
    # A listed school and a typed-in one are alternatives; setting one clears the other.
    if fields.get("institution_id"):
        if not await accounts.institution_exists(conn, fields["institution_id"]):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown institution")
        fields["institution_other"] = None
    elif fields.get("institution_other"):
        fields["institution_id"] = None
    terms_version = settings.terms_version if body.accept_terms else None
    return _me(user, await accounts.update_profile(conn, user.id, fields, terms_version))


@router.delete("/v1/me", status_code=status.HTTP_204_NO_CONTENT, tags=["account"])
async def delete_me(user: User, conn: Conn, storage: StorageDep, settings: AppSettings) -> Response:
    """Deletes the account and everything only this student owns (FR-AUTH-05, NDPA). Files
    Storage can't remove right now are retried by the worker, well within the 24 h allowed."""
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
    rows = await accounts.search_institutions(conn, q, limit)
    return [InstitutionOut(**row) for row in rows]
