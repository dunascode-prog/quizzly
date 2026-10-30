"""Request dependencies shared by the route modules."""

from typing import Annotated

from fastapi import Depends
from psycopg import AsyncConnection

from app.core.auth import CurrentUser
from app.core.config import Settings, get_settings
from app.core.db import get_conn
from app.core.guard import guarded_user
from app.core.storage import Storage

_storage: Storage | None = None
_avatars: Storage | None = None


def get_storage(settings: Annotated[Settings, Depends(get_settings)]) -> Storage:
    """One Storage client (and its HTTP connection pool) for the process."""
    global _storage
    if _storage is None:
        _storage = Storage(settings)
    return _storage


def get_avatar_storage(settings: Annotated[Settings, Depends(get_settings)]) -> Storage:
    """The private avatars bucket (FR-PROF-04)."""
    global _avatars
    if _avatars is None:
        _avatars = Storage(settings, bucket=settings.avatars_bucket)
    return _avatars


# Signed in, not paused and under the request rate limit (FR-SEC-20/21).
User = Annotated[CurrentUser, Depends(guarded_user)]
Conn = Annotated[AsyncConnection, Depends(get_conn)]
AppSettings = Annotated[Settings, Depends(get_settings)]
StorageDep = Annotated[Storage, Depends(get_storage)]
AvatarStorageDep = Annotated[Storage, Depends(get_avatar_storage)]
