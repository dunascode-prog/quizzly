"""Cost controls (FR-LIM-05..07): limits per plan, monthly AI allowances, storage caps, priority
and fair turns in the queue, budget warnings."""

import logging
import uuid
from contextlib import asynccontextmanager
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from app.api import deps
from app.api import quizzes as quizzes_api
from app.core import db, guard
from app.core.auth import CurrentUser
from app.domain import plans, quizzes
from app.llm import usage as llm_usage
from app.llm.config import ModelsConfig
from app.llm.gateway import CallRecord, LLMGateway
from app.worker import queue

SETTINGS = SimpleNamespace(
    daily_uploads=5,
    daily_question_sets=15,
    daily_explanations=30,
    daily_chat_messages=40,
    daily_markings=20,
    monthly_ai_ceiling_free_usd=0.60,
    monthly_ai_ceiling_student_usd=2.00,
    monthly_ai_ceiling_premium_usd=3.50,
)


def standing(plan="free", spent=0.0, active=True):
    return {"plan": plan, "active": active, "spent_micro": round(spent * 1_000_000)}


@pytest.mark.parametrize(
    "row, expected",
    [
        (standing("free", 0.10), "free"),
        (standing("free", 0.60), "capped"),  # free account over its allowance: no new AI work
        (standing("student", 1.99), "student"),
        (standing("student", 2.00), "free"),  # paid over its allowance: free limits and models
        (standing("premium", 3.49), "premium"),
        (standing("premium", 3.50), "free"),
        (standing("premium", 0, active=False), "free"),  # lapsed
        (None, "free"),
    ],
    ids=[
        "free",
        "free-over",
        "student",
        "student-over",
        "premium",
        "premium-over",
        "lapsed",
        "none",
    ],
)
def test_effective_plan(row, expected):
    assert plans.effective(SETTINGS, row) == expected


def test_daily_limits_follow_the_plan_and_capped_accounts_get_no_new_ai_work():
    assert plans.daily_limit(SETTINGS, "free", "question_set") == 15  # free limits unchanged
    assert plans.daily_limit(SETTINGS, "student", "question_set") == 30
    assert plans.daily_limit(SETTINGS, "premium", "chat_message") == 150
    for resource in plans.AI_RESOURCES:
        assert plans.daily_limit(SETTINGS, "capped", resource) == 0
    assert plans.models_for("capped") == "free" and plans.models_for("premium") == "premium"


class Rows:
    def __init__(self, row):
        self.row = row

    async def execute(self, sql, params=None):
        row = self.row

        class Cursor:
            async def fetchone(self):
                return row

        return Cursor()


async def test_the_guard_attaches_the_effective_plan():
    request = SimpleNamespace(method="GET", url=SimpleNamespace(path="/v1/home"))
    s = SimpleNamespace(requests_per_minute=120, **vars(SETTINGS))
    user = CurrentUser(id=uuid.uuid4(), email=None)
    row = {"count": 1, "paused": False} | standing("student", 0.5)
    assert (await guard.guarded_user(request, user, Rows(row), s)).plan == "student"
    row |= standing("free", 0.75)
    assert (await guard.guarded_user(request, user, Rows(row), s)).plan == "capped"


def test_require_ai_refuses_capped_accounts_kindly():
    deps.require_ai(SimpleNamespace(plan="free"))
    with pytest.raises(HTTPException) as exc:
        deps.require_ai(SimpleNamespace(plan="capped"))
    assert exc.value.status_code == 429 and "comes back on the 1st" in exc.value.detail


async def test_a_capped_account_still_gets_cached_quiz_sets(monkeypatch):
    cached = {"id": uuid.uuid4(), "status": "ready"}

    async def find_set(conn, key):
        return cached if key == "found" else None

    monkeypatch.setattr(quizzes, "find_set", find_set)
    monkeypatch.setattr(quizzes_api.q, "cache_key", lambda *a: "found")
    args = (None, uuid.uuid4(), SETTINGS, uuid.uuid4(), [], ["mcq"], "mixed", 10)
    assert await quizzes_api._question_set(*args, plan="capped") is cached
    monkeypatch.setattr(quizzes_api.q, "cache_key", lambda *a: "new")
    with pytest.raises(HTTPException) as exc:
        await quizzes_api._question_set(*args, plan="capped")
    assert exc.value.status_code == 429 and exc.value.detail == plans.CAPPED


# --- metering (FR-LIM-06) ------------------------------------------------------------------------


async def test_calls_carry_their_reference_cost(monkeypatch):
    monkeypatch.setenv("A_KEY", "k")
    route = {"provider": "a", "model": "m", "rpm": 30, "ref_price_in": 1, "ref_price_out": 2}
    config = ModelsConfig.model_validate(
        {
            "providers": {"a": {"base_url": "https://a.test/v1", "api_key_env": "A_KEY"}},
            "profiles": {"p": [route]},
            "tasks": {"chat": "p"},
        }
    )

    def handler(request):
        body = {
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"prompt_tokens": 1000, "completion_tokens": 500},
        }
        return httpx.Response(200, json=body)

    calls = []

    class Observer:
        async def allow(self):
            return True

        def record(self, call):
            calls.append(call)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    await LLMGateway(config, client, Observer()).complete(
        "chat", [{"role": "user", "content": "hi"}]
    )
    assert calls[0].cost_usd == 0  # free tier: nothing actually spent
    assert calls[0].ref_cost_usd == pytest.approx(0.002)  # 1000 x $1/M + 500 x $2/M


async def test_each_students_spend_is_added_up_per_month(monkeypatch):
    ran = []

    class Conn:
        async def execute(self, sql, params=None):
            ran.append((sql, params))

    class Pool:
        @asynccontextmanager
        async def connection(self):
            yield Conn()

    monkeypatch.setattr(db, "_pool", Pool())
    log = llm_usage.UsageLog(1_000_000, 2.0, "Africa/Lagos")
    call = CallRecord("chat", "groq", "m", 10, 5, 100, 0.0, "ok", ref_cost_usd=0.0012)
    user = uuid.uuid4()
    await log._insert(call, {"user_id": user, "job_id": None})
    spend = [r for r in ran if "ai_spend" in r[0]]
    assert spend and spend[0][1] == (user, 1200)  # micro-dollars
    assert "date_trunc('month'" in spend[0][0]
    ran.clear()
    await log._insert(call, {"user_id": None, "job_id": None})  # no student: nothing to meter
    assert not [r for r in ran if "ai_spend" in r[0]]


def test_budget_warnings_at_half_and_four_fifths(caplog):
    log = llm_usage.UsageLog(1000, 2.0, "Africa/Lagos")
    log._day = log._today()
    with caplog.at_level(logging.WARNING, logger="quizzly.llm"):
        log._tokens = 400
        log._warn_at_thresholds()
        log._tokens = 550
        log._warn_at_thresholds()
        log._warn_at_thresholds()  # once a day per mark
        log._tokens = 850
        log._warn_at_thresholds()
    assert [r.getMessage()[:13] for r in caplog.records] == ["AI budget 50%", "AI budget 80%"]


# --- queue priority and fair turns (FR-LIM-07) ---------------------------------------------------


class Recorder:
    def __init__(self):
        self.sql, self.params = "", None

    async def execute(self, sql, params=None):
        self.sql, self.params = sql, params

        class Cursor:
            async def fetchone(self):
                return {"id": uuid.uuid4()}

        return Cursor()


async def test_paid_plans_jobs_are_queued_with_priority():
    conn = Recorder()
    await queue.enqueue(conn, "generate_questions", {}, user_id=uuid.uuid4())
    assert "plan in ('student', 'premium')" in conn.sql and "priority" in conn.sql


async def test_claim_orders_by_priority_then_fair_turns_and_caps_running_jobs():
    conn = Recorder()
    await queue.claim(conn, "w1", ["generate_questions"])
    order = conn.sql[conn.sql.index("order by") :]
    assert order.index("priority desc") < order.index("o.locked_at > now()")
    assert order.index("o.locked_at > now()") < order.index("j.run_after\n")
    assert conn.params["per_student"] == queue.RUNNING_PER_STUDENT == 2
