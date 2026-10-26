"""One-off backfill for FR-SEC-07: files processed before shared copies existed still point at
their first uploader's folder. Run once after deploying: `python -m app.worker.shared_copies`."""

import asyncio
import logging

from psycopg import AsyncConnection

from app.core import db
from app.worker import cleanup, ingest

log = logging.getLogger("quizzly.shared_copies")


async def backfill(conn: AsyncConnection) -> int:
    """Copies every ready file still under `uploads/` to its shared path, repoints it, and
    removes the uploader's copy. Returns how many files moved."""
    rows = await (
        await conn.execute(
            "select id, sha256, storage_path from source_files "
            "where status = 'ready' and storage_path like 'uploads/%'"
        )
    ).fetchall()
    for row in rows:
        doc = {"upload_path": row["storage_path"]}
        target = await ingest._share(doc, row["sha256"])
        await conn.execute(
            "update source_files set storage_path = %s where id = %s", (target, row["id"])
        )
        await cleanup.remove_or_queue(conn, ingest.storage(), [row["storage_path"]])
        log.info("moved %s to %s", row["storage_path"], target)
    return len(rows)


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    pool = await db.open_pool()
    async with pool.connection() as conn:
        print("files moved to shared copies:", await backfill(conn))
    await db.close_pool()


if __name__ == "__main__":
    import selectors

    asyncio.run(main(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
