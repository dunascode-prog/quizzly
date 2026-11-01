"""Loads config/models.yaml: providers, ordered model routes per profile, task → profile."""

import os
import re
from functools import lru_cache
from pathlib import Path

import yaml
from dotenv import dotenv_values
from pydantic import BaseModel

from app.core.config import SERVICE_ROOT

_ENV_VAR = re.compile(r"\$\{(\w+)\}")


@lru_cache
def _dotenv() -> dict[str, str]:
    return {k: v for k, v in dotenv_values(SERVICE_ROOT / ".env").items() if v}


def _env(name: str) -> str:
    """Real environment first (Docker passes .env in), then services/api/.env for local runs."""
    return os.environ.get(name) or _dotenv().get(name, "")


class Provider(BaseModel):
    base_url: str
    api_key_env: str

    @property
    def api_key(self) -> str:
        return _env(self.api_key_env)


class Route(BaseModel):
    provider: str
    model: str
    rpm: int
    # Provider-specific request fields, e.g. turning off a reasoning model's thinking for chat.
    params: dict = {}
    # USD per million tokens, for the estimated cost in llm_calls (FR-LIM-02). 0 on free tiers.
    price_in: float = 0.0
    price_out: float = 0.0
    # List price per million tokens on the paid tier, even while we run free: each student's
    # monthly AI allowance is measured with these (FR-LIM-06). 0 for free-only providers.
    ref_price_in: float = 0.0
    ref_price_out: float = 0.0


class ModelsConfig(BaseModel):
    providers: dict[str, Provider]
    profiles: dict[str, list[Route]]
    tasks: dict[str, str]
    # Free-plan overrides of `tasks` (FR-LIM-04); paid plans use `tasks`.
    free_tasks: dict[str, str] = {}

    def routes_for(self, task: str, plan: str = "free") -> list[Route]:
        if plan == "free" and task in self.free_tasks:
            return self.profiles[self.free_tasks[task]]
        return self.profiles[self.tasks[task]]


def load_models_config(path: Path) -> ModelsConfig:
    raw = path.read_text(encoding="utf-8")
    expanded = _ENV_VAR.sub(lambda m: _env(m.group(1)), raw)
    config = ModelsConfig.model_validate(yaml.safe_load(expanded))
    for profile, routes in config.profiles.items():
        for route in routes:
            if route.provider not in config.providers:
                raise ValueError(f"profile {profile!r} uses unknown provider {route.provider!r}")
    for task, profile in [*config.tasks.items(), *config.free_tasks.items()]:
        if profile not in config.profiles:
            raise ValueError(f"task {task!r} uses unknown profile {profile!r}")
    return config
