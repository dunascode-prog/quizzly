"""Verifies Supabase access tokens on every request (ARCHITECTURE §5.6)."""

from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings

_bearer = HTTPBearer(auto_error=False)
_jwks_clients: dict[str, jwt.PyJWKClient] = {}


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: str | None


def _jwks_client(url: str) -> jwt.PyJWKClient:
    if url not in _jwks_clients:
        _jwks_clients[url] = jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)
    return _jwks_clients[url]


# Supabase's clock and ours (or a phone's) differ by a second or two; without leeway a token
# used right after sign-in can look issued "in the future" and be rejected.
CLOCK_LEEWAY_S = 30


def decode_token(token: str, settings: Settings) -> dict:
    options = {"require": ["exp", "sub", "aud"]}
    if settings.supabase_jwt_secret:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
            issuer=settings.jwt_issuer,
            options=options,
            leeway=CLOCK_LEEWAY_S,
        )
    signing_key = _jwks_client(settings.jwks_url).get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256", "ES256"],
        audience="authenticated",
        issuer=settings.jwt_issuer,
        options=options,
        leeway=CLOCK_LEEWAY_S,
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        claims = decode_token(credentials.credentials, settings)
        return CurrentUser(id=UUID(claims["sub"]), email=claims.get("email"))
    except (jwt.PyJWTError, ValueError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc
