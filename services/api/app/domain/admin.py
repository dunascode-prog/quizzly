"""Read-only numbers for the admin app (E4, WEB.md §3: Overview, AI costs, System, Students).

Admins see counts, costs, schools and display names, never notes, chats, answers or progress
content, and never emails. Ranges are "today" (since midnight in the app's time zone), 7 or 30
days (today and the days before it)."""

from typing import Any, Literal

from psycopg import AsyncConnection

Range = Literal["today", "7d", "30d"]
DAYS: dict[str, int] = {"today": 1, "7d": 7, "30d": 30}

# Start of the range as a timestamp, from the app's time zone: %(tz)s and %(days)s.
_START = (
    "((date_trunc('day', now() at time zone %(tz)s) - make_interval(days => %(days)s - 1))"
    " at time zone %(tz)s)"
)
_TOOK = "extract(epoch from updated_at - created_at)"  # a job's time from queued to finished
_TODAY = "(now() at time zone %(tz)s)::date"
_MIDNIGHT = "(date_trunc('day', now() at time zone %(tz)s) at time zone %(tz)s)"


def _p(tz: str, rng: str = "today") -> dict[str, Any]:
    return {"tz": tz, "days": DAYS[rng]}


async def _one(conn: AsyncConnection, sql: str, params: dict) -> dict[str, Any]:
    return await (await conn.execute(sql, params)).fetchone()


async def _all(conn: AsyncConnection, sql: str, params: dict) -> list[dict[str, Any]]:
    return await (await conn.execute(sql, params)).fetchall()


# Somebody is active on a day they used a daily allowance or studied.
_ACTIVE = f"""
select count(distinct user_id) as n from (
  select user_id from usage_counters where day >= ({_TODAY} - (%(days)s - 1))
  union all
  select user_id from study_days where day >= ({_TODAY} - (%(days)s - 1))
) a
"""


async def active(conn: AsyncConnection, tz: str, rng: str) -> int:
    return (await _one(conn, _ACTIVE, _p(tz, rng)))["n"]


async def overview(conn: AsyncConnection, tz: str, rng: str, daily_budget: float) -> dict:
    p = _p(tz, rng)
    counts = await _one(
        conn,
        f"""
        select
          (select count(*) from profiles where created_at >= {_START} and deleted_at is null)
            as signups,
          (select count(*) from referrals where created_at >= {_START}) as invited,
          (select count(*) from documents where created_at >= {_START}
             and status = 'ready' and deleted_at is null) as documents,
          (select count(*) from documents d join source_files f on f.id = d.source_file_id
             where d.created_at >= {_START} and d.status = 'ready' and d.deleted_at is null
               and f.created_at < d.created_at - interval '1 minute') as duplicates,
          (select count(distinct (target_type, target_id)) from reports where status = 'open')
            as open_reports,
          (select count(distinct r.target_id) from reports r join questions q on q.id = r.target_id
             where r.status = 'open' and r.target_type = 'question' and q.hidden) as auto_hidden,
          (select coalesce(sum(cost_usd), 0) from llm_calls
             where created_at >= {_MIDNIGHT}) as cost_today
        """,
        p,
    )
    week = await _all(
        conn,
        f"""
        select provider, ((created_at at time zone %(tz)s)::date) as day, sum(cost_usd) as cost
        from llm_calls where created_at >= {_START} group by 1, 2 order by 1, 2
        """,
        _p(tz, "7d"),
    )
    attention = await _all(
        conn,
        """
        select r.target_type::text as type, r.target_id,
               (array_agg(r.note order by r.created_at desc)
                  filter (where r.note is not null))[1] as note,
               (array_agg(r.reason::text order by r.created_at desc))[1] as reason,
               count(*) as reports, max(r.created_at) as last_at,
               coalesce(bool_or(q.hidden), false) as hidden
        from reports r left join questions q on r.target_type = 'question' and q.id = r.target_id
        where r.status = 'open' group by 1, 2 order by last_at desc limit 4
        """,
        {},
    )
    return {
        "active": await active(conn, tz, rng),
        "active_month": await active(conn, tz, "30d"),
        **counts,
        "daily_budget_usd": daily_budget,
        "providers": week,
        "attention": attention,
        "health": await health(conn),
    }


async def health(conn: AsyncConnection) -> dict[str, Any]:
    """Queue, worker and AI provider breakers: Overview's list and the System page."""
    queue = await _one(
        conn,
        """
        select count(*) filter (where status = 'queued' and run_after <= now()) as waiting,
               count(*) filter (where status = 'running') as running,
               count(*) filter (where status = 'failed'
                                  and updated_at > now() - interval '24 hours')
                 as failed_24h,
               (select extract(epoch from now() - max(last_beat_at))::int from worker_heartbeats)
                 as worker_beat_s
        from jobs
        """,
        {},
    )
    breakers = await _all(
        conn,
        """
        select split_part(provider_model, ':', 1) as provider,
               bool_or(circuit_open_until > now()) as open
        from provider_limits group by 1 order by 1
        """,
        {},
    )
    return {**queue, "breakers": breakers}


async def costs(conn: AsyncConnection, tz: str, rng: str) -> dict[str, Any]:
    p = _p(tz, rng)
    totals = await _one(
        conn,
        f"""
        select count(*) as calls,
               count(*) filter (where cost_usd = 0) as free_calls,
               coalesce(sum(ref_cost_usd), 0) as list_usd,
               coalesce(sum(cost_usd), 0) as paid_usd
        from llm_calls where created_at >= {_START}
        """,
        p,
    )
    daily = await _all(
        conn,
        f"""
        select d::date as day, coalesce(sum(c.cost_usd), 0) as paid_usd
        from generate_series(({_TODAY} - 29)::timestamp, {_TODAY}::timestamp, interval '1 day') d
        left join llm_calls c on (c.created_at at time zone %(tz)s)::date = d::date
        group by 1 order by 1
        """,
        p,
    )
    providers = await _all(
        conn,
        f"""
        select provider, count(*) as calls,
               count(*) filter (where status <> 'ok') as errors,
               percentile_cont(0.5) within group (order by latency_ms) as p50_ms,
               coalesce(sum(cost_usd), 0) as paid_usd
        from llm_calls where created_at >= {_START} group by 1 order by calls desc
        """,
        p,
    )
    tasks = await _all(
        conn,
        f"""
        select task, mode() within group (order by model) as model, count(*) as calls,
               coalesce(sum(prompt_tokens), 0) as tokens_in,
               coalesce(sum(completion_tokens), 0) as tokens_out,
               coalesce(sum(ref_cost_usd), 0) as list_usd
        from llm_calls where created_at >= {_START} group by 1 order by list_usd desc
        """,
        p,
    )
    # IDs, school and level only, never names (WEB.md §3).
    top = await _all(
        conn,
        f"""
        select c.user_id as id, coalesce(i.short_name, i.name, p.institution_other) as school,
               p.level, p.plan::text as plan, coalesce(sum(c.ref_cost_usd), 0) as list_usd,
               (select coalesce(sum(count), 0) from usage_counters u
                  where u.user_id = c.user_id and u.resource = 'question_set'
                    and u.day >= ({_TODAY} - (%(days)s - 1))) as quiz_sets
        from llm_calls c join profiles p on p.id = c.user_id
        left join institutions i on i.id = p.institution_id
        where c.created_at >= {_START} group by 1, 2, 3, 4 order by list_usd desc limit 10
        """,
        p,
    )
    return {
        **totals,
        "active": await active(conn, tz, rng),
        "daily": daily,
        "providers": providers,
        "tasks": tasks,
        "top_students": top,
        "health": await health(conn),
    }


async def system(conn: AsyncConnection) -> dict[str, Any]:
    jobs = await _all(
        conn,
        f"""
        select type::text as job,
               count(*) filter (where status = 'succeeded') as done,
               count(*) filter (where status = 'failed') as failed,
               percentile_cont(0.5) within group (order by {_TOOK})
                 filter (where status = 'succeeded') as p50_s,
               percentile_cont(0.95) within group (order by {_TOOK})
                 filter (where status = 'succeeded') as p95_s
        from jobs where updated_at > now() - interval '24 hours' group by 1 order by done desc
        """,
        {},
    )
    upload = await _one(
        conn,
        f"""
        select percentile_cont(0.5) within group (order by {_TOOK})
                 as p50_s,
               percentile_cont(0.95) within group (order by {_TOOK})
                 as p95_s
        from jobs where type = 'ingest_document' and status = 'succeeded'
          and updated_at > now() - interval '7 days'
        """,
        {},
    )
    # The error is our own short reason ("encrypted", "too_large"), cut short in case it isn't.
    failures = await _all(
        conn,
        """
        select id, type::text as job, updated_at as at, attempts, max_attempts,
               left(coalesce(error, ''), 120) as reason
        from jobs where status = 'failed' order by updated_at desc limit 10
        """,
        {},
    )
    return {
        "health": await health(conn),
        "jobs": jobs,
        "upload_to_ready": upload,
        "failures": failures,
    }


async def students_summary(conn: AsyncConnection, tz: str) -> dict[str, Any]:
    p = _p(tz, "7d")
    counts = await _one(
        conn,
        f"""
        select
          (select count(*) from profiles where created_at >= {_START} and deleted_at is null)
            as new_week,
          (select count(*) from referrals where created_at >= {_START}) as invited_week,
          -- Weekly goal: counted study days this week (from Monday) against each student's goal.
          (select count(*) filter (where days >= goal)::float / nullif(count(*), 0)
             from (select s.user_id, count(*) filter (where s.counted) as days,
                          coalesce(p.weekly_goal_days, 4) as goal
                   from study_days s join profiles p on p.id = s.user_id
                   where s.day >= date_trunc('week', {_TODAY})::date group by 1, 3) g)
            as goal_met_share,
          -- Week-4 retention: of those who joined 28-35 days ago, who studied in their 4th week.
          (select count(*) filter (where exists (
                    select 1 from study_days s where s.user_id = p.id
                      and s.day between (p.created_at + interval '21 days')::date
                                    and (p.created_at + interval '27 days')::date))::float
                  / nullif(count(*), 0)
             from profiles p where p.created_at between now() - interval '35 days'
                                                    and now() - interval '28 days')
            as week4_retention
        """,
        p,
    )
    schools = await _all(
        conn,
        """
        select coalesce(i.short_name, i.name, 'Other') as name, count(*) as students
        from profiles p left join institutions i on i.id = p.institution_id
        where p.deleted_at is null group by 1 order by students desc
        """,
        {},
    )
    sources = await _all(
        conn,
        f"select channel::text as channel, count(*) as n from referrals "
        f"where created_at >= {_START} group by 1",
        p,
    )
    return {
        "active_month": await active(conn, tz, "30d"),
        "active_today": await active(conn, tz, "today"),
        **counts,
        "schools": schools,
        "sources": sources,
    }


async def students(
    conn: AsyncConnection, tz: str, search: str, school: str | None, limit: int, offset: int
) -> list[dict[str, Any]]:
    """The searchable table: display name, school, plan, activity, usage and status only."""
    like = "%" + search.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_") + "%"
    return await _all(
        conn,
        f"""
        select p.id, case when p.deleted_at is null then p.display_name end as name,
               coalesce(i.short_name, i.name, p.institution_other) as school, p.level,
               p.plan::text as plan, p.created_at,
               greatest((select max(day) from study_days s where s.user_id = p.id),
                        (select max(day) from usage_counters u where u.user_id = p.id))
                 as last_active,
               (select coalesce(sum(count), 0) from usage_counters u where u.user_id = p.id
                  and u.resource = 'question_set' and u.day >= ({_TODAY} - 29)) as quiz_sets,
               (select micro_usd / 1e6 from ai_spend a where a.user_id = p.id
                  and a.month = date_trunc('month', now())::date) as ai_cost_usd,
               case when p.deleted_at is not null then 'deleting'
                    when p.suspended_at is not null then 'paused' else 'active' end as status
        from profiles p left join institutions i on i.id = p.institution_id
        where (%(search)s = '' or p.display_name ilike %(like)s or p.id::text like %(like)s)
          and (%(school)s::text is null or coalesce(i.short_name, i.name) = %(school)s)
        order by last_active desc nulls last, p.created_at desc
        limit %(limit)s offset %(offset)s
        """,
        {
            "tz": tz,
            "search": search,
            "like": like,
            "school": school,
            "limit": limit,
            "offset": offset,
        },
    )
