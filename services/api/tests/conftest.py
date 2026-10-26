import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.core.db import get_conn
from app.main import create_app

SUPABASE_URL = "https://test-project.supabase.co"
JWT_SECRET = "test-secret-that-is-long-enough-for-hs256"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,
        env="test",
        supabase_url=SUPABASE_URL,
        supabase_jwt_secret=JWT_SECRET,
        database_url="",
    )


@pytest.fixture
def client(settings: Settings, monkeypatch):
    # Keep tests away from a developer's real .env (e.g. a live DATABASE_URL).
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings
    # Route tests replace app.domain queries with fakes, so the connection is never used.
    app.dependency_overrides[get_conn] = lambda: None
    with TestClient(app) as c:
        yield c
