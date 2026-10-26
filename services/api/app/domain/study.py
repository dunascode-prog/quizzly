"""Outline, source pages, explanations and feedback for a student's own documents.

Topics and explanations belong to the shared source file (FR-EXPL-04); a student reaches them
only through a document of theirs that points at that file.
"""

from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

_DOC = """
select d.id, d.title, d.source_file_id, c.code as course_code, sf.page_count,
       sf.low_ocr_pages
from documents d
join source_files sf on sf.id = d.source_file_id and sf.status = 'ready'
left join courses c on c.id = d.course_id
where d.id = %s and d.user_id = %s and d.deleted_at is null and d.status = 'ready'
"""


async def ready_document(conn: AsyncConnection, user_id: UUID, document_id: UUID) -> dict | None:
    return await (await conn.execute(_DOC, (document_id, user_id))).fetchone()


async def topics(conn: AsyncConnection, source_file_id: UUID) -> list[dict[str, Any]]:
    return await (
        await conn.execute(
            "select id, ordinal, title, summary, page_start, page_end from topics "
            "where source_file_id = %s and parent_id is null order by ordinal",
            (source_file_id,),
        )
    ).fetchall()


async def source_file(conn: AsyncConnection, source_file_id: UUID) -> dict | None:
    return await (
        await conn.execute(
            "select sha256, mime_type, storage_path from source_files where id = %s",
            (source_file_id,),
        )
    ).fetchone()


async def page(conn: AsyncConnection, source_file_id: UUID, number: int) -> dict | None:
    return await (
        await conn.execute(
            "select page_number, text from pages where source_file_id = %s and page_number = %s",
            (source_file_id, number),
        )
    ).fetchone()


async def explanation(
    conn: AsyncConnection, topic_id: UUID, style: str, prompt_version: int
) -> dict | None:
    return await (
        await conn.execute(
            "select id, style::text as style, status::text as status, content_md, citations "
            "from explanations where topic_id = %s and style = %s and prompt_version = %s",
            (topic_id, style, prompt_version),
        )
    ).fetchone()


async def create_explanation(
    conn: AsyncConnection, source_file_id: UUID, topic_id: UUID, style: str, prompt_version: int
) -> UUID | None:
    """A pending row for the worker to fill. None if another request created it first."""
    row = await (
        await conn.execute(
            "insert into explanations (source_file_id, topic_id, style, prompt_version) "
            "values (%s, %s, %s, %s) on conflict (topic_id, style, prompt_version) do nothing "
            "returning id",
            (source_file_id, topic_id, style, prompt_version),
        )
    ).fetchone()
    return row["id"] if row else None


async def retry_explanation(conn: AsyncConnection, explanation_id: UUID) -> None:
    await conn.execute(
        "update explanations set status = 'pending' where id = %s and status = 'failed'",
        (explanation_id,),
    )


async def can_see_explanation(conn: AsyncConnection, user_id: UUID, explanation_id: UUID) -> bool:
    row = await (
        await conn.execute(
            "select 1 from explanations e join documents d on d.source_file_id = e.source_file_id "
            "where e.id = %s and d.user_id = %s and d.deleted_at is null limit 1",
            (explanation_id, user_id),
        )
    ).fetchone()
    return row is not None


async def can_see_question(conn: AsyncConnection, user_id: UUID, question_id: UUID) -> bool:
    row = await (
        await conn.execute(
            "select 1 from questions qn join question_sets s on s.id = qn.question_set_id "
            "join documents d on d.source_file_id = s.source_file_id "
            "where qn.id = %s and d.user_id = %s and d.deleted_at is null limit 1",
            (question_id, user_id),
        )
    ).fetchone()
    return row is not None


async def rate(
    conn: AsyncConnection, user_id: UUID, target_type: str, target_id: UUID, rating: int
) -> None:
    await conn.execute(
        "insert into feedback (user_id, target_type, target_id, rating) values (%s, %s, %s, %s) "
        "on conflict (user_id, target_type, target_id) do update set rating = excluded.rating",
        (user_id, target_type, target_id, rating),
    )


async def report(
    conn: AsyncConnection,
    user_id: UUID,
    target_type: str,
    target_id: UUID,
    reason: str,
    note: str | None,
) -> None:
    await conn.execute(
        "insert into reports (user_id, target_type, target_id, reason, note) "
        "values (%s, %s, %s, %s, %s) on conflict (user_id, target_type, target_id) "
        "do update set reason = excluded.reason, note = excluded.note, status = 'open'",
        (user_id, target_type, target_id, reason, note),
    )
