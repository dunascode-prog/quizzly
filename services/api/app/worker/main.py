"""Worker process: `python -m app.worker.main`.

Polls the jobs table, dispatches to a handler by job type, and writes a heartbeat every minute
(which also keeps a free Supabase project from pausing).
"""

import asyncio
import logging
import os
import socket
from collections.abc import Awaitable, Callable
from datetime import timedelta

from psycopg import AsyncConnection

from app.core import db
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.llm.gateway import AllProvidersBusy
from app.worker import accounts, explain, ingest, marking, questions, queue

log = logging.getLogger("quizzly.worker")

Handler = Callable[[AsyncConnection, dict], Awaitable[None]]

HANDLERS: dict[str, Handler] = {
    "ingest_document": ingest.ingest_document,
    "generate_explanation": explain.generate_explanation,
    "generate_questions": questions.generate_questions,
    "mark_answers": marking.mark_answer,
    "delete_account": accounts.delete_account,
}

POLL_INTERVAL = 2.0
HEARTBEAT_INTERVAL = 60.0
BUSY_REQUEUE_DELAY = timedelta(minutes=1)


async def run_one(conn: AsyncConnection, worker_id: str) -> bool:
    """Claim and run a single job. Returns False when the queue is empty."""
    job = await queue.claim(conn, worker_id, list(HANDLERS))
    if job is None:
        return False
    extra = {"job_id": str(job["id"])}
    handler = HANDLERS.get(job["type"])
    if handler is None:
        await queue.fail(conn, job, f"no handler for {job['type']}", retry=False)
        log.error("no handler for job type %s", job["type"], extra=extra)
        return True
    try:
        await handler(conn, job)
        await queue.succeed(conn, job["id"])
        log.info("job %s succeeded", job["type"], extra=extra)
    except queue.RetryLater as exc:
        await queue.requeue(conn, job, exc.delay)
        log.info("job %s waiting: %s", job["type"], exc, extra=extra)
    except AllProvidersBusy as exc:
        await queue.requeue(conn, job, BUSY_REQUEUE_DELAY)
        log.warning("LLM providers busy, requeued: %s", exc, extra=extra)
    except Exception as exc:
        await queue.fail(conn, job, repr(exc))
        log.exception("job %s failed", job["type"], extra=extra)
    return True


async def heartbeat(worker_id: str) -> None:
    while True:
        async with db.get_pool().connection() as conn:
            await conn.execute(
                """
                insert into worker_heartbeats (worker_id) values (%s)
                on conflict (worker_id) do update set last_beat_at = now()
                """,
                (worker_id,),
            )
        await asyncio.sleep(HEARTBEAT_INTERVAL)


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    pool = await db.open_pool()
    beat = asyncio.create_task(heartbeat(worker_id))
    log.info("worker %s started", worker_id)
    try:
        while True:
            async with pool.connection() as conn:
                had_work = await run_one(conn, worker_id)
            if not had_work:
                await asyncio.sleep(POLL_INTERVAL)
    finally:
        beat.cancel()
        await db.close_pool()


if __name__ == "__main__":
    # psycopg's async mode can't use Windows' default Proactor loop; Selector works everywhere.
    asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop)
