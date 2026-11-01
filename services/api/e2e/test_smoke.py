"""Smoke checks: no account needed, safe against production after every deploy."""

import base64
import json
import time

import pytest

from e2e.conftest import CONFIG

pytestmark = pytest.mark.smoke

# One route from every router: all of them need a signed-in student (FR-SEC-01).
PROTECTED = [
    ("GET", "/v1/me"),
    ("GET", "/v1/courses"),
    ("GET", "/v1/documents"),
    ("POST", "/v1/documents"),
    ("GET", "/v1/usage"),
    ("GET", "/v1/home"),
    ("GET", "/v1/practice"),
    ("GET", "/v1/notifications"),
    ("GET", "/v1/coursemates"),
    ("GET", "/v1/me/invite"),
    ("GET", "/v1/plans"),
    ("POST", "/v1/plans/purchase"),
    ("GET", "/v1/me/settings"),
    ("POST", "/v1/shares/join"),
    ("GET", "/v1/documents/00000000-0000-0000-0000-000000000000/chat"),
    ("DELETE", "/v1/me"),
]


def test_health(api):
    r = api.get("/healthz")
    assert r.status_code == 200


@pytest.mark.parametrize("method, path", PROTECTED, ids=[f"{m} {p}" for m, p in PROTECTED])
def test_every_route_needs_a_session(api, method, path):
    r = api.request(method, path)
    assert r.status_code == 401, (method, path, r.status_code)


def _jwt(header: dict, payload: dict, signature: bytes = b"") -> str:
    def part(b: bytes) -> str:
        return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

    return ".".join(
        [part(json.dumps(header).encode()), part(json.dumps(payload).encode()), part(signature)]
    )


@pytest.mark.parametrize(
    "token",
    [
        "not-a-token",
        _jwt({"alg": "none", "typ": "JWT"}, {"sub": "00000000-0000-0000-0000-000000000001"}),
        _jwt(
            {"alg": "HS256", "typ": "JWT"},
            {
                "sub": "00000000-0000-0000-0000-000000000001",
                "aud": "authenticated",
                "exp": int(time.time()) + 3600,
                "role": "authenticated",
            },
            b"forged-signature-forged-signature",
        ),
    ],
    ids=["garbage", "alg-none", "forged-signature"],
)
def test_forged_tokens_are_refused(api, token):
    r = api.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_other_websites_cannot_call_the_api_from_a_browser(api):
    r = api.options(
        "/v1/me",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert r.headers.get("access-control-allow-origin") not in ("*", "https://evil.example")


def test_metrics_are_hidden_without_the_token(api):
    assert api.get("/internal/metrics").status_code == 404
    assert api.get("/internal/metrics", headers={"x-metrics-token": "guess"}).status_code == 404


@pytest.mark.skipif(CONFIG["env"] != "production", reason="production only")
def test_production_hides_the_api_docs(api):
    """FR-SEC-15."""
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert api.get(path).status_code == 404, path


def test_errors_do_not_leak_internals(api):
    r = api.get("/v1/documents/not-a-uuid", headers={"Authorization": "Bearer x"})
    assert r.status_code in (401, 422)
    assert "Traceback" not in r.text and "psycopg" not in r.text
