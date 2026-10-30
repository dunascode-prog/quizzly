"""Every signed-in request passes here (FR-SEC-20/21): a per-student rate limit, and paused
accounts are refused. One database round trip; the counter commits on its own (autocommit), so a
request that fails later still counts."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from psycopg import AsyncConnection

from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.core.db import get_conn

RATE_LIMITED = "Too many requests. Wait a minute and try again."
PAUSED = (
    "Your account is paused while we look into unusual activity. "
    "If you think this is a mistake, contact Quizzly support."
)


async def check(conn: AsyncConnection, user_id: UUID, per_minute: int) -> str | None:
    """Counts this request. Returns "paused", "rate_limited" or None (go ahead)."""
    row = await (
        await conn.execute(
            """
            with hit as (
              insert into rate_limits (key, window_start)
              values (%(key)s, date_trunc('minute', now()))
              on conflict (key, window_start) do update set count = rate_limits.count + 1
              returning count
            )
            select (select count from hit) as count,
                   coalesce((select suspended_at is not null from profiles where id = %(user)s),
                            false) as paused
            """,
            {"key": f"user:{user_id}", "user": user_id},
        )
    ).fetchone()
    if row["paused"]:
        return "paused"
    if row["count"] > per_minute:
        return "rate_limited"
    return None


async def guarded_user(
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser:
    problem = await check(conn, user.id, settings.requests_per_minute)
    # A paused student can still delete their account (FR-AUTH-05).
    if problem == "paused" and not (request.method == "DELETE" and request.url.path == "/v1/me"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, PAUSED)
    if problem == "rate_limited":
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, RATE_LIMITED, headers={"Retry-After": "60"}
        )
    return user


async def delete_old(conn: AsyncConnection) -> int:
    """Counters older than an hour are no use; the worker clears them hourly."""
    cur = await conn.execute(
        "delete from rate_limits where window_start < now() - interval '1 hour'"
    )
    return cur.rowcount
