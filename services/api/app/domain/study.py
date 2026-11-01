"""Outline, source pages, explanations and feedback for documents a student may study.

Topics and explanations belong to the shared source file (FR-EXPL-04); a student reaches them
only through a document they own, or one in a course shared with them (FR-SHARE-05), checked by
the `can_read_document` database function.
"""

from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

from app.domain import avatars

_DOC = """
select d.id, d.title, d.source_file_id, d.course_id, c.code as course_code, sf.page_count,
       sf.low_ocr_pages, d.user_id <> %(user)s as shared
from documents d
join source_files sf on sf.id = d.source_file_id and sf.status = 'ready'
left join courses c on c.id = d.course_id
where d.id = %(doc)s and d.status = 'ready' and can_read_document(d.id, %(user)s)
  and d.kind = 'notes'  -- a past paper is never studied from or used as answers (FR-QGEN-09)
"""


async def ready_document(conn: AsyncConnection, user_id: UUID, document_id: UUID) -> dict | None:
    """A ready document the student may study. `shared` is true when it came through a shared
    course: then original pages stay private (FR-SHARE-02)."""
    return await (await conn.execute(_DOC, {"doc": document_id, "user": user_id})).fetchone()


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
            "select e.id, e.style::text as style, e.status::text as status, e.content_md, "
            "e.citations, coalesce((select j.status = 'queued' and j.error = 'busy' from jobs j "
            "where j.dedupe_key = 'explain:' || e.id::text order by j.created_at desc limit 1), "
            "false) as busy "
            "from explanations e where e.topic_id = %s and e.style = %s and e.prompt_version = %s",
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
            "where e.id = %s and can_read_document(d.id, %s) limit 1",
            (explanation_id, user_id),
        )
    ).fetchone()
    return row is not None


async def can_see_question(conn: AsyncConnection, user_id: UUID, question_id: UUID) -> bool:
    row = await (
        await conn.execute(
            "select 1 from questions qn join question_sets s on s.id = qn.question_set_id "
            "join documents d on d.source_file_id = s.source_file_id "
            "where qn.id = %s and can_read_document(d.id, %s) limit 1",
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
    if target_type == "question":
        await hide_if_reported(conn, target_id)
    elif target_type == "avatar":
        await avatars.hide_if_reported(conn, target_id)  # FR-MOD-06


REPORTS_TO_HIDE = 3  # FR-MOD-02


async def hide_if_reported(conn: AsyncConnection, question_id: UUID) -> bool:
    """A question reported by 3 different students is hidden from quizzes until an admin reviews
    it (FR-MOD-02). A student counts once however often they report (one row per student)."""
    row = await (
        await conn.execute(
            "update questions set hidden = true where id = %s and not hidden and ("
            "select count(distinct user_id) from reports where target_type = 'question' "
            "and target_id = %s and status = 'open') >= %s returning id",
            (question_id, question_id, REPORTS_TO_HIDE),
        )
    ).fetchone()
    return row is not None
