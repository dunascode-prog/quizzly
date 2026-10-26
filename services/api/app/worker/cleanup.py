"""Storage removals that can't fail a request: tried now, otherwise retried by the
`cleanup_storage` job (FR-SEC-07)."""

import logging

import httpx
from psycopg import AsyncConnection

from app.worker import ingest, queue

log = logging.getLogger("quizzly.cleanup")


async def remove_or_queue(conn: AsyncConnection, storage, paths: list[str]) -> None:
    """Removes the files now; if Storage is unavailable, queues them for the cleanup job."""
    if not paths:
        return
    try:
        await storage.remove(paths)
    except httpx.HTTPError as exc:
        log.warning("storage removal deferred (%d paths): %r", len(paths), exc)
        await queue.enqueue(conn, "cleanup_storage", {"paths": paths})


async def cleanup_storage(conn: AsyncConnection, job: dict) -> None:
    """Retried by the queue (with backoff) until Storage accepts the removal."""
    await ingest.storage().remove(job["payload"].get("paths") or [])
