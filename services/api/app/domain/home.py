"""Today, Daily 5, reading time and the weekly recap (FR-HOME-02..05, FR-HAB-01/02/06).

Reads the progress tables the `update_mastery` job keeps (ARCHITECTURE §5.8), so Today is one
small payload. All dates are the student's local dates (profiles.timezone).
"""

import math
from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

from app.domain import progress
from app.worker import progress as progress_job

DAILY5_SIZE = 5
DAILY5_MINUTES = 3
WEAK_TOPIC_MIN_ANSWERS = 3
WEAK_TOPIC_BELOW = 0.6
WORDS_PER_TOKEN = 0.75
READING_WORDS_PER_MINUTE = 200
PLAN_ROWS = 3
MAX_READING_EVENT_SECONDS = 600  # one event covers at most 10 minutes of reading
READING_EVENT_MAX_AGE = timedelta(days=7)  # offline reading syncs late, but not that late
RECAP_READY_HOUR = 18  # Sunday 6 PM local (FR-HAB-06)


async def context(conn: AsyncConnection, user_id: UUID) -> dict | None:
    return await (
        await conn.execute(
            "select timezone, weekly_goal_days, (now() at time zone timezone)::date as today, "
            "now() at time zone timezone as local_now from profiles "
            "where id = %s and deleted_at is null",
            (user_id,),
        )
    ).fetchone()


# Every objective question the student can practise: from their own ready documents.
_POOL = """
select distinct on (qn.id) qn.id, qn.topic_id, qn.question_set_id, d.id as document_id
from questions qn
join question_sets s on s.id = qn.question_set_id
join documents d on d.source_file_id = s.source_file_id
where d.status = 'ready' and d.id in (select readable_documents(%(user)s))
  and not qn.hidden and qn.type::text = any(%(types)s)
"""


def reading_minutes(token_count: int) -> int:
    return max(1, math.ceil(token_count * WORDS_PER_TOKEN / READING_WORDS_PER_MINUTE))


async def _counted_days(conn: AsyncConnection, user_id: UUID, today: date) -> list[date]:
    rows = await (
        await conn.execute(
            "select day from study_days where user_id = %s and counted and day > %s - 400",
            (user_id, today),
        )
    ).fetchall()
    return [r["day"] for r in rows]


async def _readiness(
    conn: AsyncConnection, user_id: UUID, course_id: UUID, today: date
) -> tuple[float, float | None]:
    """(readiness now, change since 7 days ago or None when there was no value then)."""
    row = await (
        await conn.execute(
            """
            select
              (select readiness from readiness_snapshots
               where user_id = %(u)s and course_id = %(c)s and day = %(d)s) as now,
              (select readiness from readiness_snapshots
               where user_id = %(u)s and course_id = %(c)s and day <= %(d)s - 7
               order by day desc limit 1) as week_ago
            """,
            {"u": user_id, "c": course_id, "d": today},
        )
    ).fetchone()
    now = (
        float(row["now"])
        if row["now"] is not None
        else await progress_job.course_readiness(conn, user_id, course_id)
    )
    change = None if row["week_ago"] is None else round(now - float(row["week_ago"]), 3)
    return now, change


async def _focus_course(conn: AsyncConnection, user_id: UUID, today: date) -> dict | None:
    """The course with the nearest exam, or the most practised one if none has a date. Courses
    shared with the student count too, without the owner's exam date (FR-SHARE-05)."""
    return await (
        await conn.execute(
            """
            with mine as (
              select c.id, c.code, c.title, c.accent, c.created_at,
                     case when c.exam_date >= %(d)s then c.exam_date end as exam_date
              from courses c where c.user_id = %(u)s
              union all
              select c.id, c.code, c.title, c.accent, c.created_at, null::date
              from course_members m
              join course_shares s on s.id = m.share_id and s.status = 'active'
              join courses c on c.id = s.course_id
              where m.user_id = %(u)s and m.status = 'active'
            )
            select mine.id, mine.code, mine.title, mine.accent::text as accent, mine.exam_date
            from mine
            left join topic_mastery m on m.user_id = %(u)s and m.course_id = mine.id
            group by mine.id, mine.code, mine.title, mine.accent, mine.exam_date, mine.created_at
            order by mine.exam_date is null, mine.exam_date,
                     coalesce(sum(m.answered), 0) desc, mine.created_at
            limit 1
            """,
            {"u": user_id, "d": today},
        )
    ).fetchone()


async def countdown(conn: AsyncConnection, user_id: UUID, today: date) -> dict | None:
    """FR-HOME-02: "CSC 225 exam in 12 days", readiness and "Up 18% this week"."""
    course = await _focus_course(conn, user_id, today)
    if course is None:
        return None
    readiness, change = await _readiness(conn, user_id, course["id"], today)
    exam = course["exam_date"]
    return {
        "course_id": course["id"],
        "code": course["code"],
        "title": course["title"],
        "accent": course["accent"],
        "exam_date": exam,
        "days_left": (exam - today).days if exam else None,
        "readiness": readiness,
        "change_this_week": change,
    }


async def week(conn: AsyncConnection, user_id: UUID, ctx: dict) -> dict:
    """FR-HOME-04: Mon–Sun with studied days, "3 of 4 study days", weeks in a row."""
    today: date = ctx["today"]
    start = progress.week_start(today)
    rows = {
        r["day"]: r
        for r in await (
            await conn.execute(
                "select day, questions_answered, counted from study_days "
                "where user_id = %s and day between %s and %s",
                (user_id, start, start + timedelta(days=6)),
            )
        ).fetchall()
    }
    days = [
        {
            "day": start + timedelta(days=i),
            "studied": bool(rows.get(start + timedelta(days=i), {}).get("counted")),
            "questions": rows.get(start + timedelta(days=i), {}).get("questions_answered", 0),
        }
        for i in range(7)
    ]
    counted = await _counted_days(conn, user_id, today)
    goal = ctx["weekly_goal_days"]
    return {
        "days": days,
        "study_days": sum(d["studied"] for d in days),
        "goal": goal,
        "weeks_in_a_row": progress.weeks_in_a_row(counted, goal, today),
    }


async def _daily5_state(conn: AsyncConnection, user_id: UUID, today: date) -> dict:
    row = await (
        await conn.execute(
            """
            select
              (select daily5_done from study_days where user_id = %(u)s and day = %(d)s) as done,
              (select count(*) from review_queue rq
               where rq.user_id = %(u)s and rq.due_on <= %(d)s
                 and rq.question_id in (select id from ("""
            + _POOL.replace("%(types)s", "%(review_types)s")
            + """) p)) as due,
              exists ("""
            + _POOL
            + """) as any_questions
            """,
            {
                "u": user_id,
                "user": user_id,
                "d": today,
                "types": list(progress.OBJECTIVE_TYPES),
                "review_types": list(progress.REVIEW_TYPES),
            },
        )
    ).fetchone()
    # Due flashcards alone are enough for a Daily 5 (FR-QGEN-10).
    available = row["any_questions"] or row["due"] > 0
    return {"done": bool(row["done"]), "due": row["due"], "available": available}


async def plan(conn: AsyncConnection, user_id: UUID, today: date, course_id: UUID | None) -> list:
    """FR-HOME-05: up to 3 rows (about 15 min)."""
    has_notes = await (
        await conn.execute(
            "select 1 from documents d where d.status = 'ready' "
            "and d.id in (select readable_documents(%s)) limit 1",
            (user_id,),
        )
    ).fetchone()
    if not has_notes:
        return [{"kind": "upload"}, {"kind": "join_shared"}]

    rows: list[dict[str, Any]] = []
    d5 = await _daily5_state(conn, user_id, today)
    if d5["available"] and not d5["done"]:
        rows.append({"kind": "daily5", "due": d5["due"], "minutes": DAILY5_MINUTES})

    weak = await (
        await conn.execute(
            """
            select distinct on (m.mastery, m.topic_id) m.topic_id,
                   coalesce(o.title, t.title) as title, m.mastery, d.id as document_id
            from topic_mastery m
            join topics t on t.id = m.topic_id
            left join topic_overrides o on o.topic_id = t.id and o.user_id = m.user_id
            join documents d on d.source_file_id = t.source_file_id and d.status = 'ready'
              and d.id in (select readable_documents(m.user_id))
            where m.user_id = %s and m.answered >= %s and m.mastery < %s
            order by m.mastery, m.topic_id, d.created_at desc
            limit 1
            """,
            (user_id, WEAK_TOPIC_MIN_ANSWERS, WEAK_TOPIC_BELOW),
        )
    ).fetchone()
    if weak:
        rows.append(
            {
                "kind": "weak_topic",
                "topic_id": weak["topic_id"],
                "title": weak["title"],
                "document_id": weak["document_id"],
                "mastery": float(weak["mastery"]),
            }
        )

    new = await (
        await conn.execute(
            """
            select t.id as topic_id, coalesce(o.title, t.title) as title, t.token_count,
                   d.id as document_id
            from documents d
            join topics t on t.source_file_id = d.source_file_id and t.parent_id is null
            left join topic_overrides o on o.topic_id = t.id and o.user_id = %(u)s
            where d.status = 'ready' and d.id in (select readable_documents(%(u)s))
              and not exists (select 1 from topic_reads r where r.user_id = %(u)s
                              and r.topic_id = t.id)
              and not exists (select 1 from topic_mastery m where m.user_id = %(u)s
                              and m.topic_id = t.id)
            order by (d.course_id is not distinct from %(c)s) desc, d.created_at desc, t.ordinal
            limit 1
            """,
            {"u": user_id, "c": course_id},
        )
    ).fetchone()
    if new:
        rows.append(
            {
                "kind": "learn",
                "topic_id": new["topic_id"],
                "title": new["title"],
                "document_id": new["document_id"],
                "minutes": reading_minutes(new["token_count"]),
            }
        )
    if not any(r["kind"] in ("daily5", "weak_topic") for r in rows):
        rows.append({"kind": "practise_any"})
    return rows[:PLAN_ROWS]


async def home(conn: AsyncConnection, user_id: UUID) -> dict | None:
    ctx = await context(conn, user_id)
    if ctx is None:
        return None
    today: date = ctx["today"]
    focus = await countdown(conn, user_id, today)
    extra = await (
        await conn.execute(
            """
            select
              (select count(*) from notifications where user_id = %(u)s and read_at is null)
                as unread,
              coalesce((select json_agg(a order by a.created_at) from (
                 select id, kind::text as kind, ref, created_at from achievements
                 where user_id = %(u)s and seen_at is null order by created_at limit 5) a), '[]')
                as unseen
            """,
            {"u": user_id},
        )
    ).fetchone()
    return {
        "today": today,
        "countdown": focus,
        "week": await week(conn, user_id, ctx),
        "plan": await plan(conn, user_id, today, focus["course_id"] if focus else None),
        "unread_notifications": extra["unread"],
        "achievements": extra["unseen"],
    }


async def study_days(conn: AsyncConnection, user_id: UUID, weeks: int) -> dict | None:
    """The study-days grid (FR-HAB-04): the last `weeks` weeks, Monday first, with questions
    answered per day; days still to come this week are included (empty) so rows are whole weeks."""
    ctx = await context(conn, user_id)
    if ctx is None:
        return None
    today: date = ctx["today"]
    start = progress.week_start(today) - timedelta(weeks=weeks - 1)
    rows = {
        r["day"]: r
        for r in await (
            await conn.execute(
                "select day, questions_answered, counted from study_days "
                "where user_id = %s and day between %s and %s",
                (user_id, start, today),
            )
        ).fetchall()
    }
    days = []
    for i in range(weeks * 7):
        d = start + timedelta(days=i)
        r = rows.get(d) or {}
        days.append(
            {
                "day": d,
                "questions": r.get("questions_answered", 0),
                "studied": bool(r.get("counted")),
            }
        )
    return {
        "today": today,
        "days": days,
        "study_days": sum(1 for d in days if d["studied"]),
    }


async def mark_achievements_seen(conn: AsyncConnection, user_id: UUID, ids: list[UUID]) -> None:
    """The app shows a celebration once (FR-HAB-05)."""
    await conn.execute(
        "update achievements set seen_at = now() "
        "where user_id = %s and id = any(%s) and seen_at is null",
        (user_id, ids),
    )


# --- Celebration (FR-HAB-05) ---------------------------------------------------------------------


def _fraction_mastery(rows: list[dict]) -> tuple[float, int]:
    fractions = [
        f
        for r in rows
        if r["type"] != progress.FLASHCARD
        and (f := progress.answer_fraction(r["score"], r["is_correct"], r["marks"])) is not None
    ]
    return progress.topic_mastery(fractions), len(fractions)


async def _course_readiness(
    conn: AsyncConnection, user_id: UUID, course_id: UUID | None, monday: date
) -> dict | None:
    """The course's readiness before this week and now, from the daily snapshots."""
    if course_id is None:
        return None
    row = await (
        await conn.execute(
            """
            select c.code,
              (select readiness from readiness_snapshots where user_id = %(u)s
               and course_id = c.id and day < %(m)s order by day desc limit 1) as before,
              (select readiness from readiness_snapshots where user_id = %(u)s
               and course_id = c.id order by day desc limit 1) as now
            from courses c where c.id = %(c)s
            """,
            {"u": user_id, "c": course_id, "m": monday},
        )
    ).fetchone()
    if row is None or row["now"] is None:
        return None
    return {
        "code": row["code"],
        "before": None if row["before"] is None else float(row["before"]),
        "now": float(row["now"]),
    }


async def achievement(conn: AsyncConnection, user_id: UUID, achievement_id: UUID) -> dict | None:
    """What screen 16 shows for one of the student's own achievements: the ring value, a
    subtitle, "since last Monday" before and now bars and the course readiness change."""
    ctx = await context(conn, user_id)
    if ctx is None:
        return None
    a = await (
        await conn.execute(
            "select id, kind::text as kind, ref from achievements where id = %s and user_id = %s",
            (achievement_id, user_id),
        )
    ).fetchone()
    if a is None:
        return None
    monday = progress.week_start(ctx["today"])
    ref: dict = a["ref"] or {}
    out: dict[str, Any] = {
        "id": a["id"],
        "kind": a["kind"],
        "ref": ref,
        "ring": 1.0,
        "ring_label": None,
        "subtitle": None,
        "before": None,
        "now": None,
        "readiness": None,
    }
    course_id: UUID | None = None

    if a["kind"] == "topic_mastered" and ref.get("topic_id"):
        topic = await (
            await conn.execute(
                "select t.title, m.course_id, m.mastery, c.code from topic_mastery m "
                "join topics t on t.id = m.topic_id left join courses c on c.id = m.course_id "
                "where m.user_id = %s and m.topic_id = %s",
                (user_id, ref["topic_id"]),
            )
        ).fetchone()
        if topic:
            rows = await (
                await conn.execute(
                    progress_job._ANSWERS + " and q.topic_id = %s"
                    " and (aa.answered_at at time zone p.timezone)::date < %s",
                    (user_id, ref["topic_id"], monday),
                )
            ).fetchall()
            before, _ = _fraction_mastery(rows)
            now = float(topic["mastery"])
            course_id = topic["course_id"]
            out |= {
                "ring": now,
                "subtitle": " · ".join(x for x in (topic["title"], topic["code"]) if x),
                "before": before,
                "now": now,
            }
    elif a["kind"] == "personal_best" and ref.get("attempt_id"):
        row = await (
            await conn.execute(
                """
                select a.score / nullif(a.max_score, 0) as pct, d.course_id, c.code,
                  (select max(b.score / b.max_score) from quiz_attempts b
                   where b.user_id = a.user_id and b.id <> a.id and b.status = 'completed'
                     and b.max_score > 0 and b.started_at < a.started_at) as best
                from quiz_attempts a
                join quizzes z on z.id = a.quiz_id join documents d on d.id = z.document_id
                left join courses c on c.id = d.course_id
                where a.id = %s and a.user_id = %s
                """,
                (ref["attempt_id"], user_id),
            )
        ).fetchone()
        if row and row["pct"] is not None:
            course_id = row["course_id"]
            out |= {
                "ring": float(row["pct"]),
                "subtitle": f"Your best quiz score{' · ' + row['code'] if row['code'] else ''}",
                "before": None if row["best"] is None else float(row["best"]),
                "now": float(row["pct"]),
            }
    elif a["kind"] == "readiness_up" and ref.get("course_id"):
        course_id = UUID(ref["course_id"])
    elif a["kind"] == "weekly_goal":
        counted = await _counted_days(conn, user_id, ctx["today"])
        goal = ctx["weekly_goal_days"]
        days = progress.days_this_week(counted, ctx["today"])
        in_a_row = progress.weeks_in_a_row(counted, goal, ctx["today"])
        out |= {
            "ring": min(1.0, days / goal) if goal else 1.0,
            "ring_label": f"{days}/{goal}",
            "subtitle": f"{days} of {goal} days"
            + (f" · {in_a_row} weeks in a row" if in_a_row > 1 else ""),
        }

    readiness = await _course_readiness(conn, user_id, course_id, monday)
    out["readiness"] = readiness
    if a["kind"] == "readiness_up" and readiness:
        out |= {
            "ring": readiness["now"],
            "subtitle": f"{readiness['code']} readiness",
            "before": readiness["before"],
            "now": readiness["now"],
        }
    if out["ring_label"] is None:
        out["ring_label"] = f"{round(out['ring'] * 100)}%"
    return out


# --- Daily 5 (FR-HAB-01) -------------------------------------------------------------------------


async def _pick(conn: AsyncConnection, user_id: UUID, today: date) -> list[dict]:
    """Due for review first, then questions from weak topics, then new ones, then anything."""
    params = {"user": user_id, "types": list(progress.OBJECTIVE_TYPES), "d": today}
    picked: list[dict] = []

    async def take(sql: str) -> None:
        if len(picked) >= DAILY5_SIZE:
            return
        rows = await (
            await conn.execute(
                "select p.* from (" + _POOL + ") p " + sql + " limit %(n)s",
                params | {"n": DAILY5_SIZE - len(picked), "skip": [r["id"] for r in picked]},
            )
        ).fetchall()
        picked.extend(rows)

    params["types"] = list(progress.REVIEW_TYPES)  # due flashcards come back here only
    await take(
        "join review_queue rq on rq.question_id = p.id and rq.user_id = %(user)s "
        "where rq.due_on <= %(d)s and p.id <> all(%(skip)s) order by rq.due_on, rq.box"
    )
    params["types"] = list(progress.OBJECTIVE_TYPES)
    await take(
        "join topic_mastery m on m.topic_id = p.topic_id and m.user_id = %(user)s "
        f"where m.answered >= {WEAK_TOPIC_MIN_ANSWERS} and m.mastery < {WEAK_TOPIC_BELOW} "
        "and p.id <> all(%(skip)s) "
        "and not exists (select 1 from review_queue rq where rq.user_id = %(user)s "
        "  and rq.question_id = p.id and rq.due_on > %(d)s) "
        "order by m.mastery, random()"
    )
    await take(
        "where p.id <> all(%(skip)s) and not exists (select 1 from review_queue rq "
        "where rq.user_id = %(user)s and rq.question_id = p.id) order by random()"
    )
    await take(
        "left join review_queue rq on rq.question_id = p.id and rq.user_id = %(user)s "
        "where p.id <> all(%(skip)s) order by rq.due_on nulls first, random()"
    )
    return picked


async def daily5(conn: AsyncConnection, user_id: UUID) -> dict | None:
    """Today's Daily 5, made on first request. None when there's nothing to practise yet."""
    ctx = await context(conn, user_id)
    if ctx is None:
        return None
    today: date = ctx["today"]
    existing = await _daily5_row(conn, user_id, today)
    if existing is None:
        picked = await _pick(conn, user_id, today)
        if not picked:
            return None
        await conn.execute(
            """
            insert into quizzes (user_id, document_id, question_set_id, title, mode_default,
                                 kind, question_ids, daily5_day)
            values (%s, %s, %s, 'Daily 5', 'practice', 'daily5', %s, %s)
            on conflict (user_id, daily5_day) where kind = 'daily5' do nothing
            """,
            (
                user_id,
                picked[0]["document_id"],
                picked[0]["question_set_id"],
                [r["id"] for r in picked],
                today,
            ),
        )
        existing = await _daily5_row(conn, user_id, today)
    return existing


async def _daily5_row(conn: AsyncConnection, user_id: UUID, today: date) -> dict | None:
    return await (
        await conn.execute(
            """
            select z.id as quiz_id, z.daily5_day as day, cardinality(z.question_ids) as size,
                   (select a.id from quiz_attempts a where a.quiz_id = z.id
                    order by a.started_at desc limit 1) as attempt_id,
                   exists (select 1 from quiz_attempts a where a.quiz_id = z.id
                           and a.status = 'completed') as done
            from quizzes z
            where z.user_id = %s and z.kind = 'daily5' and z.daily5_day = %s
            """,
            (user_id, today),
        )
    ).fetchone()


# --- Reading time (FR-HAB-02) --------------------------------------------------------------------


async def record_reading(conn: AsyncConnection, user_id: UUID, events: list[dict]) -> int:
    """Adds batched reading seconds per topic and per local day (offline reading counts by when it
    happened). Topics the student can't read and stale or future events are skipped. Returns how
    many events counted."""
    ctx = await context(conn, user_id)
    if ctx is None:
        return 0
    local_now: datetime = ctx["local_now"]
    counted = 0
    touched: set[date] = set()
    for e in events:
        at = await (
            await conn.execute("select %s at time zone %s as local", (e["at"], ctx["timezone"]))
        ).fetchone()
        local: datetime = at["local"]
        if not (local_now - READING_EVENT_MAX_AGE <= local <= local_now + timedelta(minutes=5)):
            continue
        seconds = max(1, min(int(e["seconds"]), MAX_READING_EVENT_SECONDS))
        readable = await (
            await conn.execute(
                "select 1 from topics t join documents d on d.source_file_id = t.source_file_id "
                "where t.id = %s and can_read_document(d.id, %s) limit 1",
                (e["topic_id"], user_id),
            )
        ).fetchone()
        if not readable:
            continue
        await conn.execute(
            """
            insert into topic_reads (user_id, topic_id, seconds, last_read_at)
            values (%s, %s, %s, now())
            on conflict (user_id, topic_id) do update set
              seconds = topic_reads.seconds + excluded.seconds, last_read_at = now()
            """,
            (user_id, e["topic_id"], seconds),
        )
        day = local.date()
        await conn.execute(
            """
            insert into study_days (user_id, day, reading_seconds) values (%s, %s, %s)
            on conflict (user_id, day) do update
              set reading_seconds = study_days.reading_seconds + excluded.reading_seconds
            """,
            (user_id, day, seconds),
        )
        touched.add(day)
        counted += 1
    for day in touched:
        row = await (
            await conn.execute(
                "select questions_answered, daily5_done, reading_seconds from study_days "
                "where user_id = %s and day = %s",
                (user_id, day),
            )
        ).fetchone()
        await conn.execute(
            "update study_days set counted = %s where user_id = %s and day = %s",
            (
                progress.counts_as_study_day(
                    row["questions_answered"], row["daily5_done"], row["reading_seconds"]
                ),
                user_id,
                day,
            ),
        )
    return counted


# --- Weekly recap (FR-HAB-06) --------------------------------------------------------------------


async def recap(conn: AsyncConnection, user_id: UUID, monday: date) -> dict | None:
    """What the student did in the week starting `monday`. The app draws the image."""
    ctx = await context(conn, user_id)
    if ctx is None:
        return None
    sunday = monday + timedelta(days=6)
    totals = await (
        await conn.execute(
            """
            select
              coalesce((select sum(questions_answered) from study_days
                        where user_id = %(u)s and day between %(m)s and %(s)s), 0) as questions,
              (select count(*) from study_days
               where user_id = %(u)s and day between %(m)s and %(s)s and counted) as study_days,
              (select count(*) from topic_mastery
               where user_id = %(u)s and mastered_at is not null
                 and (mastered_at at time zone %(tz)s)::date between %(m)s and %(s)s)
                as topics_mastered
            """,
            {"u": user_id, "m": monday, "s": sunday, "tz": ctx["timezone"]},
        )
    ).fetchone()
    who = await (
        await conn.execute(
            "select p.display_name, p.level, p.show_identity_on_links, p.invite_code, "
            "coalesce(i.short_name, i.name, p.institution_other) as institution "
            "from profiles p left join institutions i on i.id = p.institution_id where p.id = %s",
            (user_id,),
        )
    ).fetchone()
    focus = await _focus_course(conn, user_id, ctx["today"])
    readiness = None
    if focus:
        snap = await (
            await conn.execute(
                """
                select
                  (select readiness from readiness_snapshots where user_id = %(u)s
                   and course_id = %(c)s and day <= %(s)s order by day desc limit 1) as at_end,
                  (select readiness from readiness_snapshots where user_id = %(u)s
                   and course_id = %(c)s and day < %(m)s order by day desc limit 1) as before
                """,
                {"u": user_id, "c": focus["id"], "m": monday, "s": sunday},
            )
        ).fetchone()
        if snap["at_end"] is not None:
            end = float(snap["at_end"])
            readiness = {
                "course_id": focus["id"],
                "code": focus["code"],
                "accent": focus["accent"],
                "value": end,
                "change": None if snap["before"] is None else round(end - float(snap["before"]), 3),
            }
    counted = await _counted_days(conn, user_id, min(sunday, ctx["today"]))
    local_now: datetime = ctx["local_now"]
    ready_at = datetime.combine(sunday, datetime.min.time()) + timedelta(hours=RECAP_READY_HOUR)
    return {
        "week_start": monday,
        "week_end": sunday,
        "ready": local_now.replace(tzinfo=None) >= ready_at,
        "questions_answered": totals["questions"],
        "study_days": totals["study_days"],
        "goal": ctx["weekly_goal_days"],
        "weeks_in_a_row": progress.weeks_in_a_row(
            counted, ctx["weekly_goal_days"], min(sunday, ctx["today"])
        ),
        "topics_mastered": totals["topics_mastered"],
        "readiness": readiness,
        "name": who["display_name"],
        "institution": who["institution"],
        "level": None if who["level"] == "other" else who["level"],
        "show_identity": who["show_identity_on_links"],
        "invite_code": who["invite_code"],
    }
