"""`update_mastery` job and the daily readiness snapshot (ARCHITECTURE §5.8).

Queued when an attempt is completed (app/domain/quizzes.py). Everything is recomputed from the
student's answers, so running a job twice, or two jobs for the same student, gives the same result.
"""

import json
import logging
from datetime import date
from uuid import UUID

from psycopg import AsyncConnection

from app.domain import progress

log = logging.getLogger("quizzly.progress")

_ANSWERS = """
select aa.question_id, q.topic_id, q.type::text as type, q.marks, aa.score, aa.is_correct,
       (aa.answered_at at time zone p.timezone)::date as day, aa.answered_at
from attempt_answers aa
join quiz_attempts a on a.id = aa.attempt_id
join questions q on q.id = aa.question_id
join profiles p on p.id = a.user_id
where a.user_id = %s
"""


async def update_mastery(conn: AsyncConnection, job: dict) -> None:
    user_id = UUID(job["payload"]["user_id"])
    attempt_id = UUID(job["payload"]["attempt_id"])
    profile = await (
        await conn.execute(
            "select weekly_goal_days, (now() at time zone timezone)::date as today "
            "from profiles where id = %s and deleted_at is null",
            (user_id,),
        )
    ).fetchone()
    if profile is None:
        return
    today: date = profile["today"]
    attempt = await (
        await conn.execute(
            "select a.status::text as status, a.score, a.max_score, d.course_id, z.kind, "
            "z.daily5_day "
            "from quiz_attempts a "
            "join quizzes z on z.id = a.quiz_id join documents d on d.id = z.document_id "
            "where a.id = %s and a.user_id = %s",
            (attempt_id, user_id),
        )
    ).fetchone()
    if attempt is None:
        return  # deleted since
    answered = await (
        await conn.execute(_ANSWERS + " and aa.attempt_id = %s", (user_id, attempt_id))
    ).fetchall()

    newly_mastered = await _topics(conn, user_id, attempt["course_id"], answered)
    await _review_queue(conn, user_id, answered)
    days = {a["day"] for a in answered}
    if attempt["kind"] == "daily5" and attempt["status"] == "completed":
        # Finishing the Daily 5 makes it a study day (FR-HAB-02).
        await conn.execute(
            "insert into study_days (user_id, day, daily5_done) values (%s, %s, true) "
            "on conflict (user_id, day) do update set daily5_done = true",
            (user_id, attempt["daily5_day"]),
        )
        days.add(attempt["daily5_day"])
    await _study_days(conn, user_id, days)
    if attempt["course_id"]:
        await snapshot(conn, user_id, attempt["course_id"], today)
    await _achievements(conn, user_id, attempt_id, attempt, profile, newly_mastered)


async def _topics(
    conn: AsyncConnection, user_id: UUID, course_id: UUID | None, answered: list[dict]
) -> list[UUID]:
    """Recomputes mastery for the topics this attempt touched; returns the newly mastered ones."""
    newly: list[UUID] = []
    for topic_id in {a["topic_id"] for a in answered if a["topic_id"]}:
        rows = await (
            await conn.execute(
                _ANSWERS + " and q.topic_id = %s order by aa.answered_at", (user_id, topic_id)
            )
        ).fetchall()
        fractions = [
            f
            for r in rows
            if (f := progress.answer_fraction(r["score"], r["is_correct"], r["marks"])) is not None
        ]
        mastery = progress.topic_mastery(fractions)
        mastered = progress.is_mastered(mastery, len(fractions))
        before = await (
            await conn.execute(
                "select mastered_at from topic_mastery where user_id = %s and topic_id = %s",
                (user_id, topic_id),
            )
        ).fetchone()
        await conn.execute(
            """
            insert into topic_mastery (user_id, topic_id, course_id, answered, mastery, mastered_at)
            values (%s, %s, %s, %s, %s, case when %s then now() end)
            on conflict (user_id, topic_id) do update set
              course_id = coalesce(excluded.course_id, topic_mastery.course_id),
              answered = excluded.answered, mastery = excluded.mastery,
              mastered_at = coalesce(topic_mastery.mastered_at, excluded.mastered_at),
              updated_at = now()
            """,
            (user_id, topic_id, course_id, len(fractions), mastery, mastered),
        )
        if mastered and not (before and before["mastered_at"]):
            newly.append(topic_id)
    return newly


async def _review_queue(conn: AsyncConnection, user_id: UUID, answered: list[dict]) -> None:
    """Leitner state for each objective question answered (the Daily 5 only asks those)."""
    for question_id in {
        a["question_id"] for a in answered if a["type"] in progress.OBJECTIVE_TYPES
    }:
        rows = await (
            await conn.execute(
                _ANSWERS + " and aa.question_id = %s and aa.is_correct is not null "
                "order by aa.answered_at",
                (user_id, question_id),
            )
        ).fetchall()
        if not rows:
            continue
        box, due_on, last = progress.leitner([(r["day"], r["is_correct"]) for r in rows])
        await conn.execute(
            """
            insert into review_queue (user_id, question_id, box, due_on, last_result)
            values (%s, %s, %s, %s, %s)
            on conflict (user_id, question_id) do update set
              box = excluded.box, due_on = excluded.due_on, last_result = excluded.last_result
            """,
            (user_id, question_id, box, due_on, last),
        )


async def _study_days(conn: AsyncConnection, user_id: UUID, days: set[date]) -> None:
    """Questions answered per local day, and whether the day counts (FR-HAB-02). Reading time
    and the Daily 5 flag are written by their own endpoints and kept as they are."""
    for day in days:
        n = (
            await (
                await conn.execute(
                    "select count(*) as n from (" + _ANSWERS + ") x where x.day = %s",
                    (user_id, day),
                )
            ).fetchone()
        )["n"]
        row = await (
            await conn.execute(
                """
                insert into study_days (user_id, day, questions_answered) values (%s, %s, %s)
                on conflict (user_id, day) do update
                  set questions_answered = excluded.questions_answered
                returning daily5_done, reading_seconds
                """,
                (user_id, day, n),
            )
        ).fetchone()
        counted = progress.counts_as_study_day(n, row["daily5_done"], row["reading_seconds"])
        await conn.execute(
            "update study_days set counted = %s where user_id = %s and day = %s",
            (counted, user_id, day),
        )


async def course_readiness(conn: AsyncConnection, user_id: UUID, course_id: UUID) -> float:
    """FR-HOME-03 over the course's top-level topics (all its ready documents)."""
    rows = await (
        await conn.execute(
            """
            select distinct t.id, t.token_count, coalesce(m.mastery, 0) as mastery
            from documents d
            join topics t on t.source_file_id = d.source_file_id and t.parent_id is null
            left join topic_mastery m on m.user_id = %s and m.topic_id = t.id
            where d.course_id = %s and d.status = 'ready' and can_read_document(d.id, %s)
            """,
            (user_id, course_id, user_id),
        )
    ).fetchall()
    return progress.readiness((r["token_count"], float(r["mastery"])) for r in rows)


async def snapshot(conn: AsyncConnection, user_id: UUID, course_id: UUID, day: date) -> float:
    value = await course_readiness(conn, user_id, course_id)
    await conn.execute(
        """
        insert into readiness_snapshots (user_id, course_id, day, readiness) values (%s, %s, %s, %s)
        on conflict (user_id, course_id, day) do update set readiness = excluded.readiness
        """,
        (user_id, course_id, day, value),
    )
    return value


async def snapshot_all(conn: AsyncConnection) -> int:
    """Daily readiness for every course a student has practised, so "Up X% this week" has a value
    from 7 days ago even on days they didn't study. Runs hourly; a day's row is written once."""
    pairs = await (
        await conn.execute(
            """
            select distinct m.user_id, m.course_id, (now() at time zone p.timezone)::date as today
            from topic_mastery m
            join profiles p on p.id = m.user_id and p.deleted_at is null
            join courses c on c.id = m.course_id
            where not exists (
              select 1 from readiness_snapshots s
              where s.user_id = m.user_id and s.course_id = m.course_id
                and s.day = (now() at time zone p.timezone)::date
            )
            """
        )
    ).fetchall()
    for p in pairs:
        await snapshot(conn, p["user_id"], p["course_id"], p["today"])
    return len(pairs)


async def _achievement(conn: AsyncConnection, user_id: UUID, kind: str, ref: dict) -> None:
    """Each achievement once (unique on user, kind, ref); the app celebrates unseen ones."""
    await conn.execute(
        "insert into achievements (user_id, kind, ref) values (%s, %s, %s) on conflict do nothing",
        (user_id, kind, json.dumps(ref, sort_keys=True)),
    )


async def _achievements(
    conn: AsyncConnection,
    user_id: UUID,
    attempt_id: UUID,
    attempt: dict,
    profile: dict,
    newly_mastered: list[UUID],
) -> None:
    today: date = profile["today"]
    week = progress.week_start(today).isoformat()
    for topic_id in newly_mastered:
        await _achievement(conn, user_id, "topic_mastered", {"topic_id": str(topic_id)})

    # Personal best: a better score than every earlier completed quiz (needs one to beat).
    if attempt["status"] == "completed" and attempt["max_score"]:
        pct = float(attempt["score"] or 0) / float(attempt["max_score"])
        best = await (
            await conn.execute(
                "select max(score / max_score) as best from quiz_attempts "
                "where user_id = %s and id <> %s and status = 'completed' and max_score > 0",
                (user_id, attempt_id),
            )
        ).fetchone()
        if best["best"] is not None and pct > float(best["best"]):
            await _achievement(conn, user_id, "personal_best", {"attempt_id": str(attempt_id)})

    # Readiness up 10 points on the value from a week ago.
    if attempt["course_id"]:
        rows = await (
            await conn.execute(
                """
                select
                  (select readiness from readiness_snapshots
                   where user_id = %s and course_id = %s and day = %s) as now,
                  (select readiness from readiness_snapshots
                   where user_id = %s and course_id = %s and day <= %s - 7
                   order by day desc limit 1) as week_ago
                """,
                (user_id, attempt["course_id"], today, user_id, attempt["course_id"], today),
            )
        ).fetchone()
        if (
            rows["now"] is not None
            and rows["week_ago"] is not None
            and float(rows["now"]) - float(rows["week_ago"]) >= progress.READINESS_UP
        ):
            ref = {"course_id": str(attempt["course_id"]), "week": week}
            await _achievement(conn, user_id, "readiness_up", ref)

    counted = [
        r["day"]
        for r in await (
            await conn.execute(
                "select day from study_days where user_id = %s and counted and day > %s - 400",
                (user_id, today),
            )
        ).fetchall()
    ]
    goal = profile["weekly_goal_days"]
    if progress.days_this_week(counted, today) >= goal:
        await _achievement(conn, user_id, "weekly_goal", {"week": week})

    totals = await (
        await conn.execute(
            """
            select
              (select count(*) from topic_mastery where user_id = %s and mastered_at is not null)
                as mastered,
              (select count(*) from referrals where inviter_id = %s and status = 'credited')
                as invites
            """,
            (user_id, user_id),
        )
    ).fetchone()
    in_a_row = progress.weeks_in_a_row(counted, goal, today)
    for theme in progress.theme_unlocks(totals["mastered"], in_a_row, totals["invites"]):
        await _achievement(conn, user_id, "theme_unlocked", {"theme": theme})
