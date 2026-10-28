"""Reminder scheduler rules (FR-HAB-08, FR-HAB-06)."""

import uuid
from datetime import date, datetime, time

import pytest

from app.domain import notifications, usage
from app.worker import progress, reminders

USER = uuid.uuid4()
TUESDAY = date(2026, 10, 27)
SUNDAY = date(2026, 11, 1)


def student(local: datetime, **over):
    row = {
        "id": USER,
        "timezone": "Africa/Lagos",
        "local_now": local,
        "daily_reminder": True,
        "daily_reminder_time": time(19, 30),
        "quiet_start": time(23),
        "quiet_end": time(7),
        "types": {"exam": True, "due": True, "recap": True, "mates": False, "ready": True},
    }
    return row | over


class Conn:
    """Answers queries by their first words; `rows` maps a prefix to fetchone/fetchall results."""

    def __init__(self, rows: dict):
        self.rows = rows

    async def execute(self, sql, params=None):
        flat = " ".join(sql.split())
        answer = next((v for k, v in self.rows.items() if k in flat), None)

        class Cur:
            async def fetchone(self):
                return answer[0] if isinstance(answer, list) else answer

            async def fetchall(self):
                return answer if isinstance(answer, list) else []

        return Cur()


@pytest.fixture
def sent(monkeypatch):
    out: list = []
    used = {"n": 0}

    async def notify(conn, user_id, type_, title, body=None, target=None, dedupe_key=None, **kw):
        out.append((type_, title, body, dedupe_key))

    async def take(conn, user_id, resource, limit, tz):
        if used["n"] >= limit:
            return None
        used["n"] += 1
        return used["n"]

    async def readiness(conn, user_id, course_id):
        return 0.64

    monkeypatch.setattr(notifications, "notify", notify)
    monkeypatch.setattr(usage, "take", take)
    monkeypatch.setattr(progress, "course_readiness", readiness)
    return out


def conn_for(s, studied=False, due=3, exams=(), week=(12, 2)):
    return Conn(
        {
            "from profiles p join notification_settings": [s],
            "from notifications where": None,  # not sent before
            "select counted from study_days": {"counted": studied} if studied else None,
            "from review_queue": {"n": due},
            "from courses where": list(exams),
            "sum(questions_answered)": {"q": week[0], "d": week[1]},
        }
    )


async def test_the_daily_reminder_comes_at_the_chosen_time_if_not_studied(sent):
    s = student(datetime.combine(TUESDAY, time(19, 35)))
    assert reminders.in_window(time(19, 35), time(19, 30))
    assert not reminders.in_window(time(19, 45), time(19, 30))
    await reminders.schedule_reminders(conn_for(s))
    assert sent == [
        (
            "reminder_due",
            "Time for your Daily 5",
            "3 questions ready for review · about 3 minutes",
            f"reminder:daily:{TUESDAY}",
        )
    ]


async def test_no_daily_reminder_after_studying(sent):
    s = student(datetime.combine(TUESDAY, time(19, 31)))
    await reminders.schedule_reminders(conn_for(s, studied=True))
    assert sent == []


async def test_nothing_in_quiet_hours(sent):
    s = student(datetime.combine(TUESDAY, time(23, 5)), daily_reminder_time=time(23, 0))
    await reminders.schedule_reminders(conn_for(s))
    assert sent == []


async def test_exam_countdown_and_at_most_two_a_day(sent):
    exams = [
        {"id": uuid.uuid4(), "code": "CSC 225", "exam_date": date(2026, 10, 30)},
        {"id": uuid.uuid4(), "code": "MTH 201", "exam_date": date(2026, 10, 28)},
    ]
    s = student(datetime.combine(TUESDAY, time(19, 30)))
    await reminders.schedule_reminders(conn_for(s, exams=exams))
    assert [x[0] for x in sent] == ["reminder_due", "reminder_exam"]  # the third one waits
    assert sent[1][1] == "CSC 225 exam in 3 days"
    assert "64% ready" in sent[1][2]


async def test_turned_off_types_stay_off(sent):
    s = student(
        datetime.combine(TUESDAY, time(19, 30)),
        daily_reminder=False,
        types={"exam": False},
    )
    exams = [{"id": uuid.uuid4(), "code": "CSC 225", "exam_date": date(2026, 10, 28)}]
    await reminders.schedule_reminders(conn_for(s, exams=exams))
    assert sent == []


async def test_weekly_recap_on_sunday_evening_only_after_a_week_with_study(sent):
    s = student(datetime.combine(SUNDAY, time(18, 5)))
    await reminders.schedule_reminders(conn_for(s))
    assert sent and sent[0][0] == "recap_ready"
    assert sent[0][2] == "12 questions · 2 study days. Share your recap?"
    sent.clear()
    await reminders.schedule_reminders(conn_for(s, week=(0, 0)))
    assert sent == []  # no "you did nothing this week"
