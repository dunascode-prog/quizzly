"""Invite link and referral claim (FR-INV-01, 03, 04; FR-AUTH-07)."""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import AppSettings, Conn, User
from app.domain import invites

router = APIRouter(tags=["invites"])


class Friend(BaseModel):
    display_name: str | None
    credited_at: datetime | None
    # counted: a credit; started: joined, studied on `study_days` of 3 days so far (FR-INV-04)
    state: Literal["counted", "started"]
    study_days: int


class NextReward(BaseModel):
    kind: Literal["lavender", "discount"]
    at: int  # credits needed
    percent: int | None = None  # for the discount


class Discount(BaseModel):
    """5 credits: 10% off Student or Premium (FR-INV-05)."""

    percent: int
    at: int
    unlocked: bool
    celebrate: bool  # show 23c once, then POST /v1/me/invite/reward-seen


class InviteOut(BaseModel):
    code: str
    link: str
    friends: list[Friend]
    credited: int
    next_reward: NextReward | None
    lavender_unlocked: bool
    discount: Discount


class ReferralIn(BaseModel):
    code: str = Field(min_length=3, max_length=20)
    # invite link, Play install referrer, or a course share link (credits the course's owner)
    channel: Literal["link", "play_referrer", "share_link"]
    # A hash of the install ID (never the raw ID): one credit per device.
    device_hash: str | None = Field(default=None, max_length=128)


class ReferralOut(BaseModel):
    # "ignored": the code isn't known; the app just carries on.
    status: Literal["pending", "credited", "ignored"]


@router.get("/v1/me/invite", tags=["account"])
async def my_invite(user: User, conn: Conn, settings: AppSettings) -> InviteOut:
    """Screen 23."""
    data = await invites.my_invite(conn, user.id, settings.invite_domain)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    return InviteOut(**data)


@router.post("/v1/me/invite/reward-seen", status_code=status.HTTP_204_NO_CONTENT, tags=["account"])
async def reward_seen(user: User, conn: Conn) -> None:
    """The app showed the discount celebration (23c); it isn't shown again."""
    await invites.mark_reward_seen(conn, user.id)


@router.post("/v1/referrals")
async def claim(body: ReferralIn, user: User, conn: Conn) -> ReferralOut:
    """The app sends the code it kept through sign-up (FR-AUTH-07). Unknown codes are ignored,
    so a bad link never blocks the new student."""
    row = await invites.claim(conn, user.id, body.code, body.channel, body.device_hash)
    if row is None:
        return ReferralOut(status="ignored")
    # A rejected self-invite looks the same as pending to the app; nothing to show either way.
    return ReferralOut(status="pending" if row["status"] == "rejected" else row["status"])
