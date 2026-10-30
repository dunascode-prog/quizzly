"""Daily per-student limits (FR-LIM-01). Days roll over at midnight in the student's own time zone
(FR-PROF-08), falling back to the app's; a time zone can change only once a week."""

from uuid import UUID

from psycopg import AsyncConnection

_TODAY = (
    "(now() at time zone coalesce("
    "(select timezone from profiles where id = %(user)s), %(tz)s))::date"
)


async def take(
    conn: AsyncConnection, user_id: UUID, resource: str, limit: int, tz: str
) -> int | None:
    """Uses one unit atomically. Returns the count after using it, or None when the limit is hit."""
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
