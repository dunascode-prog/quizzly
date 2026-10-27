"""Today, Daily 5, reading, recap and settings routes (C4). Domain queries are faked here; the
SQL runs in the live end-to-end check."""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest

from app.domain import home, settings
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

USER = uuid.uuid4()
TODAY = date(2026, 10, 27)  # a Tuesday


def auth() -> dict:
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, sub=str(USER))}"}


@pytest.fixture
def fake(monkeypatch):
    state = {"settings": {"accent": "ink", "weekly_goal_days": 4}, "unlocked": ["ink"], "reads": []}

    async def get_home(conn, user_id):
        return {
            "today": TODAY,
            "countdown": None,
            "week": {
                "days": [
                    {"day": TODAY + timedelta(i - 1), "studied": i == 1, "questions": 0}
                    for i in range(7)
                ],
                "study_days": 1,
                "goal": 4,
                "weeks_in_a_row": 0,
            },
            "plan": [{"kind": "upload"}, {"kind": "join_shared"}],
            "unread_notifications": 2,
            "achievements": [],
        }

    async def daily5(conn, user_id):
        return None

    async def record_reading(conn, user_id, events):
        state["reads"].extend(events)
        return len(events)

    async def get_settings(conn, user_id):
        return {
            "night_mode": True,
            "low_data_mode": False,
            "share_permission": "code",
            "show_identity_on_links": True,
            "timezone": "Africa/Lagos",
            **state["settings"],
            "unlocked_themes": state["unlocked"],
        }

    async def update_settings(conn, user_id, fields):
        if "accent" in fields and fields["accent"] not in state["unlocked"]:
            raise settings.ThemeLocked(fields["accent"])
        state["settings"] |= fields
        return await get_settings(conn, user_id)

    for mod, name, fn in [
        (home, "home", get_home),
        (home, "daily5", daily5),
        (home, "record_reading", record_reading),
        (settings, "get_settings", get_settings),
        (settings, "update_settings", update_settings),
    ]:
        monkeypatch.setattr(mod, name, fn)
    return state


def test_new_students_see_upload_and_join_on_today(client, fake):
    r = client.get("/v1/home", headers=auth())
    assert r.status_code == 200
    body = r.json()
    assert [p["kind"] for p in body["plan"]] == ["upload", "join_shared"]
    assert body["countdown"] is None and body["unread_notifications"] == 2
    assert len(body["week"]["days"]) == 7


def test_daily5_with_nothing_to_practise_says_so(client, fake):
    r = client.get("/v1/daily5", headers=auth())
    assert r.status_code == 404
    assert r.json()["detail"] == "Nothing to practise yet. Upload your notes first."


def test_reading_events_are_capped(client, fake):
    now = datetime.now(UTC).isoformat()
    event = {"topic_id": str(uuid.uuid4()), "seconds": 90, "at": now}
    assert client.post("/v1/events/reading", headers=auth(), json={"events": [event]}).json() == {
        "counted": 1
    }
    too_long = event | {"seconds": home.MAX_READING_EVENT_SECONDS + 1}
    assert (
        client.post("/v1/events/reading", headers=auth(), json={"events": [too_long]}).status_code
        == 422
    )
    many = {"events": [event] * 51}
    assert client.post("/v1/events/reading", headers=auth(), json=many).status_code == 422
    assert client.post("/v1/events/reading", headers=auth(), json={"events": []}).status_code == 422


def test_a_recap_week_starts_on_monday(client, fake):
    r = client.get(f"/v1/recap/{TODAY}", headers=auth())
    assert r.status_code == 422 and r.json()["detail"] == "A week starts on a Monday"


def test_settings_only_allow_unlocked_themes_and_real_values(client, fake):
    r = client.patch("/v1/me/settings", headers=auth(), json={"accent": "lavender"})
    assert r.status_code == 403 and r.json()["detail"] == "That theme isn't unlocked yet."
    fake["unlocked"].append("lagoon")
    r = client.patch("/v1/me/settings", headers=auth(), json={"accent": "lagoon"})
    assert r.status_code == 200 and r.json()["accent"] == "lagoon"
    for bad in ({"weekly_goal_days": 0}, {"weekly_goal_days": 8}, {"timezone": "Mars/Olympus"}):
        assert client.patch("/v1/me/settings", headers=auth(), json=bad).status_code == 422
    r = client.patch("/v1/me/settings", headers=auth(), json={"timezone": "Europe/London"})
    assert r.json()["timezone"] == "Europe/London"


def test_reading_minutes_from_topic_length():
    assert home.reading_minutes(0) == 1
    assert home.reading_minutes(800) == 3  # 600 words at 200 a minute
