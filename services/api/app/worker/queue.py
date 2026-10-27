"""Postgres-backed job queue (`jobs` table). Workers claim with FOR UPDATE SKIP LOCKED."""

import json
from datetime import timedelta
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

BASE_BACKOFF = timedelta(seconds=15)
MAX_BACKOFF = timedelta(minutes=30)
# Longer than the 10-minute job time limit (FR-SEC-04), so a job still inside it isn't taken
# by another worker.
LEASE = timedelta(minutes=15)


class RetryLater(Exception):
    """Raised by a handler that must wait for other work; the job is re-queued without
    spending an attempt."""

    def __init__(self, delay: timedelta, reason: str = ""):
        super().__init__(reason)
        self.delay = delay


def backoff_for(attempts: int) -> timedelta:
    """Exponential backoff: 15 s, 30 s, 1 min, 2 min… capped at 30 min."""
    return min(BASE_BACKOFF * (2 ** max(attempts - 1, 0)), MAX_BACKOFF)


async def enqueue(
    conn: AsyncConnection,
    job_type: str,
    payload: dict[str, Any],
    *,
    user_id: UUID | None = None,
    dedupe_key: str | None = None,
) -> UUID | None:
    """Insert a job. Returns None if an active job with the same dedupe_key already exists."""
    row = await (
        await conn.execute(
            """
            insert into jobs (type, user_id, payload, dedupe_key)
            values (%s, %s, %s, %s)
            on conflict (dedupe_key) where status in ('queued', 'running') do nothing
            returning id
            """,
            (job_type, user_id, json.dumps(payload), dedupe_key),
        )
    ).fetchone()
    return row["id"] if row else None


async def claim(conn: AsyncConnection, worker_id: str, types: list[str]) -> dict | None:
    """Take the oldest runnable job of a type this worker handles, or one whose lease expired
    (crashed worker) while it still has attempts left (FR-SEC-03). An older worker mid-deploy
    leaves new job types for a newer one."""
    return await (
        await conn.execute(
            """
            update jobs set status = 'running', locked_by = %s, locked_at = now(),
                            attempts = attempts + 1
            where id = (
                select id from jobs
                where ((status = 'queued' and run_after <= now())
                       or (status = 'running' and locked_at < now() - %s
                           and attempts < max_attempts))
                  and type::text = any(%s)
                order by run_after
                for update skip locked
                limit 1
            )
            returning *
            """,
            (worker_id, LEASE, types),
        )
    ).fetchone()


async def sweep_crashed(conn: AsyncConnection) -> list[dict]:
    """Jobs that crashed the worker on their last attempt (lease expired, no attempts left) are
    marked failed with reason `crashed` and returned, so their work can be failed too
    (FR-SEC-03). Without this a file that kills the worker every time is retried forever."""
    return await (
        await conn.execute(
            """
            update jobs set status = 'failed', locked_by = null, error = 'crashed'
            where status = 'running' and locked_at < now() - %s and attempts >= max_attempts
            returning *
            """,
            (LEASE,),
        )
    ).fetchall()


async def set_progress(conn: AsyncConnection, job_id: UUID, progress: int) -> None:
    await conn.execute(
        "update jobs set progress = %s where id = %s", (max(0, min(progress, 100)), job_id)
    )


async def succeed(conn: AsyncConnection, job_id: UUID) -> None:
    await conn.execute(
        "update jobs set status = 'succeeded', progress = 100, locked_by = null where id = %s",
        (job_id,),
    )


async def fail(conn: AsyncConnection, job: dict, error: str, *, retry: bool = True) -> None:
    """Retry with backoff while attempts remain, otherwise mark the job failed."""
    if retry and job["attempts"] < job["max_attempts"]:
        await conn.execute(
            """
            update jobs set status = 'queued', locked_by = null, error = %s,
                            run_after = now() + %s
            where id = %s
            """,
            (error, backoff_for(job["attempts"]), job["id"]),
        )
    else:
        await conn.execute(
            "update jobs set status = 'failed', locked_by = null, error = %s where id = %s",
            (error, job["id"]),
        )


async def requeue(
    conn: AsyncConnection, job: dict, delay: timedelta, reason: str | None = None
) -> None:
    """Put a job back without spending an attempt (e.g. every LLM provider is rate-limited).
    `reason` "busy" lets the app say "High demand — your quiz is queued" (FR-LIM-03)."""
    await conn.execute(
        """
        update jobs set status = 'queued', locked_by = null, attempts = attempts - 1,
                        run_after = now() + %s, error = %s
        where id = %s
        """,
        (delay, reason, job["id"]),
    )
