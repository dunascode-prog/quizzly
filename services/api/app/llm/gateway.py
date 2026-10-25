"""One entry point for every LLM call, with ordered fallback across providers (ARCHITECTURE §5.3).

All providers speak the OpenAI chat-completions format, so a single HTTP client covers them.
Usage logging to `llm_calls` and token-bucket limits are added once the database layer lands.
"""

import json
import logging
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx

from app.llm.config import ModelsConfig, Route

log = logging.getLogger("quizzly.llm")

RETRYABLE_STATUS = {408, 409, 429, 500, 502, 503, 504}


class AllProvidersBusy(Exception):
    """Every route failed with a retryable error; the caller should re-queue the job."""


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
    def __init__(self, config: ModelsConfig, client: httpx.AsyncClient | None = None):
        self.config = config
        self.client = client or httpx.AsyncClient(timeout=60)

    async def complete(
        self,
        task: str,
        messages: list[dict],
        *,
        json_mode: bool = False,
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> Completion:
        failures: list[str] = []
        for route in self.config.routes_for(task):
            provider = self.config.providers[route.provider]
            if not provider.api_key:
                failures.append(f"{route.provider}: no API key")
                continue
            try:
                return await self._call(route, messages, json_mode, temperature, max_tokens)
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code not in RETRYABLE_STATUS:
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
        failures: list[str] = []
        for route in self.config.routes_for(task):
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
            **route.params,
        }
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
                    choices = json.loads(data).get("choices") or []
                except json.JSONDecodeError:
                    continue
                text = (choices[0].get("delta") or {}).get("content") if choices else None
                if text:
                    yield text

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
        response = await self.client.post(
            f"{provider.base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {provider.api_key}"},
            json=body,
        )
        response.raise_for_status()
        data = response.json()
        usage = data.get("usage") or {}
        return Completion(
            text=data["choices"][0]["message"]["content"],
            provider=route.provider,
            model=route.model,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
