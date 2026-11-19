"""Admin API (E4, WEB.md §3 admin security): only admins with 2FA get in, and views are logged."""

import json
import uuid

import pytest

from app.core import admin as admin_core
from app.domain import admin as stats
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

ADMIN = uuid.uuid4()


def bearer(**claims) -> dict:
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, **claims)}"}


def admin_headers(**extra) -> dict:
    return bearer(sub=str(ADMIN), app_metadata={"role": "admin"}, aal="aal2", **extra)


def admin_paths(client) -> list[str]:
    spec = client.get("/openapi.json").json()
    return [p for p in spec["paths"] if p.startswith("/admin")]


HEALTH = {"waiting": 3, "running": 1, "failed_24h": 0, "worker_beat_s": 12, "breakers": []}


@pytest.fixture
def fake_stats(monkeypatch):
    seen: dict = {}

    async def overview(conn, tz, rng, budget):
        seen["overview"] = rng
        return {
            "active": 74,
            "active_month": 186,
            "signups": 41,
            "invited": 19,
            "documents": 23,
            "duplicates": 7,
            "open_reports": 14,
            "auto_hidden": 3,
            "cost_today": 0.42,
            "daily_budget_usd": budget,
            "providers": [],
            "attention": [],
            "health": HEALTH,
        }

    async def costs(conn, tz, rng):
        return {
            "calls": 0,
            "free_calls": 0,
            "list_usd": 0,
            "paid_usd": 0,
            "active": 0,
            "daily": [],
            "providers": [],
            "tasks": [],
            "top_students": [],
            "health": HEALTH,
        }

    async def system(conn):
        return {
            "health": HEALTH,
            "jobs": [],
            "upload_to_ready": {"p50_s": None, "p95_s": None},
            "failures": [],
        }

    async def summary(conn, tz):
        return {
            "active_month": 0,
            "active_today": 0,
            "new_week": 0,
            "invited_week": 0,
            "goal_met_share": None,
            "week4_retention": None,
            "schools": [],
            "sources": [],
        }

    async def students(conn, tz, search, school, limit, offset):
        seen["students"] = (search, school, limit, offset)
        return []

    for name, fn in [
        ("overview", overview),
        ("costs", costs),
        ("system", system),
        ("students_summary", summary),
        ("students", students),
    ]:
        monkeypatch.setattr(stats, name, fn)

    logged: list = []

    async def audit(conn, admin, action, target=None, detail=None):
        logged.append((admin.id, action, target, detail))

    monkeypatch.setattr("app.api.admin.audit", audit)
    seen["audit"] = logged
    return seen


def test_every_admin_route_needs_a_token(client, fake_stats):
    for path in admin_paths(client):
        assert client.get(path).status_code == 401, path


def test_students_are_refused(client, fake_stats):
    for path in admin_paths(client):
        r = client.get(path, headers=bearer())
        assert r.status_code == 403 and r.json()["detail"] == admin_core.NOT_ADMIN, path


def test_admin_in_user_metadata_doesnt_count(client, fake_stats):
    """user_metadata is editable by the user themselves; only app_metadata is trusted."""
    r = client.get("/admin/overview", headers=bearer(user_metadata={"role": "admin"}, aal="aal2"))
    assert r.status_code == 403


def test_admins_need_their_second_factor(client, fake_stats):
    no_2fa = bearer(app_metadata={"role": "admin"}, aal="aal1")
    r = client.get("/admin/overview", headers=no_2fa)
    assert r.status_code == 403 and r.json()["detail"] == admin_core.NEEDS_2FA


def test_a_forged_admin_token_is_refused(client, fake_stats):
    forged = make_token(
        "not-the-secret-not-the-secret-not-the", app_metadata={"role": "admin"}, aal="aal2"
    )
    assert (
        client.get("/admin/overview", headers={"Authorization": f"Bearer {forged}"}).status_code
        == 401
    )


def test_admins_with_2fa_get_every_page(client, fake_stats):
    for path in admin_paths(client):
        assert client.get(path, headers=admin_headers()).status_code == 200, path
    assert client.get("/admin/overview?range=7d", headers=admin_headers()).json()["active"] == 74
    assert fake_stats["overview"] == "7d"
    assert client.get("/admin/overview?range=year", headers=admin_headers()).status_code == 422


def test_viewing_students_is_logged(client, fake_stats):
    r = client.get("/admin/students?search=Ada&school=UNILAG", headers=admin_headers())
    assert r.status_code == 200
    assert fake_stats["students"] == ("Ada", "UNILAG", 50, 0)
    assert fake_stats["audit"] == [(ADMIN, "students.list", "Ada", {"school": "UNILAG", "rows": 0})]


def test_the_student_table_has_no_emails(client, fake_stats):
    spec = client.get("/openapi.json").json()["components"]["schemas"]["StudentRow"]
    assert "email" not in json.dumps(spec)


async def test_audit_writes_the_admin_action_and_detail():
    from tests.test_credits_plans import Conn

    conn = Conn({})
    who = admin_core.AdminUser(id=ADMIN, email=None)
    await admin_core.audit(conn, who, "reports.dismiss", "r1", {"why": "fine"})
    params = conn.ran("insert into admin_audit_log")[0]
    assert params[:3] == (ADMIN, "reports.dismiss", "r1") and json.loads(params[3]) == {
        "why": "fine"
    }
