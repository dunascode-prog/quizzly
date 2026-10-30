"""Plans (FR-LIM-04): free students' chat, explanations and questions run on cheaper models."""

import json
import uuid

import httpx
import pytest

from app.api.routes import MeOut, ProfileUpdate
from app.core.config import SERVICE_ROOT
from app.domain import accounts
from app.llm import gateway as gw
from app.llm.config import ModelsConfig, load_models_config
from app.llm.gateway import LLMGateway
from app.worker import main as worker

REPO = load_models_config(SERVICE_ROOT / "config" / "models.yaml")
CHEAP = "openai/gpt-oss-20b"


@pytest.mark.parametrize("task", ["chat", "explanation", "questions"])
def test_free_students_start_on_the_cheap_model(task):
    assert REPO.routes_for(task, "free")[0].model == CHEAP
    # Paid plans keep the stronger first choice.
    assert REPO.routes_for(task, "student")[0].model != CHEAP
    assert REPO.routes_for(task, "premium") == REPO.routes_for(task, "student")


@pytest.mark.parametrize("task", ["outline", "style", "marking"])
def test_shared_or_accuracy_critical_work_is_the_same_for_everyone(task):
    assert REPO.routes_for(task, "free") == REPO.routes_for(task, "premium")


def test_free_question_writing_keeps_groq_headroom_for_big_sets():
    providers = [r.provider for r in REPO.routes_for("questions", "free")]
    assert providers[:3] == ["groq", "groq", "groq"] and "groq" not in providers[3:]


def test_an_unknown_free_profile_is_rejected(tmp_path):
    bad = (SERVICE_ROOT / "config" / "models.yaml").read_text(encoding="utf-8")
    bad = bad.replace("chat: chat_free", "chat: nope")
    path = tmp_path / "models.yaml"
    path.write_text(bad, encoding="utf-8")
    with pytest.raises(ValueError, match="nope"):
        load_models_config(path)


def two_tier_config() -> ModelsConfig:
    return ModelsConfig.model_validate(
        {
            "providers": {"a": {"base_url": "https://a.test/v1", "api_key_env": "A_KEY"}},
            "profiles": {
                "best": [{"provider": "a", "model": "big", "rpm": 30}],
                "cheap": [{"provider": "a", "model": "small", "rpm": 30}],
            },
            "tasks": {"chat": "best"},
            "free_tasks": {"chat": "cheap"},
        }
    )


async def test_the_gateway_picks_models_by_the_plan_in_context(monkeypatch):
    monkeypatch.setenv("A_KEY", "k")
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content)["model"])
        body = {"choices": [{"message": {"content": "ok"}}], "usage": {}}
        return httpx.Response(200, json=body)

    gateway = LLMGateway(
        two_tier_config(), httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    msgs = [{"role": "user", "content": "hi"}]
    await gateway.complete("chat", msgs)  # nothing set: free, so it can't cost more by mistake
    token = gw.plan.set("student")
    try:
        await gateway.complete("chat", msgs)
    finally:
        gw.plan.reset(token)
    assert seen == ["small", "big"]


class Rows:
    def __init__(self, row):
        self.row = row
        self.sql = ""

    async def execute(self, sql, params=None):
        self.sql = sql
        row = self.row

        class Cursor:
            async def fetchone(self):
                return row

        return Cursor()


async def test_plan_of_reads_the_plan_and_treats_lapsed_or_missing_as_free():
    conn = Rows({"plan": "premium"})
    assert await accounts.plan_of(conn, uuid.uuid4()) == "premium"
    assert "plan_expires_at" in conn.sql
    assert await accounts.plan_of(Rows(None), uuid.uuid4()) == "free"  # lapsed: no row back
    assert await accounts.plan_of(Rows({"plan": "premium"}), None) == "free"  # no student


async def test_the_worker_sets_the_jobs_student_plan(monkeypatch):
    seen = {}

    async def handler(conn, job):
        seen["plan"] = gw.plan.get()

    async def plan_of(conn, user_id):
        return "student" if user_id else "free"

    async def succeed(conn, job_id):
        pass

    monkeypatch.setitem(worker.HANDLERS, "test_job", handler)
    monkeypatch.setattr(worker.profiles, "plan_of", plan_of)
    monkeypatch.setattr(worker.queue, "succeed", succeed)
    job = {"id": uuid.uuid4(), "type": "test_job", "user_id": uuid.uuid4(), "payload": {}}
    assert await worker._run(None, job, {}) == "succeeded"
    assert seen["plan"] == "student"


def test_the_app_can_see_its_plan_but_never_change_it():
    assert MeOut.model_fields["plan"].default == "free"
    assert "plan" not in ProfileUpdate.model_fields and "plan" not in accounts.EDITABLE
