"""Inbox, read state and push tokens (FR-NOTIF-03..05, 07)."""

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field

from app.api.deps import Conn, User
from app.domain import notifications

router = APIRouter(tags=["notifications"])

# Expo push tokens look like ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx].
EXPO_TOKEN = r"^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,100}\]$"


class NotificationOut(BaseModel):
    id: UUID
    type: str
    title: str
    body: str | None
    target: dict[str, Any]
    read_at: datetime | None
    created_at: datetime
    actor_id: UUID | None  # for "Block" (FR-SHARE-09)
    actor_name: str | None  # display name only ("Ada O.")


class InboxOut(BaseModel):
    notifications: list[NotificationOut]
    unread: int


class IdsIn(BaseModel):
    ids: list[UUID] = Field(min_length=1, max_length=100)


class PushTokenIn(BaseModel):
    token: str = Field(pattern=EXPO_TOKEN, max_length=120)
    platform: Literal["android", "ios"]


@router.get("/v1/notifications")
async def list_notifications(
    user: User,
    conn: Conn,
    before: Annotated[datetime | None, Query()] = None,
    after: Annotated[datetime | None, Query()] = None,
    filter: Annotated[Literal["all", "shared", "study"], Query()] = "all",
) -> InboxOut:
    """Newest first, 30 at a time: `before` pages back; `after` fetches what Realtime may have
    missed while the app was offline (FR-NOTIF-07)."""
    data = await notifications.inbox(conn, user.id, before=before, kind=filter, after=after)
    return InboxOut(**data)


@router.post("/v1/notifications/read", status_code=status.HTTP_204_NO_CONTENT)
async def read(body: IdsIn, user: User, conn: Conn) -> Response:
    """Marks these notifications read; ids that aren't the student's are ignored (FR-NOTIF-05)."""
    await notifications.mark_read(conn, user.id, body.ids)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/v1/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def read_all(user: User, conn: Conn) -> Response:
    """Marks every notification read."""
    await notifications.mark_all_read(conn, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/v1/push-tokens", status_code=status.HTTP_204_NO_CONTENT)
async def save_push_token(body: PushTokenIn, user: User, conn: Conn) -> Response:
    """Registers this device's Expo push token after sign-in. A token moves with its
    device, so it now belongs to this account."""
    await notifications.save_push_token(conn, user.id, body.token, body.platform)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/v1/push-tokens/{token}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_push_token(token: str, user: User, conn: Conn) -> Response:
    """Forgets this device's push token, e.g. on sign-out."""
    await notifications.delete_push_token(conn, user.id, token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
