"""What to mark failed when a job crashed the worker on its last attempt (FR-SEC-03), so the
student sees a failure instead of waiting forever."""

import logging
from collections.abc import Awaitable, Callable
from uuid import UUID

from psycopg import AsyncConnection

from app.domain import quizzes
from app.worker import ingest, marking

log = logging.getLogger("quizzly.worker")


async def _document(conn: AsyncConnection, payload: dict) -> None:
    document_id = UUID(payload["document_id"])
    row = await (
        await conn.execute(
            "select d.source_file_id, sf.status::text as file_status from documents d "
            "left join source_files sf on sf.id = d.source_file_id where d.id = %s",
            (document_id,),
        )
    ).fetchone()
    # A crash on the same file every time is permanent for that file (FR-SEC-06), unless the
    # shared file is already ready for other students: then only this document fails.
    shared_ok = row and row["file_status"] == "ready"
    source_file_id = row["source_file_id"] if row and not shared_ok else None
    await ingest._fail(conn, document_id, "crashed", source_file_id)


async def _question_set(conn: AsyncConnection, payload: dict) -> None:
    await conn.execute(
        "update question_sets set status = 'failed' where id = %s and status <> 'ready'",
        (UUID(payload["question_set_id"]),),
    )


async def _explanation(conn: AsyncConnection, payload: dict) -> None:
    await conn.execute(
        "update explanations set status = 'failed' where id = %s and status <> 'ready'",
        (UUID(payload["explanation_id"]),),
    )


async def _marking(conn: AsyncConnection, payload: dict) -> None:
    attempt_id, question_id = UUID(payload["attempt_id"]), UUID(payload["question_id"])
    await quizzes.record_marking(
        conn,
        attempt_id,
        question_id,
        0,
        None,
        marking.not_marked(
            "error", "We couldn't mark this answer. Compare it with the model answer."
        ),
    )
    await quizzes.finish_if_marked(conn, attempt_id)


ON_CRASH: dict[str, Callable[[AsyncConnection, dict], Awaitable[None]]] = {
    "ingest_document": _document,
    "generate_questions": _question_set,
    "generate_explanation": _explanation,
    "mark_answers": _marking,
}


async def handle(conn: AsyncConnection, job: dict) -> None:
    handler = ON_CRASH.get(job["type"])
    if handler is None:
        return
    try:
        await handler(conn, job["payload"])
    except Exception:
        log.exception("couldn't fail the work of crashed job %s", job["id"])
