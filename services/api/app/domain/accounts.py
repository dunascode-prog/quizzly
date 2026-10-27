"""Profile and institution queries (FR-AUTH-03, FR-PROF-01/02)."""

from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

from app.domain import documents, sharing

_PROFILE_SQL = """
select p.full_name, p.institution_id, p.institution_other, p.department, p.level,
       p.explanation_style::text as explanation_style, p.terms_accepted_at,
       i.name as institution_name, i.short_name as institution_short_name
from profiles p
left join institutions i on i.id = p.institution_id
where p.id = %s
"""

# Columns a student may change; anything else in an update is ignored.
EDITABLE = ("full_name", "institution_id", "institution_other", "department", "level")


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
