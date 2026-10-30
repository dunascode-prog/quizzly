"""Profile and institution queries (FR-AUTH-03, FR-PROF-01/02)."""

from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

from app.domain import documents, sharing

_PROFILE_SQL = """
select p.full_name, p.institution_id, p.institution_other, p.department, p.level,
       p.explanation_style::text as explanation_style, p.terms_accepted_at,
       p.avatar_path, p.avatar_visible, p.practice_times, p.weekly_goal_days,
       case when p.plan_expires_at is null or p.plan_expires_at > now() then p.plan::text
            else 'free' end as plan,
       i.name as institution_name, i.short_name as institution_short_name
from profiles p
left join institutions i on i.id = p.institution_id
where p.id = %s
"""

# Columns a student may change; anything else in an update is ignored.
EDITABLE = (
    "full_name",
    "institution_id",
    "institution_other",
    "department",
    "level",
    "explanation_style",
    "weekly_goal_days",
    "avatar_visible",
    "practice_times",
)

# FR-PROF-06: the Daily 5 reminder goes just before the earliest time the student practises.
PRACTICE_REMINDER = {"commute": "06:45", "lectures": "11:50", "evening": "17:45", "night": "21:45"}
DEFAULT_REMINDER = "19:30"


def reminder_for(practice_times: list[str], quiet_start: str, quiet_end: str) -> str:
    """The earliest chosen time, moved out of quiet hours (to their end) if it falls inside."""
    times = sorted(PRACTICE_REMINDER[t] for t in practice_times if t in PRACTICE_REMINDER)
    at = times[0] if times else DEFAULT_REMINDER
    start, end = quiet_start[:5], quiet_end[:5]
    quiet = (start <= at or at < end) if start > end else (start <= at < end)
    return end if quiet else at


async def apply_practice_times(conn: AsyncConnection, user_id: UUID, times: list[str]) -> None:
    """Sets the reminder time from practice times, unless the student chose one in Reminders."""
    await conn.execute(
        "insert into notification_settings (user_id) values (%s) on conflict do nothing", (user_id,)
    )
    row = await (
        await conn.execute(
            "select quiet_start::text as qs, quiet_end::text as qe, daily_reminder_custom "
            "from notification_settings where user_id = %s",
            (user_id,),
        )
    ).fetchone()
    if row["daily_reminder_custom"]:
        return
    await conn.execute(
        "update notification_settings set daily_reminder_time = %s, updated_at = now() "
        "where user_id = %s",
        (reminder_for(times, row["qs"], row["qe"]), user_id),
    )


async def get_profile(conn: AsyncConnection, user_id: UUID) -> dict[str, Any] | None:
    cur = await conn.execute(_PROFILE_SQL, (user_id,))
    return await cur.fetchone()


async def update_profile(
    conn: AsyncConnection, user_id: UUID, fields: dict[str, Any], terms_version: str | None
) -> dict[str, Any] | None:
    """Upserts the profile so a missing row (e.g. trigger skipped) never blocks onboarding."""
    values = {k: v for k, v in fields.items() if k in EDITABLE}
    if terms_version:
        values["terms_version"] = terms_version
    cols = list(values)
    placeholders = ["%s"] * len(cols)
    if terms_version:
        cols.append("terms_accepted_at")
        placeholders.append("now()")
    if cols:
        await conn.execute(
            f"insert into profiles (id, {', '.join(cols)}) values (%s, {', '.join(placeholders)}) "
            f"on conflict (id) do update set {', '.join(f'{c} = excluded.{c}' for c in cols)}",
            (user_id, *values.values()),
        )
    return await get_profile(conn, user_id)


async def institution_exists(conn: AsyncConnection, institution_id: UUID) -> bool:
    cur = await conn.execute("select 1 from institutions where id = %s", (institution_id,))
    return await cur.fetchone() is not None


async def search_institutions(conn: AsyncConnection, query: str, limit: int) -> list[dict]:
    """Matches short names by prefix ("UNILAG") and full names by substring or similarity."""
    q = query.strip()
    like = q.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
    if not q:
        cur = await conn.execute(
            "select id, name, short_name, type::text as type, state from institutions "
            "order by name limit %s",
            (limit,),
        )
        return await cur.fetchall()
    cur = await conn.execute(
        """
        select id, name, short_name, type::text as type, state from institutions
        where short_name ilike %(prefix)s or name ilike %(contains)s or name %% %(q)s
        order by (lower(short_name) = lower(%(q)s)) desc,
                 (short_name ilike %(prefix)s) desc,
                 greatest(similarity(name, %(q)s), similarity(coalesce(short_name, ''), %(q)s))
                   desc,
                 name
        limit %(limit)s
        """,
        {"q": q, "prefix": f"{like}%", "contains": f"%{like}%", "limit": limit},
    )
    return await cur.fetchall()


async def delete_account_data(conn: AsyncConnection, user_id: UUID) -> list[str]:
    """Deletes every document of the student and the processed files no one else uses
    (FR-AUTH-05). Returns the Storage paths to remove. The rest of their rows go with the
    auth user (cascade)."""
    async with conn.transaction():
        await sharing.end_all_for_owner(conn, user_id)  # members are told (FR-AUTH-05)
        rows = await (
            await conn.execute(
                "delete from documents where user_id = %s returning upload_path, source_file_id",
                (user_id,),
            )
        ).fetchall()
        return await documents.release(conn, rows)


async def plan_of(conn: AsyncConnection, user_id: UUID | None) -> str:
    """The student's plan right now (FR-LIM-04): a lapsed paid plan counts as free."""
    if user_id is None:
        return "free"
    row = await (
        await conn.execute(
            "select plan::text as plan from profiles where id = %s "
            "and (plan_expires_at is null or plan_expires_at > now())",
            (user_id,),
        )
    ).fetchone()
    return row["plan"] if row else "free"
