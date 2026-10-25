"""`delete_account` job: Storage files a deleted account left behind (FR-AUTH-05)."""

from psycopg import AsyncConnection

from app.worker import ingest


async def delete_account(conn: AsyncConnection, job: dict) -> None:
    """Retried by the queue until Storage accepts the deletion."""
    await ingest.storage().remove(job["payload"].get("storage_paths") or [])
