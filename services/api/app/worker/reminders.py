"""Reminder scheduler (FR-HAB-08, FR-HAB-06): runs every 15 minutes in the worker.

Everything is in the student's own time zone. Reminders are kind and few: never in quiet hours,
at most 2 a day, the daily one only if they haven't studied yet, each type behind its toggle.
"""

import logging
from datetime import date, datetime, time, timedelta

from psycopg import AsyncConnection

from app.core.config import get_settings
from app.domain import notifications, plans, usage
from app.worker import progress
from app.worker.push import in_quiet_hours

log = logging.getLogger("quizzly.reminders")

TICK = timedelta(minutes=15)
MAX_A_DAY = 2
EXAM_DAYS = (7, 3, 1)  # countdown reminders this many days before an exam
RECAP_AT = time(18, 0)  # Sunday 6 PM local
PLAN_AT = time(17, 0)  # plan reminders, 5 PM local, at most once a week (FR-PLAN-05)
PLAN_HIT_DAYS = 2  # only after running out on 2 or more days in the last week
SUNDAY = 6


def in_window(now: time, at: time, width: timedelta = TICK) -> bool:
    """True during the 15 minutes starting at `at` (the scheduler runs once in that window)."""
    start = datetime.combine(date.min, at)
    current = datetime.combine(date.min, now)
    return start <= current < start + width


# Students with notification settings, their local time, and what they need for the checks.
_CANDIDATES = """
select p.id, p.timezone, (now() at time zone p.timezone) as local_now,
       s.daily_reminder, s.daily_reminder_time, s.quiet_start, s.quiet_end, s.types
from profiles p
join notification_settings s on s.user_id = p.id
where p.deleted_at is null
"""


async def _send(
    conn: AsyncConnection,
    student: dict,
    type_: str,
    title: str,
    body: str,
    target: dict,
    key: str,
) -> bool:
    """One reminder, at most once per key and at most 2 a day. Returns whether it was sent."""
    exists = await (
        await conn.execute(
            "select 1 from notifications where user_id = %s and dedupe_key = %s",
            (student["id"], key),
        )
    ).fetchone()
    if exists:
        return False
    if (
        await usage.take(conn, student["id"], "reminder_push", MAX_A_DAY, student["timezone"])
        is None
    ):
        return False  # two already today
    await notifications.notify(conn, student["id"], type_, title, body, target, dedupe_key=key)
    return True


async def _daily(conn: AsyncConnection, student: dict, today: date) -> bool:
    """FR-HAB-08: the daily study reminder, only if they haven't studied today."""
    studied = await (
        await conn.execute(
            "select counted from study_days where user_id = %s and day = %s",
            (student["id"], today),
        )
    ).fetchone()
    if studied and studied["counted"]:
        return False
    due = await (
        await conn.execute(
            "select count(*) as n from review_queue where user_id = %s and due_on <= %s",
            (student["id"], today),
        )
    ).fetchone()
    body = (
        f"{due['n']} question{'s' if due['n'] != 1 else ''} ready for review · about 3 minutes"
        if due["n"]
        else "Your Daily 5 is ready · about 3 minutes"
    )
    return await _send(
        conn,
        student,
        "reminder_due",
        "Time for your Daily 5",
        body,
        {"route": "/daily5"},
        f"reminder:daily:{today}",
    )


async def _exams(conn: AsyncConnection, student: dict, today: date) -> int:
    """Exam countdown 7, 3 and 1 days before, with readiness (FR-HOME-02, FR-HAB-08)."""
    sent = 0
    for c in await (
        await conn.execute(
            "select id, code, exam_date from courses where user_id = %s and exam_date = any(%s)",
            (student["id"], [today + timedelta(days=d) for d in EXAM_DAYS]),
        )
    ).fetchall():
        days = (c["exam_date"] - today).days
        ready = round(await progress.course_readiness(conn, student["id"], c["id"]) * 100)
        when = "tomorrow" if days == 1 else f"in {days} days"
        if await _send(
            conn,
            student,
            "reminder_exam",
            f"{c['code']} exam {when}",
            f"You're {ready}% ready. A few questions today will help."
            if ready
            else "A few questions today will get you started.",  # kind copy (DESIGN §11)
            {"route": "/course/[id]", "params": {"id": str(c["id"])}},
            f"reminder:exam:{c['id']}:{c['exam_date']}:{days}",
        ):
            sent += 1
    return sent


async def _recap(conn: AsyncConnection, student: dict, today: date) -> bool:
    """FR-HAB-06: the weekly recap is ready, Sunday 6 PM."""
    monday = today - timedelta(days=today.weekday())
    week = await (
        await conn.execute(
            "select coalesce(sum(questions_answered), 0) as q, "
            "count(*) filter (where counted) as d "
            "from study_days where user_id = %s and day between %s and %s",
            (student["id"], monday, today),
        )
    ).fetchone()
    if not week["q"] and not week["d"]:
        return False  # nothing to celebrate; no guilt (DESIGN §11)
    return await _send(
        conn,
        student,
        "recap_ready",
        "Your week in Quizzly",
        f"{week['q']} questions · {week['d']} study days. Share your recap?",
        {"route": "/recap/[week]", "params": {"week": monday.isoformat()}},
        f"recap:{monday}",
    )


async def schedule_reminders(conn: AsyncConnection) -> int:
    """One pass over every student. Returns how many reminders were sent."""
    sent = 0
    for student in await (await conn.execute(_CANDIDATES)).fetchall():
        local: datetime = student["local_now"]
        now, today = local.time(), local.date()
        if in_quiet_hours(now, student["quiet_start"], student["quiet_end"]):
            continue
        types = student["types"] or {}
        at = student["daily_reminder_time"]
        if in_window(now, at):
            if student["daily_reminder"]:
                sent += await _daily(conn, student, today)
            if types.get("exam", True):
                sent += await _exams(conn, student, today)
        if today.weekday() == SUNDAY and in_window(now, RECAP_AT) and types.get("recap", True):
            sent += await _recap(conn, student, today)
        if in_window(now, PLAN_AT) and types.get("plans", True):
            sent += await _plan_reminder(conn, student, today)
    if sent:
        log.info("reminders sent: %d", sent)
    return sent


async def _plan_reminder(conn: AsyncConnection, student: dict, today: date) -> bool:
    """FR-PLAN-05: a free student who ran out of something on 2+ days this week hears, once a week,
    what Student gives. Kind copy, no countdown; off in Reminders → Plan tips."""
    if await plans.effective_plan(conn, student["id"], get_settings()) in plans.PAID:
        return False
    recent = await (
        await conn.execute(
            "select plan_reminded_at > now() - interval '7 days' as recent from profiles "
            "where id = %s",
            (student["id"],),
        )
    ).fetchone()
    if recent and recent["recent"]:
        return False
    hits = await (
        await conn.execute(
            "select resource::text as resource, count(*) as days from limit_hits "
            "where user_id = %s and day > %s - 7 group by resource order by days desc limit 1",
            (student["id"], today),
        )
    ).fetchone()
    if not hits or hits["days"] < PLAN_HIT_DAYS:
        return False
    name = plans.NAMES[hits["resource"]]
    more = plans.PAID_LIMITS["student"][hits["resource"]]
    sent = await _send(
        conn,
        student,
        "plan_reminder",
        f"You ran out of {name} on {hits['days']} days this week",
        f"Student gives you {more} a day, and unused ones save up for a week. "
        f"You can try it free for {get_settings().trial_days} days.",
        {"route": "/plans"},
        f"plan:{today.isocalendar()[0]}-{today.isocalendar()[1]}",
    )
    if sent:
        await conn.execute(
            "update profiles set plan_reminded_at = now() where id = %s", (student["id"],)
        )
    return sent
