"""`ingest_document` job: uploaded file → pages → chunks + embeddings → topic outline.

Derived data hangs off source_files (one row per SHA-256), so a file another student already
uploaded is reused instead of processed again (FR-DOC-06, ARCHITECTURE §5.1).
"""

import asyncio
import hashlib
import logging
from datetime import timedelta
from uuid import UUID

import httpx
from psycopg import AsyncConnection

from app.core.config import get_settings
from app.core.storage import Storage
from app.llm.config import load_models_config
from app.llm.gateway import AllProvidersBusy, LLMGateway
from app.rag import embed, extract, outline, text
from app.worker import queue

log = logging.getLogger("quizzly.ingest")

PIPELINE_VERSION = 1
MIN_TEXT_CHARS = 40  # below this a file is treated as having no readable text

_storage: Storage | None = None
_gateway: LLMGateway | None = None


def storage() -> Storage:
    global _storage
    if _storage is None:
        _storage = Storage(get_settings())
    return _storage


def gateway() -> LLMGateway:
    global _gateway
    if _gateway is None:
        _gateway = LLMGateway(load_models_config(get_settings().models_config_path))
    return _gateway


async def _fail(
    conn: AsyncConnection, document_id: UUID, reason: str, source_file_id: UUID | None = None
) -> None:
    """A file we can't use: readable reason on the document, and on the shared source file."""
    if source_file_id:
        await conn.execute(
            "update source_files set status = 'failed', failure_reason = %s where id = %s",
            (reason, source_file_id),
        )
        await conn.execute(
            "update documents set status = 'failed', failure_reason = %s "
            "where source_file_id = %s and status in ('uploaded', 'processing')",
            (reason, source_file_id),
        )
    await conn.execute(
        "update documents set status = 'failed', failure_reason = %s where id = %s",
        (reason, document_id),
    )
    log.info("document %s failed: %s", document_id, reason)


async def _claim_source_file(
    conn: AsyncConnection, doc: dict, sha: str, mime: str, size: int
) -> tuple[UUID, bool]:
    """Returns (source_file_id, already_ready). Raises RetryLater while another job has it."""
    sf = await (
        await conn.execute(
            "select id, status::text as status, failure_reason::text as failure_reason "
            "from source_files where sha256 = %s",
            (sha,),
        )
    ).fetchone()
    if sf is None:
        sf = await (
            await conn.execute(
                "insert into source_files (sha256, mime_type, size_bytes, storage_path, status) "
                "values (%s, %s, %s, %s, 'processing') on conflict (sha256) do nothing "
                "returning id, 'processing' as status, null as failure_reason",
                (sha, mime, size, doc["upload_path"]),
            )
        ).fetchone()
        if sf is None:  # another job inserted it between our select and insert
            raise queue.RetryLater(timedelta(seconds=5), "source file being created")
        await conn.execute(
            "update documents set source_file_id = %s where id = %s", (sf["id"], doc["id"])
        )
        return sf["id"], False
    if sf["status"] == "ready":
        return sf["id"], True
    if sf["status"] == "failed":
        raise extract.ExtractionError(sf["failure_reason"] or "internal")
    if doc["source_file_id"] != sf["id"]:
        raise queue.RetryLater(timedelta(seconds=15), "same file is processing for someone else")
    # Ours, left half-done by a crash or an LLM outage: start its derived data again.
    for table in ("chunks", "topics", "pages"):
        await conn.execute(f"delete from {table} where source_file_id = %s", (sf["id"],))
    return sf["id"], False


async def ingest_document(conn: AsyncConnection, job: dict) -> None:
    settings = get_settings()
    document_id = UUID(job["payload"]["document_id"])
    doc = await (
        await conn.execute(
            "select id, user_id, upload_path, source_file_id, status::text as status "
            "from documents where id = %s and deleted_at is null",
            (document_id,),
        )
    ).fetchone()
    if doc is None or doc["status"] == "ready":
        return  # deleted while queued, or already done

    source_file_id: UUID | None = None
    try:
        await conn.execute(
            "update documents set status = 'processing' where id = %s", (document_id,)
        )
        await queue.set_progress(conn, job["id"], 5)

        try:
            data = await storage().download(doc["upload_path"])
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (400, 404):
                await _fail(conn, document_id, "upload_missing")
                return
            raise
        if len(data) > settings.max_upload_bytes:
            await _fail(conn, document_id, "too_large")
            return

        mime = extract.sniff(data)
        sha = hashlib.sha256(data).hexdigest()
        source_file_id, ready = await _claim_source_file(conn, doc, sha, mime, len(data))
        if ready:
            await _link_ready(conn, document_id, source_file_id, doc["upload_path"])
            return
        await queue.set_progress(conn, job["id"], 10)

        if await asyncio.to_thread(extract.page_count, data, mime) > settings.max_document_pages:
            await _fail(conn, document_id, "too_large", source_file_id)
            return
        pages = await asyncio.to_thread(extract.extract, data, mime)
        pages = text.guess_headings(text.clean_pages(pages))
        if sum(len(p.text) for p in pages) < MIN_TEXT_CHARS:
            # Scans and photos need OCR, which isn't built yet (FR-DOC-07).
            await _fail(conn, document_id, "no_text", source_file_id)
            return
        await queue.set_progress(conn, job["id"], 30)

        chunks = text.chunk_pages(pages)
        vectors = await asyncio.to_thread(
            embed.embed_passages, [c.content for c in chunks], settings.embedding_model
        )
        await queue.set_progress(conn, job["id"], 70)

        drafts = outline.outline_from_headings(pages) or await outline.outline_with_llm(
            gateway(), pages
        )
        await queue.set_progress(conn, job["id"], 90)

        await _save(conn, source_file_id, pages, chunks, vectors, drafts, settings.embedding_model)
        log.info(
            "document %s ready: %d pages, %d chunks, %d topics",
            document_id,
            len(pages),
            len(chunks),
            len(drafts),
        )
    except extract.ExtractionError as exc:
        await _fail(conn, document_id, exc.reason, source_file_id)
    except (queue.RetryLater, AllProvidersBusy):
        raise  # the worker re-queues these without spending an attempt
    except Exception:
        if job["attempts"] >= job["max_attempts"]:
            await _fail(conn, document_id, "internal", source_file_id)
        raise


async def _link_ready(
    conn: AsyncConnection, document_id: UUID, source_file_id: UUID, upload_path: str
) -> None:
    """Identical file already processed: reuse it and drop the duplicate upload (FR-DOC-06)."""
    shared = await (
        await conn.execute("select storage_path from source_files where id = %s", (source_file_id,))
    ).fetchone()
    await conn.execute(
        "update documents set source_file_id = %s, status = 'ready', failure_reason = null "
        "where id = %s",
        (source_file_id, document_id),
    )
    if shared and shared["storage_path"] != upload_path:
        await storage().remove([upload_path])
    log.info("document %s reused processed file %s", document_id, source_file_id)


async def _save(
    conn: AsyncConnection,
    source_file_id: UUID,
    pages: list[extract.Page],
    chunks: list[text.Chunk],
    vectors: list[list[float]],
    drafts: list[outline.TopicDraft],
    embedding_model: str,
) -> None:
    owners = outline.assign_chunks(drafts, chunks)
    tokens = [0] * len(drafts)
    for chunk, owner in zip(chunks, owners, strict=True):
        tokens[owner] += chunk.token_count
    async with conn.transaction():
        async with conn.cursor() as cur:
            await cur.executemany(
                "insert into pages (source_file_id, page_number, text, extraction_method) "
                "values (%s, %s, %s, 'text')",
                [(source_file_id, p.number, p.text) for p in pages],
            )
        topic_ids = []
        for ordinal, (d, tok) in enumerate(zip(drafts, tokens, strict=True)):
            row = await (
                await conn.execute(
                    "insert into topics (source_file_id, ordinal, title, summary, page_start, "
                    "page_end, token_count, from_heading) values (%s, %s, %s, %s, %s, %s, %s, %s) "
                    "returning id",
                    (
                        source_file_id,
                        ordinal,
                        d.title,
                        d.summary,
                        d.page_start,
                        d.page_end,
                        tok,
                        d.from_heading,
                    ),
                )
            ).fetchone()
            topic_ids.append(row["id"])
        async with conn.cursor() as cur:
            await cur.executemany(
                "insert into chunks (source_file_id, topic_id, ordinal, page_start, page_end, "
                "content, token_count, embedding) values (%s, %s, %s, %s, %s, %s, %s, %s::vector)",
                [
                    (
                        source_file_id,
                        topic_ids[owner],
                        c.ordinal,
                        c.page_start,
                        c.page_end,
                        c.content,
                        c.token_count,
                        embed.to_pgvector(v),
                    )
                    for c, v, owner in zip(chunks, vectors, owners, strict=True)
                ],
            )
        await conn.execute(
            "update source_files set status = 'ready', page_count = %s, embedding_model = %s, "
            "pipeline_version = %s, processed_at = now() where id = %s",
            (len(pages), embedding_model, PIPELINE_VERSION, source_file_id),
        )
        # Every document waiting on this file becomes ready together.
        await conn.execute(
            "update documents set status = 'ready', failure_reason = null "
            "where source_file_id = %s and status in ('uploaded', 'processing')",
            (source_file_id,),
        )
