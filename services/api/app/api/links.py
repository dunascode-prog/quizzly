"""Public routes for the website's link pages and iPhone waitlist (FR-INV-02, FR-INV-06). No token:
visitors aren't signed in. Each IP gets the same per-minute limit as share-link lookups."""

import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from pydantic import BaseModel, Field

from app.api.deps import AppSettings, Conn
from app.api.sharing import _rate_limit
from app.core.config import Settings, get_settings
from app.core.mailer import Mailer
from app.domain import emails, links

router = APIRouter(tags=["links"], dependencies=[Depends(_rate_limit)])

DISPOSABLE = "Use your usual email address. Temporary email addresses can't be used for Quizzly."
BAD_EMAIL = "Check your email address."
EXPIRED = "This link has expired or was already used. Join the waitlist again to get a new one."
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_mailer: Mailer | None = None


def get_mailer(settings: Annotated[Settings, Depends(get_settings)]) -> Mailer:
    global _mailer
    if _mailer is None:
        _mailer = Mailer(settings)
    return _mailer


MailerDep = Annotated[Mailer, Depends(get_mailer)]


class PersonOut(BaseModel):
    # All null when they turned off "Show my name on invite links".
    name: str | None  # first name only
    institution: str | None
    level: str | None


class InviteOut(BaseModel):
    inviter: PersonOut | None  # null for an unknown code: the page shows no card (FRD §4)


class ShareLinkOut(BaseModel):
    status: Literal["active", "gone", "taken_down", "unknown"]
    owner: str | None = None  # first name, or null when hidden
    institution: str | None = None
    level: str | None = None
    course_code: str | None = None
    title: str | None = None
    notes: int | None = None
    topics: int | None = None
    questions: int | None = None


@router.get("/v1/links/invite/{code}")
async def invite_link(code: Annotated[str, Path(max_length=20)], conn: Conn) -> InviteOut:
    """What `/i/{code}` shows about the person who invited them."""
    who = await links.invite(conn, code)
    return InviteOut(inviter=PersonOut(**who) if who else None)


@router.get("/v1/links/share/{code}")
async def share_link(code: Annotated[str, Path(max_length=20)], conn: Conn) -> ShareLinkOut:
    """What `/c/{code}` shows about a shared course. A stopped or replaced link is `gone` (with
    the owner's first name, so the page can say who to ask); a removed course is `taken_down`."""
    data = await links.share(conn, code)
    return ShareLinkOut(**data) if data else ShareLinkOut(status="unknown")


class WaitlistIn(BaseModel):
    email: str = Field(max_length=254)
    consent: Literal[True]  # the "Email me when Quizzly is on iPhone" box (NDPA)
    invite_code: str | None = Field(default=None, max_length=20)


class ConfirmIn(BaseModel):
    token: str = Field(min_length=20, max_length=100)


@router.post("/v1/waitlist", status_code=status.HTTP_202_ACCEPTED)
async def join_waitlist(
    body: WaitlistIn, conn: Conn, settings: AppSettings, mailer: MailerDep
) -> Response:
    """Sends a confirmation email (double opt-in). The answer is the same whether or not the
    address was already on the list, so it can't be used to check who signed up."""
    email = body.email.strip()
    if not EMAIL.match(email):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, BAD_EMAIL)
    if emails.is_disposable(email):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, DISPOSABLE)
    token = await links.join_waitlist(conn, email, body.invite_code)
    if token:
        link = f"https://{settings.invite_domain}/waitlist/confirm?token={token}"
        await mailer.send(
            email,
            "Confirm your place on the Quizzly iPhone waitlist",
            "Tap this link to confirm you want an email when Quizzly is on iPhone:\n\n"
            f"{link}\n\nIf you didn't ask for this, ignore this email and we won't contact you.",
        )
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post("/v1/waitlist/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_waitlist(body: ConfirmIn, conn: Conn) -> Response:
    """The link in the confirmation email lands here, through `/waitlist/confirm` on the site."""
    if not await links.confirm_waitlist(conn, body.token):
        raise HTTPException(status.HTTP_404_NOT_FOUND, EXPIRED)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
