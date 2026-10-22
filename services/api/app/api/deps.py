"""Request dependencies shared by the route modules."""

from typing import Annotated

from fastapi import Depends
from psycopg import AsyncConnection

from app.core.auth import CurrentUser, get_current_user
from app.core.config import Settings, get_settings
from app.core.db import get_conn
from app.core.storage import Storage

_storage: Storage | None = None


def get_storage(settings: Annotated[Settings, Depends(get_settings)]) -> Storage:
    """One Storage client (and its HTTP connection pool) for the process."""
    global _storage
    if _storage is None:
        _storage = Storage(settings)
    return _storage


User = Annotated[CurrentUser, Depends(get_current_user)]
Conn = Annotated[AsyncConnection, Depends(get_conn)]
AppSettings = Annotated[Settings, Depends(get_settings)]
StorageDep = Annotated[Storage, Depends(get_storage)]
