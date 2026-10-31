"""Daily per-student limits (FR-LIM-01). Days roll over at midnight in the student's own time zone
(FR-PROF-08), falling back to the app's; a time zone can change only once a week.

Plan allowances (uploads, quiz sets, explanations, chat, marking) roll over (FR-LIM-08): each day
adds one day's allowance to a bank and unused allowance carries forward, up to a week's worth. Other
counters (shares, reminders, photo changes) stay strictly per day."""

from uuid import UUID

from psycopg import AsyncConnection

_TODAY = (
    "(now() at time zone coalesce("
    "(select timezone from profiles where id = %(user)s), %(tz)s))::date"
)


ROLLOVER = ("upload", "question_set", "explanation", "chat_message", "marking")
ROLLOVER_DAYS = 7  # the bank holds at most a week's worth


async def take(
    conn: AsyncConnection, user_id: UUID, resource: str, limit: int, tz: str
) -> int | float | None:
    """Uses one unit atomically. Returns what's left (or, for daily counters, the count after
    using it), or None when nothing is left."""
    if resource in ROLLOVER:
        left = await _take_banked(conn, user_id, resource, limit, tz)
        if left is None:
            await _hit(conn, user_id, resource, tz)
        else:
            await _count(conn, user_id, resource, tz)  # today's use, for "used today"
        return left
    row = await (
        await conn.execute(
            f"""
            insert into usage_counters (user_id, day, resource, count)
            values (%(user)s, {_TODAY}, %(resource)s, 1)
            on conflict (user_id, day, resource) do update set count = usage_counters.count + 1
            where usage_counters.count < %(limit)s
            returning count
            """,
            {"user": user_id, "resource": resource, "limit": limit, "tz": tz},
        )
    ).fetchone()
    return row["count"] if row else None


async def give_back(conn: AsyncConnection, user_id: UUID, resource: str, n: int, tz: str) -> None:
    """Returns n units to today's allowance (never below zero), e.g. a deleted upload."""
    if n <= 0:
        return
    if resource in ROLLOVER:
        await conn.execute(
            "update allowances set balance = least(balance + %(n)s, daily * %(cap_days)s) "
            "where user_id = %(user)s and resource = %(resource)s",
            {"n": n, "user": user_id, "resource": resource, "cap_days": ROLLOVER_DAYS},
        )
    await conn.execute(
        f"update usage_counters set count = greatest(count - %(n)s, 0) "
        f"where user_id = %(user)s and day = {_TODAY} and resource = %(resource)s",
        {"user": user_id, "resource": resource, "n": n, "tz": tz},
    )


async def used_today(conn: AsyncConnection, user_id: UUID, tz: str) -> dict[str, int]:
    rows = await (
        await conn.execute(
            f"select resource::text as resource, count from usage_counters "
            f"where user_id = %(user)s and day = {_TODAY}",
            {"user": user_id, "tz": tz},
        )
    ).fetchall()
    return {r["resource"]: r["count"] for r in rows}


# The bank after today's top-up: days since the last top-up add that many days' allowance, an
# upgrade adds the difference at once, and it never holds more than ROLLOVER_DAYS' worth.
_TOPPED_UP = (
    "least(%(daily)s * %(cap_days)s, allowances.balance"
    f" + ({_TODAY} - allowances.day) * %(daily)s"
    " + greatest(%(daily)s - allowances.daily, 0))"
)


async def _take_banked(
    conn: AsyncConnection, user_id: UUID, resource: str, daily: int, tz: str
) -> float | None:
    if daily < 1:
        return None  # nothing allowed (e.g. a free account over its monthly AI allowance)
    row = await (
        await conn.execute(
            f"""
            insert into allowances (user_id, resource, balance, daily, day)
            values (%(user)s, %(resource)s, %(daily)s - 1, %(daily)s, {_TODAY})
            on conflict (user_id, resource) do update
              set balance = {_TOPPED_UP} - 1, daily = %(daily)s, day = {_TODAY}
              where {_TOPPED_UP} >= 1
            returning balance
            """,
            {
                "user": user_id,
                "resource": resource,
                "daily": daily,
                "cap_days": ROLLOVER_DAYS,
                "tz": tz,
            },
        )
    ).fetchone()
    return float(row["balance"]) if row else None


async def _count(conn: AsyncConnection, user_id: UUID, resource: str, tz: str) -> None:
    await conn.execute(
        f"""
        insert into usage_counters (user_id, day, resource, count)
        values (%(user)s, {_TODAY}, %(resource)s, 1)
        on conflict (user_id, day, resource) do update set count = usage_counters.count + 1
        """,
        {"user": user_id, "resource": resource, "tz": tz},
    )


async def _hit(conn: AsyncConnection, user_id: UUID, resource: str, tz: str) -> None:
    """Records a day the student ran out (FR-PLAN-05)."""
    await conn.execute(
        "insert into limit_hits (user_id, day, resource) "
        f"values (%(user)s, {_TODAY}, %(resource)s) on conflict do nothing",
        {"user": user_id, "resource": resource, "tz": tz},
    )


async def remaining(
    conn: AsyncConnection, user_id: UUID, resource: str, daily: int, tz: str
) -> float:
    """What's in the bank right now, including today's top-up, without using any."""
    row = await (
        await conn.execute(
            f"select {_TOPPED_UP} as left from allowances "
            "where user_id = %(user)s and resource = %(resource)s",
            {
                "user": user_id,
                "resource": resource,
                "daily": daily,
                "cap_days": ROLLOVER_DAYS,
                "tz": tz,
            },
        )
    ).fetchone()
    return float(row["left"]) if row else float(daily)
