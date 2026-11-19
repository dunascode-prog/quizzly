"""Past-paper styles (FR-QGEN-09). A student's styles are theirs alone, like their past papers."""

from uuid import UUID

from psycopg import AsyncConnection

_SELECT = """
select ps.id, ps.document_id, ps.course_id, ps.year, ps.status::text as status, ps.style,
       d.title
from paper_styles ps join documents d on d.id = ps.document_id and d.deleted_at is null
where ps.user_id = %(u)s
"""


async def list_styles(conn: AsyncConnection, user_id: UUID, course_id: UUID) -> list[dict]:
    return await (
        await conn.execute(
            _SELECT
            + " and ps.course_id = %(c)s order by ps.year desc nulls last, ps.created_at desc",
            {"u": user_id, "c": course_id},
        )
    ).fetchall()


async def get_style(conn: AsyncConnection, user_id: UUID, style_id: UUID) -> dict | None:
    return await (
        await conn.execute(_SELECT + " and ps.id = %(s)s", {"u": user_id, "s": style_id})
    ).fetchone()
