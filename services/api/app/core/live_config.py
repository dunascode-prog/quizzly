"""Limits and plans the admin can change while Quizzly runs (E4, WEB.md §3 30e).

`app_config` holds only the values an admin changed. Every API and worker process reads it every
minute and applies it to its settings and the paid-plan limits, so every existing limit check uses
the new value without knowing about this module. Only the keys below can be set, each within its
bounds; anything else in the table is ignored."""

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any

from psycopg import AsyncConnection

from app.core import db
from app.core.config import Settings
from app.domain import plans

log = logging.getLogger("quizzly.config")
REFRESH_SECONDS = 60


@dataclass(frozen=True)
class Field:
    key: str
    label: str
    group: str
    lo: float
    hi: float
    unit: str = ""
    decimals: bool = False  # a money value; the rest are whole numbers

    def check(self, value: Any) -> int | float:
        if isinstance(value, bool) or not isinstance(value, int | float):
            raise ValueError(f"{self.label}: enter a number.")
        if not self.decimals and value != int(value):
            raise ValueError(f"{self.label}: enter a whole number.")
        if not self.lo <= value <= self.hi:
            raise ValueError(f"{self.label}: keep it between {self.lo:g} and {self.hi:g}.")
        return float(value) if self.decimals else int(value)


_RESOURCES = [
    ("upload", "Uploads"),
    ("question_set", "Quiz sets"),
    ("explanation", "Explanations"),
    ("chat_message", "Chat messages"),
    ("marking", "Written answers marked"),
]
_FREE_KEYS = {
    "upload": "daily_uploads",
    "question_set": "daily_question_sets",
    "explanation": "daily_explanations",
    "chat_message": "daily_chat_messages",
    "marking": "daily_markings",
}
_HI = {
    "upload": 100,
    "question_set": 300,
    "explanation": 1000,
    "chat_message": 2000,
    "marking": 500,
}

FIELDS: list[Field] = [
    *(Field(_FREE_KEYS[r], label, "Free plan, a day", 0, _HI[r]) for r, label in _RESOURCES),
    *(
        Field(f"plan.{plan}.{r}", label, f"{plan.title()} plan, a day", 0, _HI[r])
        for plan in ("student", "premium")
        for r, label in _RESOURCES
    ),
    Field("storage_free_mb", "Free", "Storage per student", 50, 20_000, "MB"),
    Field("storage_student_mb", "Student", "Storage per student", 50, 50_000, "MB"),
    Field("storage_premium_mb", "Premium", "Storage per student", 50, 100_000, "MB"),
    Field("monthly_ai_ceiling_free_usd", "Free", "Monthly AI allowance", 0, 20, "USD", True),
    Field("monthly_ai_ceiling_student_usd", "Student", "Monthly AI allowance", 0, 50, "USD", True),
    Field("monthly_ai_ceiling_premium_usd", "Premium", "Monthly AI allowance", 0, 100, "USD", True),
    Field("daily_llm_cost_budget_usd", "Daily AI budget", "Safety", 0.1, 500, "USD", True),
    Field("daily_llm_token_budget", "Daily AI tokens", "Safety", 10_000, 500_000_000),
    Field("requests_per_minute", "API requests per student a minute", "Safety", 30, 2000),
    Field("daily_share_recipients", "People a student can share with a day", "Safety", 1, 200),
    Field("daily_avatar_uploads", "Photo changes a day", "Safety", 1, 100),
]
BY_KEY = {f.key: f for f in FIELDS}

_defaults: dict[str, Any] | None = None


def _read(settings: Settings, key: str) -> Any:
    if key.startswith("plan."):
        _, plan, resource = key.split(".")
        return plans.PAID_LIMITS[plan][resource]
    return getattr(settings, key)


def _write(settings: Settings, key: str, value: Any) -> None:
    if key.startswith("plan."):
        _, plan, resource = key.split(".")
        plans.PAID_LIMITS[plan][resource] = value
    else:
        setattr(settings, key, value)


def defaults(settings: Settings) -> dict[str, Any]:
    """The values from the environment and code, taken once before any override is applied."""
    global _defaults
    if _defaults is None:
        _defaults = {f.key: _read(settings, f.key) for f in FIELDS}
    return _defaults


def apply(settings: Settings, overrides: dict[str, Any]) -> dict[str, Any]:
    """Sets every field to its override or back to its default; returns what's in force.
    Invalid rows (a bad value, or a key we don't know) are skipped with a warning."""
    base = defaults(settings)
    live: dict[str, Any] = {}
    for f in FIELDS:
        value = base[f.key]
        if f.key in overrides:
            try:
                value = f.check(overrides[f.key])
            except ValueError as exc:
                log.warning("ignoring app_config %s: %s", f.key, exc)
        _write(settings, f.key, value)
        live[f.key] = value
    for key in overrides.keys() - BY_KEY.keys():
        log.warning("ignoring unknown app_config key %s", key)
    return live


async def load(conn: AsyncConnection) -> dict[str, Any]:
    rows = await (await conn.execute("select key, value from app_config")).fetchall()
    return {r["key"]: r["value"] for r in rows}


async def refresh(conn: AsyncConnection, settings: Settings) -> dict[str, Any]:
    return apply(settings, await load(conn))


async def save(conn: AsyncConnection, admin_id: Any, changes: dict[str, Any]) -> None:
    """Upserts changed values; None resets a key to its default (deletes the row)."""
    for key, value in changes.items():
        if value is None:
            await conn.execute("delete from app_config where key = %s", (key,))
        else:
            await conn.execute(
                "insert into app_config (key, value, updated_by) values (%s, %s, %s) "
                "on conflict (key) do update set value = excluded.value, "
                "updated_by = excluded.updated_by, updated_at = now()",
                (key, json.dumps(value), admin_id),
            )


async def keep_fresh(settings: Settings) -> None:
    """The API's background task: re-reads app_config every minute (the worker does the same in
    its loop). A failed read keeps the values already in force."""
    while True:
        try:
            async with db.get_pool().connection() as conn:
                await refresh(conn, settings)
        except Exception:  # noqa: BLE001 - never let a config read take the API down
            log.exception("app_config refresh failed; keeping current values")
        await asyncio.sleep(REFRESH_SECONDS)
