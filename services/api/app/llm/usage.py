"""Records every LLM call in `llm_calls` (FR-LIM-02) and enforces the daily AI budget that trips
the circuit breaker (FR-SEC-08, FR-LIM-03). Plugged into the gateway as its observer."""

import asyncio
import logging
import time
from contextvars import ContextVar
from datetime import datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from app.core import db
from app.llm.gateway import CallRecord

log = logging.getLogger("quizzly.llm")

# Who the call is for: set by the worker around each job and by the API around chat.
call_owner: ContextVar[dict | None] = ContextVar("llm_call_owner", default=None)

REFRESH_SECONDS = 60  # how stale today's totals may be before re-reading them


def for_job(job: dict) -> None:
    call_owner.set({"job_id": job.get("id"), "user_id": job.get("user_id")})


def for_user(user_id: UUID) -> None:
    call_owner.set({"job_id": None, "user_id": user_id})


class UsageLog:
    def __init__(self, token_budget: int, cost_budget_usd: float, timezone: str):
        self.token_budget = token_budget
        self.cost_budget = cost_budget_usd
        self.tz = ZoneInfo(timezone)
        self._day = None
        self._tokens = 0
        self._cost = 0.0
        self._read_at = 0.0
        self._tasks: set[asyncio.Task] = set()
        self._warned: set[tuple] = set()

    def _today(self):
        return datetime.now(self.tz).date()

    async def _refresh(self) -> None:
        pool = db._pool
        if pool is None:
            return
        async with pool.connection() as conn:
            row = await (
                await conn.execute(
                    "select coalesce(sum(coalesce(prompt_tokens, 0) "
                    "+ coalesce(completion_tokens, 0)), 0) as tokens, "
                    "coalesce(sum(cost_usd), 0) as cost from llm_calls "
                    "where created_at >= (date_trunc('day', now() at time zone %s) "
                    "at time zone %s)",
                    (str(self.tz), str(self.tz)),
                )
            ).fetchone()
        self._day, self._tokens, self._cost = self._today(), int(row["tokens"]), float(row["cost"])
        self._read_at = time.monotonic()

    async def allow(self) -> bool:
        """False once today's tokens or estimated cost reach the budget."""
        if self._day != self._today() or time.monotonic() - self._read_at > REFRESH_SECONDS:
            try:
                await self._refresh()
            except Exception:
                log.exception("couldn't read today's AI usage; allowing the call")
                return True
        allowed = self._tokens < self.token_budget and self._cost < self.cost_budget
        self._warn_at_thresholds()
        if not allowed:
            log.warning("daily AI budget reached: %s tokens, $%.4f", self._tokens, self._cost)
        return allowed

    def _warn_at_thresholds(self) -> None:
        """Logs once a day at 50% and 80% of the AI budget, so spend is noticed before the circuit
        breaker trips (FR-SEC-08); Sentry picks up warnings."""
        used = max(
            self._tokens / self.token_budget,
            self._cost / self.cost_budget if self.cost_budget else 0,
        )
        for mark in (0.8, 0.5):
            key = (self._day, mark)
            if used >= mark and key not in self._warned:
                self._warned.add(key)
                log.warning(
                    "AI budget %d%% used today: %s tokens, $%.4f",
                    mark * 100,
                    self._tokens,
                    self._cost,
                )
                break

    def record(self, call: CallRecord) -> None:
        """Counts the call now and writes the row in the background, so it never slows a reply."""
        self._tokens += call.prompt_tokens + call.completion_tokens
        self._cost += call.cost_usd
        owner = call_owner.get() or {}
        task = asyncio.get_running_loop().create_task(self._insert(call, owner))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _insert(self, call: CallRecord, owner: dict) -> None:
        pool = db._pool
        if pool is None:
            return
        try:
            async with pool.connection() as conn:
                await conn.execute(
                    "insert into llm_calls (job_id, user_id, task, provider, model, prompt_tokens, "
                    "completion_tokens, latency_ms, cost_usd, status, ref_cost_usd) "
                    "values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        owner.get("job_id"),
                        owner.get("user_id"),
                        call.task,
                        call.provider,
                        call.model,
                        call.prompt_tokens,
                        call.completion_tokens,
                        call.latency_ms,
                        call.cost_usd,
                        call.status,
                        call.ref_cost_usd,
                    ),
                )
                # The student's monthly AI allowance (FR-LIM-06).
                micro = round(call.ref_cost_usd * 1_000_000)
                if owner.get("user_id") and micro > 0:
                    await conn.execute(
                        "insert into ai_spend (user_id, month, micro_usd) "
                        "values (%s, date_trunc('month', now())::date, %s) "
                        "on conflict (user_id, month) "
                        "do update set micro_usd = ai_spend.micro_usd + excluded.micro_usd",
                        (owner["user_id"], micro),
                    )
        except Exception:
            log.exception("couldn't record an LLM call")
