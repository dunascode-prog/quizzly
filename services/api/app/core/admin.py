"""Who may use `/admin/*` (WEB.md §3, admin security), and the audit log.

An admin is a Supabase user whose `app_metadata.role` is "admin" (set only with the service role,
never by the user) and who signed in with their second factor, so the token says `aal: aal2`.
Both are checked on every request, from the verified token alone."""

import json
from dataclasses import dataclass
from typing import Annotated, Any
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from psycopg import AsyncConnection

from app.core.auth import _bearer, decode_token
from app.core.config import Settings, get_settings

NOT_ADMIN = "This is for the Quizzly team only."
NEEDS_2FA = "Sign in with your authenticator code to use the admin app."


@dataclass(frozen=True)
class AdminUser:
    id: UUID
    email: str | None


def get_admin(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AdminUser:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        claims = decode_token(credentials.credentials, settings)
        user_id = UUID(claims["sub"])
    except (jwt.PyJWTError, ValueError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc
    role = (claims.get("app_metadata") or {}).get("role")
    if role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, NOT_ADMIN)
    if claims.get("aal") != "aal2":
        raise HTTPException(status.HTTP_403_FORBIDDEN, NEEDS_2FA)
    return AdminUser(id=user_id, email=claims.get("email"))


Admin = Annotated[AdminUser, Depends(get_admin)]


async def audit(
    conn: AsyncConnection,
    admin: AdminUser,
    action: str,
    target: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    await conn.execute(
        "insert into admin_audit_log (admin_id, action, target, detail) values (%s, %s, %s, %s)",
        (admin.id, action, target, json.dumps(detail or {}, default=str)),
    )
