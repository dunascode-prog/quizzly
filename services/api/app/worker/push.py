"""`send_push` job: Expo push for a notification (FR-NOTIF-03), then a receipt check that drops
tokens Expo says are dead (`DeviceNotRegistered`)."""

import logging
from datetime import time, timedelta
from uuid import UUID

import httpx
from psycopg import AsyncConnection

from app.core.config import get_settings
from app.domain.notifications import PUSH_TOGGLE
from app.worker import queue

log = logging.getLogger("quizzly.push")

SEND_URL = "https://exp.host/--/api/v2/push/send"
RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
RECEIPT_DELAY = timedelta(minutes=15)  # Expo's receipts are ready after a few minutes

_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        token = get_settings().expo_access_token
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        _client = httpx.AsyncClient(timeout=30, headers=headers)
    return _client


def in_quiet_hours(now: time, start: time, end: time) -> bool:
    """Quiet hours may wrap midnight (default 23:00–07:00)."""
    if start == end:
        return False
    return start <= now < end if start < end else now >= start or now < end


async def send_push(conn: AsyncConnection, job: dict) -> None:
    payload = job["payload"]
    if "receipts" in payload:
        await _check_receipts(conn, payload["receipts"])
        return
    n = await (
        await conn.execute(
            """
            select n.id, n.user_id, n.type::text as type, n.title, n.body, n.target, n.read_at,
                   s.types, s.quiet_start, s.quiet_end,
                   (now() at time zone p.timezone)::time as local_time
            from notifications n
            join profiles p on p.id = n.user_id and p.deleted_at is null
            left join notification_settings s on s.user_id = n.user_id
            where n.id = %s
            """,
            (UUID(payload["notification_id"]),),
        )
    ).fetchone()
    if n is None or n["read_at"] is not None:
        return  # deleted, or already seen in the app
    toggle = PUSH_TOGGLE.get(n["type"])
    if toggle and not (n["types"] or {}).get(toggle, toggle != "mates"):
        return  # turned off in Reminders (FR-HAB-08); coursemate pushes are off by default
    if n["quiet_start"] and in_quiet_hours(n["local_time"], n["quiet_start"], n["quiet_end"]):
        return  # never in quiet hours; the inbox still has it
    tokens = [
        r["expo_token"]
        for r in await (
            await conn.execute(
                "select expo_token from push_tokens where user_id = %s", (n["user_id"],)
            )
        ).fetchall()
    ]
    if not tokens:
        return
    messages = [
        {
            "to": t,
            "title": n["title"],
            "body": n["body"] or "",
            "sound": "default",
            "data": {"notification_id": str(n["id"]), "target": n["target"]},
        }
        for t in tokens
    ]
    r = await client().post(SEND_URL, json=messages)
    r.raise_for_status()  # the queue retries
    tickets = r.json().get("data", [])
    await conn.execute("update notifications set push_sent_at = now() where id = %s", (n["id"],))
    receipts: dict[str, str] = {}
    dead: list[str] = []
    for token, ticket in zip(tokens, tickets, strict=False):
        if ticket.get("status") == "ok" and ticket.get("id"):
            receipts[ticket["id"]] = token
        elif (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
            dead.append(token)
    await _drop(conn, dead)
    if receipts:
        await queue.enqueue(
            conn, "send_push", {"receipts": receipts}, user_id=n["user_id"], run_after=RECEIPT_DELAY
        )


async def _check_receipts(conn: AsyncConnection, receipts: dict[str, str]) -> None:
    r = await client().post(RECEIPTS_URL, json={"ids": list(receipts)})
    r.raise_for_status()
    results = r.json().get("data", {})
    dead = [
        receipts[ticket_id]
        for ticket_id, res in results.items()
        if res.get("status") == "error"
        and (res.get("details") or {}).get("error") == "DeviceNotRegistered"
        and ticket_id in receipts
    ]
    await _drop(conn, dead)


async def _drop(conn: AsyncConnection, tokens: list[str]) -> None:
    if tokens:
        await conn.execute("delete from push_tokens where expo_token = any(%s)", (tokens,))
        log.info("removed %d dead push tokens", len(tokens))
