import json

import httpx
import pytest

from app.core.config import SERVICE_ROOT
from app.llm import config as llm_config
from app.llm.config import ModelsConfig, load_models_config
from app.llm.gateway import AllProvidersBusy, LLMGateway


def test_repo_models_yaml_is_valid():
    config = load_models_config(SERVICE_ROOT / "config" / "models.yaml")
    for task in ("chat", "marking", "outline", "explanation", "questions"):
        assert config.routes_for(task), task


def test_api_keys_fall_back_to_the_dotenv_file(monkeypatch):
    # uvicorn doesn't export .env, so local runs read keys from the file.
    monkeypatch.delenv("A_KEY")
    monkeypatch.setattr(llm_config, "_dotenv", lambda: {"A_KEY": "from-file", "B_KEY": "file-b"})
    config = make_config()
    assert config.providers["a"].api_key == "from-file"
    assert config.providers["b"].api_key == "key-b"  # a real env var wins


def make_config() -> ModelsConfig:
    return ModelsConfig.model_validate(
        {
            "providers": {
                "a": {"base_url": "https://a.test/v1", "api_key_env": "A_KEY"},
                "b": {"base_url": "https://b.test/v1", "api_key_env": "B_KEY"},
            },
            "profiles": {
                "fast": [
                    {"provider": "a", "model": "small", "rpm": 30},
                    {"provider": "b", "model": "backup", "rpm": 30},
                ]
            },
            "tasks": {"chat": "fast"},
        }
    )


def ok_body(text: str) -> dict:
    return {
        "choices": [{"message": {"content": text}}],
        "usage": {"prompt_tokens": 12, "completion_tokens": 3},
    }


@pytest.fixture(autouse=True)
def keys(monkeypatch):
    monkeypatch.setenv("A_KEY", "key-a")
    monkeypatch.setenv("B_KEY", "key-b")


async def test_uses_first_provider_when_healthy():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.url.host, json.loads(request.content)["model"]))
        assert request.headers["authorization"] == "Bearer key-a"
        return httpx.Response(200, json=ok_body("hi"))

    gateway = LLMGateway(make_config(), httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    result = await gateway.complete("chat", [{"role": "user", "content": "hello"}], json_mode=True)

    assert result.text == "hi"
    assert (result.provider, result.model) == ("a", "small")
    assert (result.prompt_tokens, result.completion_tokens) == (12, 3)
    assert seen == [("a.test", "small")]


async def test_falls_back_on_rate_limit():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "a.test":
            return httpx.Response(429, json={"error": "rate limited"})
        return httpx.Response(200, json=ok_body("from b"))

    gateway = LLMGateway(make_config(), httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    result = await gateway.complete("chat", [{"role": "user", "content": "hello"}])
    assert (result.provider, result.text) == ("b", "from b")


async def test_skips_provider_without_key(monkeypatch):
    monkeypatch.delenv("A_KEY")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "b.test"
        return httpx.Response(200, json=ok_body("ok"))

    gateway = LLMGateway(make_config(), httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert (await gateway.complete("chat", [])).provider == "b"


async def test_raises_all_busy_when_every_route_fails():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    gateway = LLMGateway(make_config(), httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    with pytest.raises(AllProvidersBusy):
        await gateway.complete("chat", [])


async def test_non_retryable_error_is_raised_immediately():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.host)
        return httpx.Response(400, json={"error": "bad request"})

    gateway = LLMGateway(make_config(), httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    with pytest.raises(httpx.HTTPStatusError):
        await gateway.complete("chat", [])
    assert calls == ["a.test"]


def sse(*pieces: str) -> bytes:
    lines = [f"data: {json.dumps({'choices': [{'delta': {'content': p}}]})}\n\n" for p in pieces]
    return ("".join(lines) + "data: [DONE]\n\n").encode()


async def test_streams_tokens_and_falls_back_before_the_first_one():
    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["stream"] is True
        if request.url.host == "a.test":
            return httpx.Response(503, text="busy")
        return httpx.Response(200, content=sse("A stack ", "is LIFO", " [p. 2]."))

    gateway = LLMGateway(make_config(), httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    deltas = [d async for d in gateway.stream("chat", [{"role": "user", "content": "hi"}])]
    assert "".join(d.text for d in deltas) == "A stack is LIFO [p. 2]."
    assert {(d.provider, d.model) for d in deltas} == {("b", "backup")}


async def test_stream_raises_busy_when_every_route_fails():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, text="slow down")

    gateway = LLMGateway(make_config(), httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    with pytest.raises(AllProvidersBusy):
        async for _ in gateway.stream("chat", [{"role": "user", "content": "hi"}]):
            pass


def test_question_writing_tries_every_groq_model_before_slow_fallbacks():
    # Groq limits tokens per minute per model; a 30-question set needs more than one model's
    # minute, and the free fallbacks take 35-50 s a call.
    routes = load_models_config(SERVICE_ROOT / "config" / "models.yaml").routes_for("questions")
    providers = [r.provider for r in routes]
    assert providers[:3] == ["groq", "groq", "groq"]
    assert "groq" not in providers[3:]
