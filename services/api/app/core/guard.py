"""Every signed-in request passes here (FR-SEC-20/21, FR-LIM-04..06): a per-student rate limit,
paused accounts are refused, and the student's effective plan is worked out from their plan and
this month's AI spend. One database round trip; the counter commits on its own (autocommit), so a
request that fails later still counts."""

import dataclasses
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from psycopg import AsyncConnection

from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.core.db import get_conn
from app.domain import plans

RATE_LIMITED = "Too many requests. Wait a minute and try again."
SETUP_FIRST = "Finish setting up your profile first."
# Before onboarding is finished an account may only set itself up (FR-SEC-25): everything that
# costs money (uploads, AI, sharing) waits, so accounts made straight through the Supabase API
# can't skip the email checks at onboarding.
SETUP_ROUTES = {
    ("GET", "/v1/me"),
    ("PATCH", "/v1/me"),
    ("DELETE", "/v1/me"),
    ("PUT", "/v1/me/avatar"),
    ("DELETE", "/v1/me/avatar"),
    ("GET", "/v1/institutions"),
    ("GET", "/v1/me/settings"),
    ("PATCH", "/v1/me/settings"),
    ("GET", "/v1/me/notification-settings"),
    ("POST", "/v1/referrals"),
}
PAUSED = (
    "Your account is paused while we look into unusual activity. "
    "If you think this is a mistake, contact Quizzly support."
)


async def check(conn: AsyncConnection, user_id: UUID, settings) -> tuple[str | None, str]:
    """Counts this request. Returns the problem ("paused", "rate_limited", "setup" or None to go
    ahead) and the student's effective plan."""
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
                   coalesce(p.suspended_at is not null, false) as paused,
                   coalesce(p.terms_accepted_at is not null and p.level is not null, false)
                     as onboarded,
                   p.plan::text as plan,
                   (p.plan_expires_at is null or p.plan_expires_at > now()) as active,
                   coalesce((select s.micro_usd from ai_spend s
                             where s.user_id = %(user)s
                               and s.month = date_trunc('month', now())::date), 0) as spent_micro
            from (select 1) one
            left join profiles p on p.id = %(user)s
            """,
            {"key": f"user:{user_id}", "user": user_id},
        )
    ).fetchone()
    plan = plans.effective(settings, row if row["plan"] else None)
    if row["paused"]:
        return "paused", plan
    if row["count"] > settings.requests_per_minute:
        return "rate_limited", plan
    if not row.get("onboarded", True):
        return "setup", plan
    return None, plan


async def guarded_user(
    request: Request,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    conn: Annotated[AsyncConnection, Depends(get_conn)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser:
    problem, plan = await check(conn, user.id, settings)
    # A paused student can still delete their account (FR-AUTH-05).
    if problem == "paused" and not (request.method == "DELETE" and request.url.path == "/v1/me"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, PAUSED)
    if problem == "setup" and (request.method, request.url.path) not in SETUP_ROUTES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, SETUP_FIRST)
    if problem == "rate_limited":
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, RATE_LIMITED, headers={"Retry-After": "60"}
        )
    return dataclasses.replace(user, plan=plan)


async def delete_old(conn: AsyncConnection) -> int:
    """Counters older than an hour are no use; the worker clears them hourly."""
    cur = await conn.execute(
        "delete from rate_limits where window_start < now() - interval '1 hour'"
    )
    return cur.rowcount
