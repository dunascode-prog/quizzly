"""Limits and plans changed live in the admin app (E4, WEB.md §3 30e)."""

import pytest

from app.core import live_config
from app.domain import plans
from tests.test_admin import ADMIN, admin_headers
from tests.test_credits_plans import Conn


def field(key: str) -> live_config.Field:
    return live_config.BY_KEY[key]


def test_values_are_checked_against_their_bounds():
    uploads = field("daily_uploads")
    assert uploads.check(7) == 7 and uploads.check(7.0) == 7
    for bad in (7.5, -1, 101, True, "7", None):
        with pytest.raises(ValueError):
            uploads.check(bad)
    budget = field("daily_llm_cost_budget_usd")
    assert budget.check(2.5) == 2.5
    with pytest.raises(ValueError):
        budget.check(0)  # an AI budget of $0 would stop all AI work: below the minimum


def test_an_override_reaches_every_limit_check(settings):
    live_config.apply(settings, {"daily_uploads": 9, "plan.student.question_set": 44})
    assert plans.daily_limit(settings, "free", "upload") == 9
    assert plans.daily_limit(settings, "student", "question_set") == 44
    assert settings.daily_uploads == 9


def test_removing_an_override_goes_back_to_the_default(settings):
    default = settings.daily_uploads
    student = plans.PAID_LIMITS["student"]["upload"]
    live_config.apply(settings, {"daily_uploads": 9, "plan.student.upload": 1})
    live_config.apply(settings, {})
    assert settings.daily_uploads == default
    assert plans.PAID_LIMITS["student"]["upload"] == student


def test_bad_rows_and_unknown_keys_are_ignored(settings):
    default = settings.daily_uploads
    live = live_config.apply(settings, {"daily_uploads": 100_000, "database_url": "x"})
    assert live["daily_uploads"] == default and settings.daily_uploads == default
    assert settings.database_url == ""  # only listed keys can ever be set


async def test_save_upserts_and_none_resets():
    conn = Conn({})
    await live_config.save(conn, ADMIN, {"daily_uploads": 9, "daily_markings": None})
    assert conn.ran("insert into app_config")[0] == ("daily_uploads", "9", ADMIN)
    assert conn.ran("delete from app_config") == [("daily_markings",)]


# --- the admin routes -----------------------------------------------------------------------------


@pytest.fixture
def config_db(client, monkeypatch):
    """app_config and the audit log in memory."""
    from app.core.db import get_conn

    state: dict = {"rows": {}, "audit": []}

    async def load(conn):
        return dict(state["rows"])

    async def save(conn, admin_id, changes):
        for k, v in changes.items():
            if v is None:
                state["rows"].pop(k, None)
            else:
                state["rows"][k] = v

    async def audit(conn, admin, action, target=None, detail=None):
        state["audit"].append((action, target, detail))

    monkeypatch.setattr(live_config, "load", load)
    monkeypatch.setattr(live_config, "save", save)
    monkeypatch.setattr("app.api.admin.audit", audit)
    client.app.dependency_overrides[get_conn] = lambda: Conn({})
    return state


def test_the_limits_page_shows_defaults_and_what_changed(client, settings, config_db):
    config_db["rows"] = {"daily_uploads": 9}
    body = client.get("/admin/limits", headers=admin_headers()).json()
    by_key = {f["key"]: f for f in body["fields"]}
    assert by_key["daily_uploads"]["value"] == 9 and by_key["daily_uploads"]["changed"]
    assert by_key["daily_uploads"]["default"] == 3
    assert not by_key["daily_markings"]["changed"]
    assert body["applies_within_s"] == 60


def test_a_change_applies_now_and_is_logged_with_the_old_value(client, settings, config_db):
    r = client.put("/admin/limits", json={"values": {"daily_uploads": 9}}, headers=admin_headers())
    assert r.status_code == 200
    assert settings.daily_uploads == 9  # this process at once; the others within a minute
    assert config_db["audit"] == [("config.update", "daily_uploads", {"old": 3, "new": 9})]


def test_resetting_logs_the_change_back_to_the_default(client, settings, config_db):
    config_db["rows"] = {"daily_uploads": 9}
    r = client.put(
        "/admin/limits", json={"values": {"daily_uploads": None}}, headers=admin_headers()
    )
    assert r.status_code == 200 and settings.daily_uploads == 3
    assert config_db["audit"] == [("config.update", "daily_uploads", {"old": 9, "new": None})]


def test_one_bad_value_refuses_the_whole_change(client, settings, config_db):
    body = {"values": {"daily_uploads": 9, "daily_markings": 9999}}
    r = client.put("/admin/limits", json=body, headers=admin_headers())
    assert r.status_code == 422 and "between" in r.json()["detail"]
    assert config_db["rows"] == {} and config_db["audit"] == []


def test_only_listed_keys_can_be_changed(client, settings, config_db):
    for key in ("database_url", "supabase_service_role_key", "env"):
        r = client.put("/admin/limits", json={"values": {key: 1}}, headers=admin_headers())
        assert r.status_code == 422, key
    assert config_db["rows"] == {}
