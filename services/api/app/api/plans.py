"""Plans and Google Play subscriptions (FR-PLAN-01..03, FR-LIM-04..06)."""

import base64
import hmac
import json
import logging
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field

from app.api.deps import AppSettings, Conn, User
from app.core.config import Settings, get_settings
from app.core.play import PlayBilling, PlayError
from app.domain import invites, plans

log = logging.getLogger("quizzly.api")
router = APIRouter(tags=["plans"])

NOT_READY = "Payments aren't available yet. Free stays free in the meantime."
NOT_FOUND = "We couldn't find that purchase. If you were charged, contact Quizzly support."
NOT_YOURS = "This purchase belongs to another account."
NO_OFFER = "The invite price is for students who unlocked it with 5 credits."

_play: PlayBilling | None = None


def get_play(settings: Annotated[Settings, Depends(get_settings)]) -> PlayBilling:
    global _play
    if _play is None:
        _play = PlayBilling(settings)
    return _play


Play = Annotated[PlayBilling, Depends(get_play)]


class Limits(BaseModel):
    upload: int
    question_set: int
    explanation: int
    chat_message: int
    marking: int


class PlanOut(BaseModel):
    id: Literal["free", "student", "premium"]
    price_usd: float  # per month; Google Play shows the local price at checkout
    discounted_price_usd: float | None  # with the invite reward (FR-INV-05)
    limits: Limits  # per day
    storage_mb: int
    monthly_ai_usd: float  # the fair-use AI allowance (FR-LIM-06)
    extras: list[str]
    quiz_sizes: list[int]  # free: 5 and 10 only (FR-PLAN-04)
    trial_days: int | None  # Student: a free trial run by Google Play (FR-PLAN-06)
    product_id: str | None  # the Google Play product to buy


class PlansOut(BaseModel):
    current: Literal["free", "student", "premium"]  # the plan they pay for
    expires_at: datetime | None
    # What they may use now: a paid plan over its allowance uses free limits; capped = no new AI.
    effective: Literal["free", "student", "premium", "capped"]
    discount_percent: int | None  # set when 5 credits unlocked the invite reward
    invite_offer_id: str | None  # the Play offer to apply when the discount is unlocked
    payments_ready: bool
    plans: list[PlanOut]


@router.get("/v1/plans")
async def list_plans(user: User, conn: Conn, settings: AppSettings, play: Play) -> PlansOut:
    """Screen 32: Free, Student and Premium with their limits and prices (FR-PLAN-01)."""
    row = await plans.paid_plan(conn, user.id)
    disc = invites.DISCOUNT_PERCENT if row and row["disc"] else None
    products = {"student": settings.play_student_product, "premium": settings.play_premium_product}
    paying = row is not None and row["active"] and row["plan"] in plans.PAID
    return PlansOut(
        current=row["plan"] if paying else "free",
        expires_at=row["plan_expires_at"] if paying else None,
        effective=user.plan,
        discount_percent=disc,
        invite_offer_id=settings.play_invite_offer if disc else None,
        payments_ready=play.configured,
        plans=[
            PlanOut(**p, product_id=products.get(p["id"])) for p in plans.catalogue(settings, disc)
        ],
    )


class PurchaseIn(BaseModel):
    product_id: str = Field(max_length=100)
    purchase_token: str = Field(min_length=10, max_length=4096)


class PurchaseOut(BaseModel):
    plan: Literal["free", "student", "premium"]
    expires_at: datetime | None


@router.post("/v1/plans/purchase")
async def purchase(
    body: PurchaseIn, user: User, conn: Conn, settings: AppSettings, play: Play
) -> PurchaseOut:
    """The app sends the Play purchase token after checkout. The plan is given only after Google
    confirms the subscription, that it was bought for this account, and that the invite price was
    unlocked (FR-PLAN-03)."""
    if not play.configured:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NOT_READY)
    plan = plans.product_plan(settings, body.product_id)
    if plan is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown plan")
    owner = await plans.subscription_owner(conn, body.purchase_token)
    if owner and owner["user_id"] != user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, NOT_YOURS)
    try:
        sub = await play.subscription(body.purchase_token)
    except PlayError as exc:
        if exc.status in (400, 404, 410):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, NOT_FOUND) from exc
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "Google Play didn't answer. Try again."
        ) from exc
    # The app sets obfuscatedAccountId to the student's id at checkout; a token bought by
    # someone else (or replayed from another account) doesn't match.
    account = (sub.get("externalAccountIdentifiers") or {}).get("obfuscatedExternalAccountId")
    if account != str(user.id):
        log.warning("purchase token for another account", extra={"user": str(user.id)})
        raise HTTPException(status.HTTP_409_CONFLICT, NOT_YOURS)
    line = next(
        (li for li in sub.get("lineItems", []) if li.get("productId") == body.product_id), None
    )
    if line is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, NOT_FOUND)
    offer = (line.get("offerDetails") or {}).get("offerId")
    if offer == settings.play_invite_offer:
        row = await plans.paid_plan(conn, user.id)
        if not (row and row["disc"]):
            log.warning("invite offer used without the reward", extra={"user": str(user.id)})
            raise HTTPException(status.HTTP_403_FORBIDDEN, NO_OFFER)
    state = sub.get("subscriptionState", "")
    await plans.save_subscription(conn, user.id, body.purchase_token, plan, line, state)
    if sub.get("acknowledgementState") == "ACKNOWLEDGEMENT_STATE_PENDING":
        try:
            await play.acknowledge(body.product_id, body.purchase_token)
        except PlayError:
            log.warning("purchase not acknowledged yet; the next notification retries")
    row = await plans.paid_plan(conn, user.id)
    return PurchaseOut(plan=row["plan"], expires_at=row["plan_expires_at"])


@router.post("/v1/billing/play", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
async def play_notification(
    request: Request,
    conn: Conn,
    settings: AppSettings,
    play: Play,
    secret: Annotated[str, Query(max_length=200)] = "",
) -> Response:
    """Google Play Real-time Developer Notifications through a Pub/Sub push subscription
    (FR-PLAN-03): renewals, cancellations and expiries re-read the subscription from Google;
    refunds and voided purchases remove the plan at once. Answers 204 for anything it can't use,
    so Pub/Sub doesn't retry forever; 502 when Google can't be reached, so it does."""
    if not settings.play_rtdn_secret or not hmac.compare_digest(secret, settings.play_rtdn_secret):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")
    try:
        envelope = await request.json()
        data = json.loads(base64.b64decode(envelope["message"]["data"]))
    except (ValueError, KeyError, TypeError):
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    voided = data.get("voidedPurchaseNotification")
    note = data.get("subscriptionNotification")
    token = (voided or note or {}).get("purchaseToken")
    owner = await plans.subscription_owner(conn, token) if token else None
    if owner is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)  # not a purchase we gave a plan for
    if voided:
        await plans.void(conn, owner["user_id"], token)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    try:
        sub = await play.subscription(token)
    except PlayError as exc:
        if exc.status in (400, 404, 410):
            await plans.revoke(conn, owner["user_id"], token)
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Play unavailable") from exc
    line = next(iter(sub.get("lineItems", [])), {})
    await plans.save_subscription(
        conn, owner["user_id"], token, owner["plan"], line, sub.get("subscriptionState", "")
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
