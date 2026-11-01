"""One entry point for every LLM call, with ordered fallback across providers (ARCHITECTURE §5.3).

All providers speak the OpenAI chat-completions format, so a single HTTP client covers them.
An optional observer (app/llm/usage.py) records every attempt in `llm_calls` (FR-LIM-02) and can
stop new calls when the daily budget is spent (FR-SEC-08); the gateway itself has no database.
"""

import json
import logging
import time
from collections.abc import AsyncIterator
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.llm.config import ModelsConfig, Route

log = logging.getLogger("quizzly.llm")

RETRYABLE_STATUS = {408, 409, 429, 500, 502, 503, 504}
# In JSON mode Groq answers 400 with this code when the model's output wasn't valid JSON. It's
# a sampling failure, not a bad request: try the model once more, then the next route.
JSON_RETRIES = 1


def _bad_json(exc: httpx.HTTPStatusError) -> bool:
    if exc.response.status_code != 400:
        return False
    try:
        body = exc.response.json()
    except ValueError:
        return False
    error = body.get("error") if isinstance(body, dict) else None
    return isinstance(error, dict) and error.get("code") == "json_validate_failed"


class AllProvidersBusy(Exception):
    """Every route failed with a retryable error; the caller should re-queue the job."""


class BudgetReached(AllProvidersBusy):
    """Today's AI budget is spent (FR-SEC-08). Treated like a provider outage: work waits."""


@dataclass(frozen=True)
class CallRecord:
    """One attempt at one route, for `llm_calls`."""

    task: str
    provider: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: int
    cost_usd: float
    status: str  # ok, rate_limited, error
    ref_cost_usd: float = 0.0  # at paid-tier list prices, for the monthly allowance (FR-LIM-06)


class Observer(Protocol):
    async def allow(self) -> bool: ...

    def record(self, call: CallRecord) -> None: ...


# The task of the call in progress, so the low-level call functions can record it.
_TASK: ContextVar[str] = ContextVar("llm_task", default="")
# The plan of the student the call is for (FR-LIM-04): set by the worker around each job and by
# the API around chat. Unset means free, so a call that forgets it costs less, not more.
plan: ContextVar[str] = ContextVar("llm_plan", default="free")


@dataclass(frozen=True)
class Completion:
    text: str
    provider: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: int


@dataclass(frozen=True)
class Delta:
    """A piece of a streamed reply, with the route that is producing it."""

    text: str
    provider: str
    model: str


class LLMGateway:
    def __init__(
        self,
        config: ModelsConfig,
        client: httpx.AsyncClient | None = None,
        observer: Observer | None = None,
    ):
        self.config = config
        self.client = client or httpx.AsyncClient(timeout=60)
        self.observer = observer

    async def _start(self, task: str) -> None:
        _TASK.set(task)
        if self.observer and not await self.observer.allow():
            raise BudgetReached("today's AI budget is spent")

    def _record(self, route: Route, status: str, started: float, p_tok=0, c_tok=0) -> None:
        if not self.observer:
            return
        cost = (p_tok * route.price_in + c_tok * route.price_out) / 1_000_000
        ref_cost = (p_tok * route.ref_price_in + c_tok * route.ref_price_out) / 1_000_000
        self.observer.record(
            CallRecord(
                task=_TASK.get(),
                provider=route.provider,
                model=route.model,
                prompt_tokens=p_tok,
                completion_tokens=c_tok,
                latency_ms=int((time.perf_counter() - started) * 1000),
                cost_usd=round(cost, 6),
                status=status,
                ref_cost_usd=round(ref_cost, 6),
            )
        )

    async def complete(
        self,
        task: str,
        messages: list[dict],
        *,
        json_mode: bool = False,
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> Completion:
        await self._start(task)
        failures: list[str] = []
        for route in self.config.routes_for(task, plan.get()):
            provider = self.config.providers[route.provider]
            if not provider.api_key:
                failures.append(f"{route.provider}: no API key")
                continue
            try:
                for attempt in range(JSON_RETRIES + 1):
                    try:
                        return await self._call(route, messages, json_mode, temperature, max_tokens)
                    except httpx.HTTPStatusError as exc:
                        if not (json_mode and _bad_json(exc)) or attempt == JSON_RETRIES:
                            raise
                        log.info(
                            "%s/%s returned invalid JSON, retrying", route.provider, route.model
                        )
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code not in RETRYABLE_STATUS and not _bad_json(exc):
                    raise
                failures.append(f"{route.provider}/{route.model}: HTTP {exc.response.status_code}")
            except httpx.TransportError as exc:
                failures.append(f"{route.provider}/{route.model}: {type(exc).__name__}")
            log.warning("LLM route failed, trying next: %s", failures[-1])
        raise AllProvidersBusy("; ".join(failures))

    async def stream(
        self,
        task: str,
        messages: list[dict],
        *,
        temperature: float = 0.3,
        max_tokens: int = 1024,
    ) -> AsyncIterator[Delta]:
        """Streams a reply token by token (FR-CHAT-04). Falls through to the next route only
        before the first token; after that a failure is raised to the caller."""
        await self._start(task)
        failures: list[str] = []
        for route in self.config.routes_for(task, plan.get()):
            provider = self.config.providers[route.provider]
            if not provider.api_key:
                failures.append(f"{route.provider}: no API key")
                continue
            started = False
            try:
                async for text in self._stream(route, messages, temperature, max_tokens):
                    started = True
                    yield Delta(text, route.provider, route.model)
                return
            except httpx.HTTPStatusError as exc:
                if started or exc.response.status_code not in RETRYABLE_STATUS:
                    raise
                failures.append(f"{route.provider}/{route.model}: HTTP {exc.response.status_code}")
            except httpx.TransportError as exc:
                if started:
                    raise
                failures.append(f"{route.provider}/{route.model}: {type(exc).__name__}")
            log.warning("LLM route failed, trying next: %s", failures[-1])
        raise AllProvidersBusy("; ".join(failures))

    async def _stream(
        self, route: Route, messages: list[dict], temperature: float, max_tokens: int
    ) -> AsyncIterator[str]:
        provider = self.config.providers[route.provider]
        body = {
            "model": route.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},  # a final chunk reports token usage
            **route.params,
        }
        started = time.perf_counter()
        usage: dict = {}
        written = 0
        try:
            async with self.client.stream(
                "POST",
                f"{provider.base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {provider.api_key}"},
                json=body,
            ) as response:
                if response.is_error:
                    await response.aread()
                    response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    groq = chunk.get("x_groq") or {}
                    usage = chunk.get("usage") or groq.get("usage") or usage
                    choices = chunk.get("choices") or []
                    text = (choices[0].get("delta") or {}).get("content") if choices else None
                    if text:
                        written += len(text)
                        yield text
        except httpx.HTTPStatusError as exc:
            retryable = exc.response.status_code in RETRYABLE_STATUS
            self._record(route, "rate_limited" if retryable else "error", started)
            raise
        except httpx.TransportError:
            self._record(route, "rate_limited", started)
            raise
        # Without a usage chunk, estimate at ~4 characters a token.
        prompt_chars = sum(len(str(m.get("content", ""))) for m in messages)
        self._record(
            route,
            "ok",
            started,
            usage.get("prompt_tokens") or prompt_chars // 4,
            usage.get("completion_tokens") or written // 4,
        )

    async def _call(
        self,
        route: Route,
        messages: list[dict],
        json_mode: bool,
        temperature: float,
        max_tokens: int,
    ) -> Completion:
        provider = self.config.providers[route.provider]
        body: dict = {
            "model": route.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            **route.params,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        started = time.perf_counter()
        try:
            response = await self.client.post(
                f"{provider.base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {provider.api_key}"},
                json=body,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            retryable = exc.response.status_code in RETRYABLE_STATUS
            self._record(route, "rate_limited" if retryable else "error", started)
            raise
        except httpx.TransportError:
            self._record(route, "rate_limited", started)
            raise
        data = response.json()
        usage = data.get("usage") or {}
        self._record(
            route, "ok", started, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)
        )
        return Completion(
            text=data["choices"][0]["message"]["content"],
            provider=route.provider,
            model=route.model,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
