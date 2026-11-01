"""Signed URLs for other students' profile photos in lists (FR-PROF-05)."""

import logging
from typing import Any

import httpx

from app.core.storage import Storage
from app.domain import avatars

log = logging.getLogger("quizzly.api")


async def with_photo_urls(
    photos: Storage, rows: list[dict[str, Any]], path_key: str, url_key: str
) -> list[dict[str, Any]]:
    """Adds `url_key` (a signed URL, or None) to each row from its `path_key`, signing them all in
    one request, and drops the storage path so it never reaches the app. The query already left
    the path empty where the viewer may not see the photo."""
    paths = sorted({r[path_key] for r in rows if r.get(path_key)})
    urls: dict[str, str] = {}
    if paths:
        try:
            urls = await photos.signed_urls(paths, avatars.SIGNED_SECONDS)
        except httpx.HTTPError:
            log.warning("profile photo URLs unavailable; showing initials")
    return [
        {k: v for k, v in r.items() if k != path_key} | {url_key: urls.get(r.get(path_key) or "")}
        for r in rows
    ]
