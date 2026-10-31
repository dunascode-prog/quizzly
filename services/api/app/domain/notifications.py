"""Notifications (FR-NOTIF-01, 04..07). Rows are written only here, server side; the app reads
its own through RLS and Realtime, and can only mark them read through the API."""

import json
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

from app.domain import avatars
from app.worker import queue

PUSH_AT_MOST_EVERY = timedelta(hours=1)  # per notification row: batching (FR-NOTIF-06)
KEEP_FOR = timedelta(days=90)
PAGE = 30

# Inbox filters (screen 22): "Shared with me" and "Study".
SHARED_TYPES = (
    "course_shared",
    "shared_course_updated",
    "share_revoked",
    "share_member_joined",
    "course_unavailable",
)
STUDY_TYPES = (
    "document_ready",
    "document_failed",
    "quiz_ready",
    "recap_ready",
    "reminder_exam",
    "reminder_due",
    "invite_joined",
)

# Which notification_settings.types toggle (FR-HAB-08) allows a push. Types not listed always
# push: things done to the student's own shares and courses.
PUSH_TOGGLE = {
    "document_ready": "ready",
    "document_failed": "ready",
    "quiz_ready": "ready",
    "recap_ready": "recap",
    "reminder_exam": "exam",
    "reminder_due": "due",
    "share_member_joined": "mates",
    "invite_joined": "mates",
}


async def notify(
    conn: AsyncConnection,
    user_id: UUID,
    type_: str,
    title: str,
    body: str | None = None,
    target: dict[str, Any] | None = None,
    actor_id: UUID | None = None,
    dedupe_key: str | None = None,
    push: bool = True,
) -> UUID:
    """One inbox row per event. The same `dedupe_key` while still unread updates that row
    ("Kemi added 3 notes to MTH 201") instead of adding another, and pushes at most once an hour
    (FR-NOTIF-06). Realtime delivers inserts and updates to the open app."""
    row = await (
        await conn.execute(
            """
            insert into notifications (user_id, type, actor_id, title, body, target, dedupe_key)
            values (%s, %s, %s, %s, %s, %s, %s)
            on conflict (user_id, dedupe_key) where read_at is null and dedupe_key is not null
            do update set type = excluded.type, actor_id = excluded.actor_id,
                          title = excluded.title, body = excluded.body, target = excluded.target,
                          created_at = now()
            returning id, push_sent_at
            """,
            (user_id, type_, actor_id, title, body, json.dumps(target or {}), dedupe_key),
        )
    ).fetchone()
    last: datetime | None = row["push_sent_at"]
    if push and (last is None or datetime.now(last.tzinfo) - last >= PUSH_AT_MOST_EVERY):
        await queue.enqueue(
            conn,
            "send_push",
            {"notification_id": str(row["id"])},
            user_id=user_id,
            dedupe_key=f"push:{row['id']}",
        )
    return row["id"]


async def inbox(
    conn: AsyncConnection,
    user_id: UUID,
    before: datetime | None = None,
    kind: str = "all",
    after: datetime | None = None,
) -> dict[str, Any]:
    """Newest first, 30 at a time (`before` pages back). `after` is the catch-up fetch after a
    reconnect: everything newer than the last row the app has (FR-NOTIF-07)."""
    types = {"shared": list(SHARED_TYPES), "study": list(STUDY_TYPES)}.get(kind)
    rows = await (
        await conn.execute(
            f"""
            select n.id, n.type::text as type, n.title, n.body, n.target, n.read_at,
                   n.created_at, n.actor_id, p.display_name as actor_name,
                   {avatars.shown_path_sql("%(u)s")} as actor_avatar_path
            from notifications n left join profiles p on p.id = n.actor_id
            where n.user_id = %(u)s
              and (%(before)s::timestamptz is null or n.created_at < %(before)s)
              and (%(after)s::timestamptz is null or n.created_at > %(after)s)
              and (%(types)s::text[] is null or n.type::text = any(%(types)s))
            order by n.created_at desc
            limit %(n)s
            """,
            {"u": user_id, "before": before, "after": after, "types": types, "n": PAGE},
        )
    ).fetchall()
    unread = await (
        await conn.execute(
            "select count(*) as n from notifications where user_id = %s and read_at is null",
            (user_id,),
        )
    ).fetchone()
    return {"notifications": rows, "unread": unread["n"]}


async def mark_read(conn: AsyncConnection, user_id: UUID, ids: list[UUID]) -> None:
    """`read_at` is the only thing a student can change on a notification (FR-NOTIF-05)."""
    await conn.execute(
        "update notifications set read_at = now() "
        "where user_id = %s and id = any(%s) and read_at is null",
        (user_id, ids),
    )


async def mark_all_read(conn: AsyncConnection, user_id: UUID) -> None:
    await conn.execute(
        "update notifications set read_at = now() where user_id = %s and read_at is null",
        (user_id,),
    )


async def delete_old(conn: AsyncConnection) -> int:
    rows = await (
        await conn.execute(
            "delete from notifications where created_at < now() - %s returning id", (KEEP_FOR,)
        )
    ).fetchall()
    return len(rows)


async def save_push_token(conn: AsyncConnection, user_id: UUID, token: str, platform: str) -> None:
    """A device registers its Expo push token after sign-in. A token moves with its device: if
    another account signed in there before, it now belongs to this one."""
    await conn.execute(
        """
        insert into push_tokens (user_id, expo_token, platform) values (%s, %s, %s)
        on conflict (expo_token) do update set user_id = excluded.user_id,
          platform = excluded.platform, last_seen_at = now()
        """,
        (user_id, token, platform),
    )


async def delete_push_token(conn: AsyncConnection, user_id: UUID, token: str) -> None:
    """On sign-out, so the device stops getting this student's pushes."""
    await conn.execute(
        "delete from push_tokens where user_id = %s and expo_token = %s", (user_id, token)
    )
