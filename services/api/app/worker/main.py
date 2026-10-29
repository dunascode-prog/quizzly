"""Worker process: `python -m app.worker.main`.

Polls the jobs table, dispatches to a handler by job type, and writes a heartbeat every minute
(which also keeps a free Supabase project from pausing).
"""

import asyncio
import logging
import os
import socket
import time
from collections.abc import Awaitable, Callable
from datetime import timedelta

from psycopg import AsyncConnection

from app.core import db
from app.core.config import get_settings
from app.core.logging import configure_logging, job_id_var
from app.core.observability import init_sentry
from app.domain import notifications
from app.llm import usage
from app.llm.gateway import AllProvidersBusy, BudgetReached
from app.worker import (
    accounts,
    cleanup,
    crashed,
    explain,
    ingest,
    invites,
    marking,
    metrics,
    progress,
    push,
    questions,
    queue,
    reminders,
    sharing,
    style,
)

log = logging.getLogger("quizzly.worker")

Handler = Callable[[AsyncConnection, dict], Awaitable[None]]

HANDLERS: dict[str, Handler] = {
    "ingest_document": ingest.ingest_document,
    "generate_explanation": explain.generate_explanation,
    "generate_questions": questions.generate_questions,
    "mark_answers": marking.mark_answer,
    "delete_account": accounts.delete_account,
    "cleanup_storage": cleanup.cleanup_storage,
    "update_mastery": progress.update_mastery,
    "send_push": push.send_push,
    "fan_out_share_update": sharing.fan_out_share_update,
    "credit_referral": invites.credit_referral,
    "extract_style": style.extract_style,
}

POLL_INTERVAL = 2.0
HEARTBEAT_INTERVAL = 60.0
SWEEP_INTERVAL = 60.0
REMINDER_INTERVAL = 900.0  # FR-HAB-08: every 15 minutes
METRICS_INTERVAL = 300.0  # NFR-09: a job-metrics log line every 5 minutes
SNAPSHOT_INTERVAL = 3600.0  # daily readiness rows; each day's row is written once
# FR-SEC-04: no job may run longer than this; a file that takes longer fails as too_large.
JOB_TIMEOUT = timedelta(minutes=10)
BUSY_REQUEUE_DELAY = timedelta(minutes=1)
# The daily budget only frees up at midnight: check far less often (FR-SEC-08).
BUDGET_REQUEUE_DELAY = timedelta(minutes=15)


async def run_one(conn: AsyncConnection, worker_id: str) -> bool:
    """Claim and run a single job. Returns False when the queue is empty."""
    job = await queue.claim(conn, worker_id, list(HANDLERS))
    if job is None:
        return False
    token = job_id_var.set(str(job["id"]))
    started = time.perf_counter()
    outcome = "failed"
    try:
        outcome = await _run(conn, job, {"job_id": str(job["id"])})
    finally:
        # NFR-09: one structured line per job, for duration and failure metrics in the logs.
        wait = (
            (job["locked_at"] - job["run_after"]).total_seconds() if job.get("locked_at") else None
        )
        log.info(
            "job finished",
            extra={
                "job_type": job["type"],
                "outcome": outcome,
                "attempt": job["attempts"],
                "ms": round((time.perf_counter() - started) * 1000, 1),
                "wait_ms": round(wait * 1000) if wait is not None and wait >= 0 else None,
            },
        )
        job_id_var.reset(token)
    return True


async def _run(conn: AsyncConnection, job: dict, extra: dict) -> str:
    """Runs one claimed job; returns its outcome for the job line."""
    handler = HANDLERS.get(job["type"])
    if handler is None:
        await queue.fail(conn, job, f"no handler for {job['type']}", retry=False)
        log.error("no handler for job type %s", job["type"], extra=extra)
        return "failed"
    usage.for_job(job)  # llm_calls rows are tagged with this job and its student
    try:
        async with asyncio.timeout(JOB_TIMEOUT.total_seconds()):
            await handler(conn, job)
        await queue.succeed(conn, job["id"])
        return "succeeded"
    except TimeoutError:
        # Retrying would only take as long again: fail it, and the work with it.
        await queue.fail(conn, job, "timeout", retry=False)
        await crashed.handle(conn, job, reason="too_large")
        log.error("job %s ran past %s", job["type"], JOB_TIMEOUT, extra=extra)
        return "timeout"
    except queue.RetryLater as exc:
        await queue.requeue(conn, job, exc.delay)
        log.info("job %s waiting: %s", job["type"], exc, extra=extra)
        return "requeued"
    except BudgetReached as exc:
        await queue.requeue(conn, job, BUDGET_REQUEUE_DELAY, reason="busy")
        log.warning("daily AI budget reached, requeued: %s", exc, extra=extra)
        return "busy"
    except AllProvidersBusy as exc:
        await queue.requeue(conn, job, BUSY_REQUEUE_DELAY, reason="busy")
        log.warning("LLM providers busy, requeued: %s", exc, extra=extra)
        return "busy"
    except Exception as exc:
        await queue.fail(conn, job, repr(exc))
        log.exception("job %s failed", job["type"], extra=extra)  # Sentry captures error logs
        return "failed"


async def sweep(conn: AsyncConnection) -> int:
    """Fails jobs that crashed a worker on their last attempt, and the work they were doing."""
    jobs = await queue.sweep_crashed(conn)
    for job in jobs:
        log.error(
            "job %s crashed on its last attempt", job["type"], extra={"job_id": str(job["id"])}
        )
        await crashed.handle(conn, job)
    return len(jobs)


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
    settings.require_env()  # FR-SEC-15
    configure_logging(settings.log_level)
    init_sentry(settings, "worker")  # NFR-09; off without SENTRY_DSN
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    pool = await db.open_pool()
    beat = asyncio.create_task(heartbeat(worker_id))
    log.info("worker %s started", worker_id)
    last_sweep = last_snapshot = last_reminders = last_metrics = 0.0
    try:
        while True:
            async with pool.connection() as conn:
                if time.monotonic() - last_sweep > SWEEP_INTERVAL:
                    await sweep(conn)
                    last_sweep = time.monotonic()
                if time.monotonic() - last_reminders > REMINDER_INTERVAL:
                    await reminders.schedule_reminders(conn)
                    last_reminders = time.monotonic()
                if time.monotonic() - last_snapshot > SNAPSHOT_INTERVAL:
                    written = await progress.snapshot_all(conn)
                    old = await notifications.delete_old(conn)  # 90 days (FR-NOTIF-04)
                    log.info("readiness snapshots: %d, old notifications deleted: %d", written, old)
                    last_snapshot = time.monotonic()
                if time.monotonic() - last_metrics > METRICS_INTERVAL:
                    # NFR-09: queue depth, waits and failures in the logs, every few minutes.
                    log.info("job metrics", extra={"metrics": await metrics.job_metrics(conn)})
                    last_metrics = time.monotonic()
                had_work = await run_one(conn, worker_id)
            if not had_work:
                await asyncio.sleep(POLL_INTERVAL)
    finally:
        beat.cancel()
        await db.close_pool()


if __name__ == "__main__":
    # psycopg's async mode can't use Windows' default Proactor loop; Selector works everywhere.
    asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop)
