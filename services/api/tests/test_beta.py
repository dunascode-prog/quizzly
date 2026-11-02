"""Beta builds: BETA_PLAN gives every account a paid plan, never in production."""

import pytest

from app.api import plans as plans_api
from app.core.config import Settings
from app.domain import plans
from tests.test_credits_plans import auth, buy, store  # noqa: F401  (store is a fixture)


def make(**kw) -> Settings:
    return Settings(_env_file=None, supabase_url="https://x.supabase.co", **kw)


def row(plan="free", spent_usd=0.0, active=True) -> dict:
    return {"plan": plan, "active": active, "spent_micro": int(spent_usd * 1_000_000)}


def test_production_refuses_to_start_with_a_beta_plan():
    with pytest.raises(RuntimeError, match="BETA_PLAN"):
        make(env="production", beta_plan="premium").require_env()
    make(env="staging", beta_plan="premium").require_env()
    make(env="production").require_env()


def test_only_paid_plans_can_be_the_beta_plan():
    with pytest.raises(ValueError):
        make(env="staging", beta_plan="unlimited")


def test_every_account_gets_the_beta_plan_but_keeps_the_ai_allowance():
    s = make(env="staging", beta_plan="premium")
    assert plans.effective(s, None) == "premium"
    assert plans.effective(s, row("free")) == "premium"
    assert plans.effective(s, row("student", active=False)) == "premium"
    # Over the premium allowance it falls back to free, as for a paying student.
    assert plans.effective(s, row("free", spent_usd=3.5)) == "free"
    assert plans.effective(make(env="staging"), row("free")) == "free"


@pytest.fixture
def beta(client, settings):
    settings.beta_plan = "premium"
    yield
    settings.beta_plan = ""


def test_the_plan_list_shows_the_beta_plan_and_no_payments(client, store, beta):  # noqa: F811
    body = client.get("/v1/plans", headers=auth()).json()
    assert body["beta"] is True and body["current"] == "premium"
    assert body["payments_ready"] is False and body["expires_at"] is None


def test_nothing_can_be_bought_during_the_beta(client, store, beta):  # noqa: F811
    r = buy(client)
    assert r.status_code == 409 and r.json()["detail"] == plans_api.IN_BETA
    assert store["saved"] == []


def test_without_a_beta_plan_the_list_says_so(client, store):  # noqa: F811
    assert client.get("/v1/plans", headers=auth()).json()["beta"] is False
