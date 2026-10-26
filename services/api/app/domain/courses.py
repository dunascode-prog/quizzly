"""Course queries (FR-CRS-01..03). Every query is scoped to the signed-in student."""

from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

from app.domain import documents

_LIST_SQL = """
select c.id, c.code, c.title, c.created_at,
       count(d.id) filter (where d.deleted_at is null) as document_count
from courses c
left join documents d on d.course_id = c.id
where c.user_id = %s
group by c.id
order by c.code
"""


class DuplicateCourse(Exception):
    pass


def normalize_code(code: str) -> str:
    """ "csc225" and "CSC  225" are the same course: upper-case, single spaces."""
    return " ".join(code.upper().split())


async def list_courses(conn: AsyncConnection, user_id: UUID) -> list[dict[str, Any]]:
    return await (await conn.execute(_LIST_SQL, (user_id,))).fetchall()


async def get_course(conn: AsyncConnection, user_id: UUID, course_id: UUID) -> dict | None:
    rows = await (
        await conn.execute(
            _LIST_SQL.replace("where c.user_id = %s", "where c.user_id = %s and c.id = %s"),
            (user_id, course_id),
        )
    ).fetchall()
    return rows[0] if rows else None


async def _code_taken(
    conn: AsyncConnection, user_id: UUID, code: str, except_id: UUID | None = None
) -> bool:
    row = await (
        await conn.execute(
            "select 1 from courses "
            "where user_id = %s and upper(code) = %s and id is distinct from %s",
            (user_id, code, except_id),
        )
    ).fetchone()
    return row is not None


async def create_course(
    conn: AsyncConnection, user_id: UUID, code: str, title: str | None
) -> dict[str, Any]:
    code = normalize_code(code)
    if await _code_taken(conn, user_id, code):
        raise DuplicateCourse(code)
    row = await (
        await conn.execute(
            "insert into courses (user_id, code, title) values (%s, %s, %s) returning id",
            (user_id, code, title),
        )
    ).fetchone()
    return await get_course(conn, user_id, row["id"])


async def update_course(
    conn: AsyncConnection, user_id: UUID, course_id: UUID, fields: dict[str, Any]
) -> dict | None:
    if "code" in fields:
        fields["code"] = normalize_code(fields["code"])
        if await _code_taken(conn, user_id, fields["code"], course_id):
            raise DuplicateCourse(fields["code"])
    if fields:
        sets = ", ".join(f"{k} = %s" for k in fields)
        await conn.execute(
            f"update courses set {sets} where id = %s and user_id = %s",
            (*fields.values(), course_id, user_id),
        )
    return await get_course(conn, user_id, course_id)


async def delete_course(
    conn: AsyncConnection, user_id: UUID, course_id: UUID, delete_documents: bool, tz: str
) -> list[str] | None:
    """Deletes the course. Returns the upload paths of documents deleted with it (None if missing).

    With delete_documents=False the documents move to Unfiled (FR-CRS-03).
    """
    async with conn.transaction():
        exists = await (
            await conn.execute(
                "select 1 from courses where id = %s and user_id = %s", (course_id, user_id)
            )
        ).fetchone()
        if not exists:
            return None
        paths: list[str] = []
        if delete_documents:
            rows = await (
                await conn.execute(
                    "delete from documents where course_id = %(course)s and user_id = %(user)s "
                    "returning upload_path, source_file_id, "
                    "processing_started_at is null and "
                    "(created_at at time zone %(tz)s)::date = (now() at time zone %(tz)s)::date "
                    "as refundable",
                    {"course": course_id, "user": user_id, "tz": tz},
                )
            ).fetchall()
            await documents.refund_uploads(conn, user_id, rows, tz)
            paths = await documents.release(conn, rows)
        # documents.course_id is "on delete set null", so the rest become Unfiled.
        await conn.execute(
            "delete from courses where id = %s and user_id = %s", (course_id, user_id)
        )
    return paths
