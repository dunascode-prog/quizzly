"""Job metrics (NFR-09): queue depth, how long jobs wait and run, and how many fail, per job type.

Durations come from the jobs table itself: `locked_at` is set when a worker claims a job and
`updated_at` when it finishes, so no extra bookkeeping is needed.
"""

from typing import Any

from psycopg import AsyncConnection

WINDOW_HOURS = 24


async def job_metrics(conn: AsyncConnection) -> dict[str, Any]:
    rows = await (
        await conn.execute(
            """
            select type::text as type,
              count(*) filter (where status = 'queued' and run_after <= now()) as ready,
              count(*) filter (where status = 'queued' and run_after > now()) as waiting,
              count(*) filter (where status = 'running') as running,
              count(*) filter (where status = 'succeeded'
                               and updated_at > now() - make_interval(hours => %(h)s)) as succeeded,
              count(*) filter (where status = 'failed'
                               and updated_at > now() - make_interval(hours => %(h)s)) as failed,
              round(extract(epoch from max(now() - run_after)
                    filter (where status = 'queued' and run_after <= now()))::numeric, 1)
                as oldest_ready_s,
              round((percentile_cont(0.5) within group
                     (order by extract(epoch from updated_at - locked_at))
                    filter (where status in ('succeeded', 'failed') and locked_at is not null
                            and updated_at > now() - make_interval(hours => %(h)s)))::numeric, 2)
                as p50_s,
              round((percentile_cont(0.95) within group
                     (order by extract(epoch from updated_at - locked_at))
                    filter (where status in ('succeeded', 'failed') and locked_at is not null
                            and updated_at > now() - make_interval(hours => %(h)s)))::numeric, 2)
                as p95_s
            from jobs
            where status in ('queued', 'running')
               or updated_at > now() - make_interval(hours => %(h)s)
            group by type
            order by type
            """,
            {"h": WINDOW_HOURS},
        )
    ).fetchall()
    types = {
        r["type"]: {
            k: (float(v) if v is not None and k.endswith("_s") else v)
            for k, v in r.items()
            if k != "type"
        }
        for r in rows
    }
    totals = {
        key: sum(t[key] for t in types.values())
        for key in ("ready", "waiting", "running", "succeeded", "failed")
    }
    workers = await (
        await conn.execute(
            "select count(*) as n from worker_heartbeats "
            "where last_beat_at > now() - interval '3 minutes'"
        )
    ).fetchone()
    return {
        "window_hours": WINDOW_HOURS,
        "workers_alive": workers["n"],
        "queue_depth": totals["ready"],
        "totals": totals,
        "types": types,
    }
