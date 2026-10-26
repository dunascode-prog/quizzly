"""FR-SEC-10 input caps and FR-SEC-18 idempotent ids: readable 422s and 409s, never 500."""

import uuid
from datetime import UTC, datetime

import pytest

from app.domain import quizzes
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

USER = uuid.uuid4()


def auth():
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, sub=str(USER))}"}


def too_long(r, limit):
    assert r.status_code == 422
    assert r.json()["detail"][0]["msg"] == f"That's too long. Keep it under {limit:,} characters."


def test_over_long_input_gets_a_readable_422(client):
    attempt, doc, course = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    answer = {"id": str(uuid.uuid4()), "question_id": str(uuid.uuid4()), "response": "x" * 5001}
    too_long(
        client.put(f"/v1/attempts/{attempt}/answers", headers=auth(), json={"answers": [answer]}),
        5000,
    )
    too_long(
        client.post(
            f"/v1/documents/{doc}/chat/messages", headers=auth(), json={"text": "x" * 2001}
        ),
        2000,
    )
    too_long(
        client.post("/v1/courses", headers=auth(), json={"code": "CSC 101", "title": "t" * 81}), 80
    )
    too_long(client.patch(f"/v1/documents/{doc}", headers=auth(), json={"title": "t" * 81}), 80)
    too_long(client.patch(f"/v1/courses/{course}", headers=auth(), json={"title": "t" * 81}), 80)


def test_limits_are_inclusive(client):
    from app.api import chat
    from app.api import quizzes as quiz_api

    assert quiz_api.AnswerIn(id=uuid.uuid4(), question_id=uuid.uuid4(), response="x" * 5000)
    assert chat.AskIn(text="x" * 2000)


@pytest.fixture
def fake_attempts(client, monkeypatch):
    def attempt_row():
        return {
            "id": uuid.uuid4(),
            "quiz_id": uuid.uuid4(),
            "mode": "practice",
            "status": "in_progress",
            "started_at": datetime.now(UTC),
            "submitted_at": None,
            "current_index": 0,
            "score": None,
            "max_score": None,
            "topic_breakdown": None,
            "question_set_id": uuid.uuid4(),
            "title": "Stacks",
            "document_id": uuid.uuid4(),
            "time_limit_sec": None,
        }

    async def get_quiz(conn, user_id, quiz_id):
        return {"status": "ready"}

    async def get_attempt(conn, user_id, attempt_id):
        # A brand-new attempt id isn't this student's (it's someone else's), but saving needs one.
        return None if attempt_id == STARTING else attempt_row()

    async def start_attempt(conn, user_id, quiz_id, attempt_id, mode):
        return None  # the id belongs to another student's attempt

    async def save_answers(conn, attempt, answers, current_index):
        raise quizzes.IdInUse(str(answers[0]["id"]))

    for name, fn in [
        ("get_quiz", get_quiz),
        ("get_attempt", get_attempt),
        ("start_attempt", start_attempt),
        ("save_answers", save_answers),
    ]:
        monkeypatch.setattr(quizzes, name, fn)


STARTING = uuid.uuid4()


def test_ids_already_used_elsewhere_get_409_not_500(client, fake_attempts):
    quiz = uuid.uuid4()
    r = client.post(
        f"/v1/quizzes/{quiz}/attempts",
        headers=auth(),
        json={"id": str(STARTING), "mode": "practice"},
    )
    assert r.status_code == 409 and "already used" in r.json()["detail"]
    body = {"answers": [{"id": str(uuid.uuid4()), "question_id": str(uuid.uuid4()), "response": 1}]}
    for url in (f"/v1/attempts/{uuid.uuid4()}/answers", f"/v1/attempts/{uuid.uuid4()}/submit"):
        send = client.put if url.endswith("answers") else client.post
        r = send(url, headers=auth(), json=body)
        assert r.status_code == 409, url
