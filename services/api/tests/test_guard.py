"""Request guard (FR-SEC-20/21): per-student rate limit and paused accounts."""

import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core import guard
from app.core.auth import CurrentUser

USER = CurrentUser(id=uuid.uuid4(), email="tolu@example.com")


class FakeConn:
    """Returns one row for the guard's single query and remembers what was asked."""

    def __init__(self, count: int, paused: bool, plan="free", spent_micro=0, active=True):
        self.row = {
            "count": count,
            "paused": paused,
            "plan": plan,
            "active": active,
            "spent_micro": spent_micro,
        }
        self.sql: list[str] = []

    async def execute(self, sql, params=None):
        self.sql.append(sql)
        row = self.row

        class Cursor:
            rowcount = 3

            async def fetchone(self):
                return row

        return Cursor()


def request(method="GET", path="/v1/home"):
    return SimpleNamespace(method=method, url=SimpleNamespace(path=path))


def settings(per_minute=120):
    return SimpleNamespace(
        requests_per_minute=per_minute,
        monthly_ai_ceiling_free_usd=0.60,
        monthly_ai_ceiling_student_usd=2.00,
        monthly_ai_ceiling_premium_usd=3.50,
    )


async def test_requests_under_the_limit_go_ahead():
    conn = FakeConn(count=120, paused=False)
    assert (await guard.guarded_user(request(), USER, conn, settings())).id == USER.id
    # Counted per student per minute, in the same round trip as the paused check.
    assert "rate_limits" in conn.sql[0] and "date_trunc('minute'" in conn.sql[0]
    assert "suspended_at" in conn.sql[0]


async def test_too_many_requests_get_429_with_retry_after():
    with pytest.raises(HTTPException) as exc:
        await guard.guarded_user(request(), USER, FakeConn(count=121, paused=False), settings())
    assert exc.value.status_code == 429
    assert exc.value.detail == guard.RATE_LIMITED
    assert exc.value.headers == {"Retry-After": "60"}


async def test_a_paused_account_is_refused():
    with pytest.raises(HTTPException) as exc:
        await guard.guarded_user(request(), USER, FakeConn(count=1, paused=True), settings())
    assert exc.value.status_code == 403 and exc.value.detail == guard.PAUSED


async def test_a_paused_student_can_still_delete_their_account():
    conn = FakeConn(count=1, paused=True)
    assert (
        await guard.guarded_user(request("DELETE", "/v1/me"), USER, conn, settings())
    ).id == USER.id


async def test_paused_wins_over_the_rate_limit():
    with pytest.raises(HTTPException) as exc:
        await guard.guarded_user(request(), USER, FakeConn(count=999, paused=True), settings())
    assert exc.value.status_code == 403


def test_every_signed_in_route_is_guarded(client, monkeypatch):
    """The shared User dependency runs the guard, so no route can forget it."""
    from tests.conftest import JWT_SECRET
    from tests.test_api import make_token

    async def limited(conn, user_id, settings):
        return "rate_limited", "free"

    monkeypatch.setattr(guard, "check", limited)
    headers = {"Authorization": f"Bearer {make_token(JWT_SECRET, sub=str(USER.id))}"}
    for path in ("/v1/me", "/v1/courses", "/v1/home", "/v1/notifications"):
        assert client.get(path, headers=headers).status_code == 429, path


async def test_old_counters_are_deleted():
    conn = FakeConn(count=0, paused=False)
    assert await guard.delete_old(conn) == 3
    assert "interval '1 hour'" in conn.sql[0]


# --- nothing costly before onboarding (FR-SEC-25) -------------------------------------------------


@pytest.mark.parametrize(
    "method, path, allowed",
    [
        ("GET", "/v1/me", True),
        ("PATCH", "/v1/me", True),
        ("GET", "/v1/institutions", True),
        ("PUT", "/v1/me/avatar", True),
        ("POST", "/v1/referrals", True),
        ("DELETE", "/v1/me", True),
        ("POST", "/v1/documents", False),
        ("POST", "/v1/documents/x/chat/messages", False),
        ("GET", "/v1/home", False),
        ("POST", "/v1/courses/x/share", False),
    ],
)
async def test_accounts_that_havent_finished_onboarding_can_only_set_up(method, path, allowed):
    conn = FakeConn(count=1, paused=False)
    conn.row["onboarded"] = False
    call = guard.guarded_user(request(method, path), USER, conn, settings())
    if allowed:
        assert (await call).id == USER.id
    else:
        with pytest.raises(HTTPException) as exc:
            await call
        assert exc.value.status_code == 403 and exc.value.detail == guard.SETUP_FIRST
