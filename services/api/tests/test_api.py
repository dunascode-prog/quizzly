import time
import uuid
from datetime import UTC, datetime

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core import auth
from app.domain import accounts
from tests.conftest import JWT_SECRET, SUPABASE_URL

ISSUER = f"{SUPABASE_URL}/auth/v1"


UNILAG = {
    "id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
    "name": "University of Lagos",
    "short_name": "UNILAG",
    "type": "university",
    "state": "Lagos",
}


@pytest.fixture(autouse=True)
def profiles(monkeypatch):
    """In-memory stand-in for app.domain.accounts so route tests don't need Postgres."""
    store: dict[uuid.UUID, dict] = {}
    calls: dict[str, object] = {}

    async def get_profile(conn, user_id):
        row = store.get(user_id)
        if row is None:
            return None
        inst = UNILAG if row.get("institution_id") == UNILAG["id"] else None
        return {
            "full_name": None,
            "institution_id": None,
            "institution_other": None,
            "department": None,
            "level": None,
            "explanation_style": "standard",
            "terms_accepted_at": None,
            **row,
            "institution_name": inst and inst["name"],
            "institution_short_name": inst and inst["short_name"],
        }

    async def update_profile(conn, user_id, fields, terms_version):
        calls["update"] = (dict(fields), terms_version)
        row = store.setdefault(user_id, {})
        row.update(fields)
        if terms_version:
            row["terms_accepted_at"] = datetime.now(UTC)
        return await get_profile(conn, user_id)

    async def institution_exists(conn, institution_id):
        return institution_id == UNILAG["id"]

    async def search_institutions(conn, query, limit):
        calls["search"] = (query, limit)
        return [UNILAG]

    monkeypatch.setattr(accounts, "get_profile", get_profile)
    monkeypatch.setattr(accounts, "update_profile", update_profile)
    monkeypatch.setattr(accounts, "institution_exists", institution_exists)
    monkeypatch.setattr(accounts, "search_institutions", search_institutions)
    return calls


def auth_header(user_id: str | None = None) -> dict:
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, sub=user_id or str(uuid.uuid4()))}"}


def make_token(key, algorithm="HS256", **overrides) -> str:
    claims = {
        "sub": str(uuid.uuid4()),
        "email": "tolu@example.com",
        "aud": "authenticated",
        "iss": ISSUER,
        "exp": int(time.time()) + 3600,
    }
    claims.update(overrides)
    return jwt.encode(claims, key, algorithm=algorithm)


def test_healthz(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-request-id"]


def test_cors_allows_local_web_preview_only(client):
    ok = client.get("/healthz", headers={"Origin": "http://localhost:8082"})
    assert ok.headers["access-control-allow-origin"] == "http://localhost:8082"
    evil = client.get("/healthz", headers={"Origin": "https://evil.example.com"})
    assert "access-control-allow-origin" not in evil.headers


def test_me_requires_token(client):
    assert client.get("/v1/me").status_code == 401


def test_me_with_valid_hs256_token(client):
    user_id = str(uuid.uuid4())
    token = make_token(JWT_SECRET, sub=user_id)
    response = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == user_id
    assert body["email"] == "tolu@example.com"
    assert body["onboarded"] is False


def test_me_rejects_expired_token(client):
    token = make_token(JWT_SECRET, exp=int(time.time()) - 10)
    response = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_me_rejects_wrong_audience_and_issuer(client):
    for bad in ({"aud": "anon"}, {"iss": "https://evil.example.com/auth/v1"}):
        token = make_token(JWT_SECRET, **bad)
        response = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401, bad


def test_me_with_jwks_signed_token(client, settings, monkeypatch):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    settings.supabase_jwt_secret = ""

    class FakeJwksClient:
        def get_signing_key_from_jwt(self, _token):
            return jwt.PyJWK.from_dict(
                {
                    **jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key(), as_dict=True),
                    "alg": "RS256",
                }
            )

    monkeypatch.setattr(auth, "_jwks_client", lambda url: FakeJwksClient())
    token = make_token(private_key, algorithm="RS256")
    response = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200


def test_onboarding_needs_institution_level_and_terms(client, profiles):
    user = str(uuid.uuid4())
    h = auth_header(user)
    partial = client.patch(
        "/v1/me", headers=h, json={"full_name": "  Tolu Adebayo ", "level": "200L"}
    )
    assert partial.status_code == 200
    assert partial.json()["full_name"] == "Tolu Adebayo"
    assert partial.json()["onboarded"] is False
    assert profiles["update"][1] is None

    done = client.patch(
        "/v1/me",
        headers=h,
        json={
            "institution_id": str(UNILAG["id"]),
            "department": "Computer Science",
            "accept_terms": True,
        },
    ).json()
    assert done["institution"]["short_name"] == "UNILAG"
    assert done["terms_accepted"] is True
    assert done["onboarded"] is True
    assert profiles["update"][1] == "2026-10-22"
    assert client.get("/v1/me", headers=h).json()["onboarded"] is True


def test_listed_and_typed_school_replace_each_other(client, profiles):
    h = auth_header()
    client.patch("/v1/me", headers=h, json={"institution_other": "Federal College of Fisheries"})
    assert profiles["update"][0] == {
        "institution_other": "Federal College of Fisheries",
        "institution_id": None,
    }
    client.patch("/v1/me", headers=h, json={"institution_id": str(UNILAG["id"])})
    assert profiles["update"][0] == {"institution_id": UNILAG["id"], "institution_other": None}


def test_update_rejects_unknown_institution_and_bad_level(client):
    h = auth_header()
    unknown = client.patch("/v1/me", headers=h, json={"institution_id": str(uuid.uuid4())})
    assert unknown.status_code == 422
    assert client.patch("/v1/me", headers=h, json={"level": "800L"}).status_code == 422


def test_institution_search(client, profiles):
    assert client.get("/v1/institutions?q=unilag").status_code == 401
    response = client.get("/v1/institutions?q=unilag&limit=5", headers=auth_header())
    assert response.status_code == 200
    assert response.json()[0]["name"] == "University of Lagos"
    assert profiles["search"] == ("unilag", 5)


def test_profile_routes_need_a_database(settings, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    app = create_app()
    app.dependency_overrides[auth.get_settings] = lambda: settings
    with TestClient(app) as c:
        assert c.get("/v1/me", headers=auth_header()).status_code == 503
