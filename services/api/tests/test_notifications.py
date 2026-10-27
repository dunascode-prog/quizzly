"""Notifications: batching, push rules, Expo receipts and the inbox routes (C5)."""

import json
import uuid
from datetime import UTC, datetime, time, timedelta

import httpx
import pytest

from app.domain import notifications
from app.worker import push
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

USER = uuid.uuid4()


def auth() -> dict:
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, sub=str(USER))}"}


class Conn:
    """Answers each query from `answers` (matched by the SQL's first words); records the rest."""

    def __init__(self, answers: dict[str, object]):
        self.sql: list[tuple[str, object]] = []
        self.answers = answers

    async def execute(self, sql, params=None):
        flat = " ".join(sql.split())
        self.sql.append((flat, params))
        answer = next((v for k, v in self.answers.items() if flat.startswith(k)), None)

        class Cur:
            async def fetchone(self):
                return answer[0] if isinstance(answer, list) and answer else answer

            async def fetchall(self):
                return answer if isinstance(answer, list) else []

        return Cur()

    def ran(self, prefix: str) -> list:
        return [p for s, p in self.sql if s.startswith(prefix)]


# --- batching (FR-NOTIF-06) ----------------------------------------------------------------------


async def test_a_new_notification_queues_a_push():
    conn = Conn({"insert into notifications": {"id": uuid.uuid4(), "push_sent_at": None}})
    await notifications.notify(conn, USER, "document_ready", "Ready", dedupe_key="document:1")
    assert len(conn.ran("insert into jobs")) == 1


async def test_a_batched_update_pushes_at_most_once_an_hour():
    recent = datetime.now(UTC) - timedelta(minutes=20)
    conn = Conn({"insert into notifications": {"id": uuid.uuid4(), "push_sent_at": recent}})
    await notifications.notify(conn, USER, "shared_course_updated", "Kemi added 3 notes")
    assert conn.ran("insert into jobs") == []
    old = datetime.now(UTC) - timedelta(minutes=61)
    conn = Conn({"insert into notifications": {"id": uuid.uuid4(), "push_sent_at": old}})
    await notifications.notify(conn, USER, "shared_course_updated", "Kemi added 4 notes")
    assert len(conn.ran("insert into jobs")) == 1


# --- push rules (FR-NOTIF-03, FR-HAB-08) ---------------------------------------------------------


@pytest.mark.parametrize(
    ("now", "quiet"),
    [(time(23, 30), True), (time(6, 59), True), (time(7, 0), False), (time(12), False)],
)
def test_quiet_hours_wrap_midnight(now, quiet):
    assert push.in_quiet_hours(now, time(23), time(7)) is quiet


def notification(**over):
    row = {
        "id": uuid.uuid4(),
        "user_id": USER,
        "type": "document_ready",
        "title": "Your notes are ready",
        "body": "Stacks is ready to study.",
        "target": {"route": "/document/[id]", "params": {"id": "d"}},
        "read_at": None,
        "types": {"exam": True, "due": True, "recap": True, "mates": False, "ready": True},
        "quiet_start": time(23),
        "quiet_end": time(7),
        "local_time": time(12),
    }
    return row | over


@pytest.fixture
def expo(monkeypatch):
    sent: list = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        sent.append((request.url.path, body))
        if request.url.path.endswith("/send"):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"status": "ok", "id": "ticket-1"},
                        {"status": "error", "details": {"error": "DeviceNotRegistered"}},
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "data": {
                    "ticket-1": {"status": "error", "details": {"error": "DeviceNotRegistered"}}
                }
            },
        )

    monkeypatch.setattr(push, "_client", httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    return sent


def push_conn(n):
    return Conn(
        {
            "select n.id": n,
            "select expo_token": [
                {"expo_token": "ExponentPushToken[aaaaaaaaaa]"},
                {"expo_token": "ExponentPushToken[bbbbbbbbbb]"},
            ],
        }
    )


async def test_push_goes_to_every_device_and_drops_dead_tokens(expo):
    conn = push_conn(notification())
    await push.send_push(conn, {"payload": {"notification_id": str(uuid.uuid4())}})
    path, messages = expo[0]
    assert path.endswith("/send") and len(messages) == 2
    assert messages[0]["data"]["target"]["route"] == "/document/[id]"
    assert conn.ran("delete from push_tokens") == [(["ExponentPushToken[bbbbbbbbbb]"],)]
    assert len(conn.ran("update notifications set push_sent_at")) == 1
    receipt_job = conn.ran("insert into jobs")[0]
    assert json.loads(receipt_job[2]) == {"receipts": {"ticket-1": "ExponentPushToken[aaaaaaaaaa]"}}


async def test_receipts_remove_tokens_expo_says_are_gone(expo):
    conn = Conn({})
    await push.send_push(
        conn, {"payload": {"receipts": {"ticket-1": "ExponentPushToken[aaaaaaaaaa]"}}}
    )
    assert conn.ran("delete from push_tokens") == [(["ExponentPushToken[aaaaaaaaaa]"],)]


@pytest.mark.parametrize(
    "over",
    [
        {"read_at": datetime.now(UTC)},  # already seen in the app
        {"local_time": time(23, 45)},  # quiet hours
        {"types": {"ready": False}},  # turned off
        {"type": "share_member_joined", "types": {}},  # coursemate pushes are off by default
    ],
)
async def test_no_push_when_the_student_wouldnt_want_one(expo, over):
    await push.send_push(
        push_conn(notification(**over)), {"payload": {"notification_id": str(uuid.uuid4())}}
    )
    assert expo == []


# --- inbox routes (FR-NOTIF-04/05/07) ------------------------------------------------------------


@pytest.fixture
def inbox(monkeypatch):
    calls: dict = {}

    async def fake_inbox(conn, user_id, before=None, kind="all", after=None):
        calls["inbox"] = (before, kind, after)
        return {"notifications": [], "unread": 3}

    async def mark_read(conn, user_id, ids):
        calls["read"] = ids

    async def save_push_token(conn, user_id, token, platform):
        calls["token"] = (token, platform)

    monkeypatch.setattr(notifications, "inbox", fake_inbox)
    monkeypatch.setattr(notifications, "mark_read", mark_read)
    monkeypatch.setattr(notifications, "save_push_token", save_push_token)
    return calls


def test_inbox_filters_and_catch_up(client, inbox):
    r = client.get("/v1/notifications?filter=shared&after=2026-10-27T10:00:00Z", headers=auth())
    assert r.status_code == 200 and r.json() == {"notifications": [], "unread": 3}
    assert inbox["inbox"][1] == "shared" and inbox["inbox"][2] is not None
    assert client.get("/v1/notifications?filter=spam", headers=auth()).status_code == 422


def test_marking_read_and_registering_a_device(client, inbox):
    nid = str(uuid.uuid4())
    assert (
        client.post("/v1/notifications/read", headers=auth(), json={"ids": [nid]}).status_code
        == 204
    )
    assert [str(i) for i in inbox["read"]] == [nid]
    ok = {"token": "ExponentPushToken[abcdefghij12]", "platform": "android"}
    assert client.post("/v1/push-tokens", headers=auth(), json=ok).status_code == 204
    bad = ok | {"token": "not-a-token"}
    assert client.post("/v1/push-tokens", headers=auth(), json=bad).status_code == 422
