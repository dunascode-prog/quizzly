import time
import uuid

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core import auth
from tests.conftest import JWT_SECRET, SUPABASE_URL

ISSUER = f"{SUPABASE_URL}/auth/v1"


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


def test_me_requires_token(client):
    assert client.get("/v1/me").status_code == 401


def test_me_with_valid_hs256_token(client):
    user_id = str(uuid.uuid4())
    token = make_token(JWT_SECRET, sub=user_id)
    response = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == {"id": user_id, "email": "tolu@example.com"}


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
