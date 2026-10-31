"""Plans v2 (owner, 2026-10-31): free limits, rollover, padlocks, kind limit messages, plan
reminders (FR-LIM-01/08, FR-PLAN-04..06)."""

import uuid
from datetime import date
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.domain import plans
from app.worker import reminders
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

URL = f"/v1/documents/{uuid.uuid4()}/quizzes"


def auth() -> dict:
    return {"Authorization": f"Bearer {make_token(JWT_SECRET)}"}


def test_free_limits_per_day():
    s = Settings(_env_file=None)
    got = {r: plans.daily_limit(s, "free", r) for r in plans.AI_RESOURCES}
    assert got == {
        "upload": 3,
        "question_set": 5,
        "explanation": 20,
        "chat_message": 20,
        "marking": 5,
    }
    assert plans.PAID_LIMITS["student"] == {
        "upload": 10,
        "question_set": 30,
        "explanation": 60,
        "chat_message": 80,
        "marking": 40,
    }


@pytest.mark.parametrize(
    "body, locked",
    [
        ({"count": 20}, "quiz_size"),
        ({"count": 30}, "quiz_size"),
        ({"count": 10, "mode": "exam", "time_limit_min": 30}, "exam_timer"),
        ({"count": 10, "style_id": str(uuid.uuid4())}, "past_paper"),
        ({"count": 10, "new_questions": True}, "fresh_set"),
    ],
    ids=["20q", "30q", "exam-timer", "past-paper", "fresh-set"],
)
def test_free_students_meet_a_padlock(client, body, locked):
    r = client.post(URL, headers=auth(), json=body)
    assert r.status_code == 403 and r.json()["detail"] == plans.LOCKED[locked]


@pytest.fixture
def no_document(monkeypatch):
    """Past the padlocks the route looks the document up; there isn't one (404)."""
    from app.domain import study

    async def ready_document(conn, user_id, document_id):
        return None

    monkeypatch.setattr(study, "ready_document", ready_document)


def test_free_students_can_still_do_5_and_10_question_and_untimed_exams(client, no_document):
    # Past the padlock, the request reaches the document lookup (404 here: there's no document).
    for body in ({"count": 5}, {"count": 10}, {"count": 10, "mode": "exam"}):
        assert client.post(URL, headers=auth(), json=body).status_code == 404


def test_paid_students_have_no_padlocks(client, student_plan, no_document):
    for body in ({"count": 30}, {"count": 20, "mode": "exam", "time_limit_min": 30}):
        assert client.post(URL, headers=auth(), json=body).status_code == 404


def test_past_paper_uploads_are_locked_on_free(client):
    body = {
        "filename": "p.pdf",
        "size_bytes": 9,
        "kind": "past_paper",
        "course_id": str(uuid.uuid4()),
    }
    r = client.post("/v1/documents", headers=auth(), json=body)
    assert r.status_code == 403 and r.json()["detail"] == plans.LOCKED["past_paper"]


def test_limit_messages_are_kind_and_mention_student_only_to_free():
    s = Settings(_env_file=None)
    assert plans.used_up(s, "free", "question_set") == (
        "You've used your quiz sets for now. 5 more arrive at midnight. Student gives you 30 a day."
    )
    assert plans.used_up(s, "student", "question_set") == (
        "You've used your quiz sets for now. 30 more arrive at midnight. "
        "Premium gives you 50 a day."
    )
    assert plans.used_up(s, "premium", "question_set") == (
        "You've used your quiz sets for now. 50 more arrive at midnight."
    )


# --- plan reminders (FR-PLAN-05) ------------------------------------------------------------------


class Conn:
    def __init__(self, recent=False, hits=None):
        self.answers = {"select plan_reminded_at": {"recent": recent}, "select resource": hits}
        self.ran = []

    async def execute(self, sql, params=None):
        self.ran.append(" ".join(sql.split()))
        answer = next(
            (v for k, v in self.answers.items() if " ".join(sql.split()).startswith(k)), None
        )

        class Cur:
            async def fetchone(self):
                return answer

        return Cur()


@pytest.fixture
def sent(monkeypatch):
    out = []

    async def send(conn, student, type_, title, body, target, key):
        out.append((type_, title, body, target, key))
        return True

    async def free(conn, user_id, settings):
        return "free"

    monkeypatch.setattr(reminders, "_send", send)
    monkeypatch.setattr(reminders.plans, "effective_plan", free)
    return out


STUDENT = {"id": uuid.uuid4(), "timezone": "Africa/Lagos"}


async def test_a_reminder_after_running_out_on_two_days(sent):
    conn = Conn(hits={"resource": "question_set", "days": 3})
    assert await reminders._plan_reminder(conn, STUDENT, date(2026, 11, 2))
    type_, title, body, target, key = sent[0]
    assert type_ == "plan_reminder" and target == {"route": "/plans"}
    assert title == "You ran out of quiz sets on 3 days this week"
    assert body == (
        "Student gives you 30 a day, and unused ones save up for a week. "
        "You can try it free for 7 days."
    )
    assert key == "plan:2026-45"  # one a week
    assert any(s.startswith("update profiles set plan_reminded_at") for s in conn.ran)


@pytest.mark.parametrize(
    "conn",
    [
        Conn(hits={"resource": "question_set", "days": 1}),  # ran out once: no reminder
        Conn(hits=None),
        Conn(recent=True, hits={"resource": "upload", "days": 5}),  # reminded this week already
    ],
    ids=["once", "never", "recent"],
)
async def test_no_reminder_otherwise(sent, conn):
    assert not await reminders._plan_reminder(conn, STUDENT, date(2026, 11, 2))
    assert sent == []


async def test_student_plans_hear_about_premium_and_premium_hears_nothing(sent, monkeypatch):
    plan = {"now": "student"}

    async def current(conn, user_id, settings):
        return plan["now"]

    monkeypatch.setattr(reminders.plans, "effective_plan", current)
    conn = Conn(hits={"resource": "question_set", "days": 3})
    assert await reminders._plan_reminder(conn, STUDENT, date(2026, 11, 2))
    assert sent[0][2] == "Premium gives you 50 a day, and unused ones save up for a week."
    plan["now"] = "premium"
    sent.clear()
    assert not await reminders._plan_reminder(
        Conn(hits={"resource": "upload", "days": 5}), STUDENT, date(2026, 11, 2)
    )
    assert sent == []


def test_the_plan_reminder_has_its_own_toggle():
    from app.api.home import NotificationTypes
    from app.domain import settings as settings_domain

    assert "plans" in NotificationTypes.model_fields
    assert "plans" in settings_domain.NOTIFICATION_TYPES


def test_padlocks_follow_the_effective_plan():
    assert plans.is_free("free") and plans.is_free("capped")
    assert not plans.is_free("student") and not plans.is_free("premium")
    assert SimpleNamespace  # keep the import used
