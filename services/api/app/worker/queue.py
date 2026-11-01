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
RUNNING_PER_STUDENT = 2  # jobs one student may have running at once (FR-LIM-07)


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
    run_after: timedelta | None = None,
) -> UUID | None:
    """Insert a job, optionally to run later. Returns None if an active job with the same
    dedupe_key already exists."""
    row = await (
        await conn.execute(
            """
            insert into jobs (type, user_id, payload, dedupe_key, run_after, priority)
            values (%(type)s, %(user)s, %(payload)s, %(dedupe)s, now() + %(after)s,
                    -- Paid plans go first (FR-LIM-07).
                    case when exists (
                      select 1 from profiles where id = %(user)s
                        and plan in ('student', 'premium')
                        and (plan_expires_at is null or plan_expires_at > now())
                    ) then 1 else 0 end)
            on conflict (dedupe_key) where status in ('queued', 'running') do nothing
            returning id
            """,
            {
                "type": job_type,
                "user": user_id,
                "payload": json.dumps(payload),
                "dedupe": dedupe_key,
                "after": run_after or timedelta(),
            },
        )
    ).fetchone()
    return row["id"] if row else None


async def claim(conn: AsyncConnection, worker_id: str, types: list[str]) -> dict | None:
    """Take the next runnable job of a type this worker handles, or one whose lease expired
    (crashed worker) while it still has attempts left (FR-SEC-03). An older worker mid-deploy
    leaves new job types for a newer one.

    Order (FR-LIM-07): paid plans first; then fair turns, the student served least in the last
    10 minutes going next, so one student's pile of jobs can't hold everyone else up; then oldest.
    A student with 2 jobs already running waits, so one account can't take every worker.
    """
    return await (
        await conn.execute(
            """
            update jobs set status = 'running', locked_by = %(worker)s, locked_at = now(),
                            attempts = attempts + 1
            where id = (
                select j.id from jobs j
                where ((j.status = 'queued' and j.run_after <= now())
                       or (j.status = 'running' and j.locked_at < now() - %(lease)s
                           and j.attempts < j.max_attempts))
                  and j.type::text = any(%(types)s)
                  and (j.user_id is null or (
                    select count(*) from jobs r
                    where r.user_id = j.user_id and r.status = 'running'
                      and r.locked_at >= now() - %(lease)s
                  ) < %(per_student)s)
                order by j.priority desc,
                         (select count(*) from jobs o
                          where o.user_id = j.user_id
                            and o.locked_at > now() - interval '10 minutes'),
                         j.run_after
                for update of j skip locked
                limit 1
            )
            returning *
            """,
            {
                "worker": worker_id,
                "lease": LEASE,
                "types": types,
                "per_student": RUNNING_PER_STUDENT,
            },
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
