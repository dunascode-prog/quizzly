"""Document queries (FR-DOC-01..09, FR-CRS-02). Every query is scoped to the signed-in student."""

import re
from typing import Any
from uuid import UUID, uuid4

from psycopg import AsyncConnection

from app.domain import uploads, usage

MIME_TYPES = {
    ".pdf": "application/pdf",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

MAX_IMAGES = 30


# Shown to the student for documents.failure_reason codes (FRD §4 copy where it exists).
FAILURE_MESSAGES = {
    "encrypted": "We couldn't read this file (password-protected / damaged). "
    "Try exporting it again as PDF.",
    "corrupt": "We couldn't read this file (password-protected / damaged). "
    "Try exporting it again as PDF.",
    "no_text": "This looks like images without readable text. "
    "Try clearer photos with good lighting.",
    "too_large": "This file is too big. Documents can be up to 25 MB and 150 pages.",
    "upload_missing": "The upload didn't finish. Try adding the file again.",
    "internal": "Something went wrong while reading this file. Try uploading it again.",
    "crashed": "We couldn't process this file. Try exporting it again as PDF, or split it up.",
}

_SELECT = """
select d.id, d.title, d.original_filename, d.course_id, d.status::text as status,
       d.failure_reason, d.upload_path, d.source_file_id, d.created_at, d.image_count,
       d.upload_url_issued_at,
       sf.page_count, coalesce(cardinality(sf.low_ocr_pages), 0) as low_ocr_page_count,
       (select count(*) from topics t
         where t.source_file_id = d.source_file_id and t.parent_id is null) as topic_count,
       j.progress
from documents d
left join source_files sf on sf.id = d.source_file_id and sf.status = 'ready'
left join lateral (
  select progress from jobs where dedupe_key = 'ingest:' || d.id::text
  order by created_at desc limit 1
) j on true
where d.user_id = %(user)s and d.deleted_at is null
"""


def job_key(document_id: UUID) -> str:
    return f"ingest:{document_id}"


def file_kind(filename: str) -> str | None:
    """'.pdf' / '.pptx', or None for anything we can't process yet."""
    m = re.search(r"\.[A-Za-z0-9]+$", filename)
    ext = m.group(0).lower() if m else ""
    return ext if ext in MIME_TYPES else None


async def list_documents(
    conn: AsyncConnection, user_id: UUID, course_id: UUID | None, unfiled: bool
) -> list[dict[str, Any]]:
    where, params = "", {"user": user_id}
    if course_id:
        where, params["course"] = " and d.course_id = %(course)s", course_id
    elif unfiled:
        where = " and d.course_id is null"
    sql = _SELECT + where + " order by d.created_at desc"
    return await (await conn.execute(sql, params)).fetchall()


async def get_document(conn: AsyncConnection, user_id: UUID, document_id: UUID) -> dict | None:
    sql = _SELECT + " and d.id = %(id)s"
    return await (await conn.execute(sql, {"user": user_id, "id": document_id})).fetchone()


async def course_belongs_to(conn: AsyncConnection, user_id: UUID, course_id: UUID) -> bool:
    row = await (
        await conn.execute(
            "select 1 from courses where id = %s and user_id = %s", (course_id, user_id)
        )
    ).fetchone()
    return row is not None


async def create_document(
    conn: AsyncConnection,
    user_id: UUID,
    filename: str,
    course_id: UUID | None,
    image_count: int | None = None,
) -> dict:
    """A file upload, or with image_count a photo set (its upload_path is a folder). The server
    names the path; nothing from the client goes into it (FR-SEC-02)."""
    doc_id = uuid4()
    if image_count:
        title, path = filename, uploads.new_path(user_id, doc_id, None)
    else:
        title = filename.rpartition(".")[0] or filename
        path = uploads.new_path(user_id, doc_id, file_kind(filename) or ".pdf")
    await conn.execute(
        "insert into documents (id, user_id, course_id, title, original_filename, upload_path, "
        "image_count) values (%s, %s, %s, %s, %s, %s, %s)",
        (doc_id, user_id, course_id, title[:80], filename[:255], path, image_count),
    )
    return await get_document(conn, user_id, doc_id)


async def upload_url_issued(conn: AsyncConnection, document_id: UUID) -> None:
    """Starts the 10 minutes in which the upload must arrive (FR-SEC-17)."""
    await conn.execute(
        "update documents set upload_url_issued_at = now() where id = %s", (document_id,)
    )


async def mark_uploaded(conn: AsyncConnection, user_id: UUID, document_id: UUID) -> bool:
    """awaiting_upload (or a failed upload being retried) → uploaded. False if not allowed."""
    row = await (
        await conn.execute(
            "update documents set status = 'uploaded', failure_reason = null "
            "where id = %s and user_id = %s and deleted_at is null "
            "and (status = 'awaiting_upload' or (status = 'failed' and source_file_id is null)) "
            "returning id",
            (document_id, user_id),
        )
    ).fetchone()
    return row is not None


async def update_document(
    conn: AsyncConnection, user_id: UUID, document_id: UUID, fields: dict[str, Any]
) -> dict | None:
    if fields:
        sets = ", ".join(f"{k} = %s" for k in fields)
        await conn.execute(
            f"update documents set {sets} where id = %s and user_id = %s and deleted_at is null",
            (*fields.values(), document_id, user_id),
        )
    return await get_document(conn, user_id, document_id)


async def release(conn: AsyncConnection, deleted: list[dict]) -> list[str]:
    """After deleting documents (rows with upload_path, source_file_id), drop processed data no
    other document uses (FR-DOC-09) and return the Storage paths that are now safe to remove."""
    paths = {r["upload_path"] for r in deleted}
    for sf_id in {r["source_file_id"] for r in deleted if r["source_file_id"]}:
        orphan = await (
            await conn.execute(
                "delete from source_files sf where sf.id = %s and not exists "
                "(select 1 from documents d where d.source_file_id = sf.id) returning storage_path",
                (sf_id,),
            )
        ).fetchone()
        if orphan:
            paths.add(orphan["storage_path"])
    if not paths:
        return []
    still_used = await (
        await conn.execute(
            "select storage_path from source_files where storage_path = any(%s)", (list(paths),)
        )
    ).fetchall()
    return sorted(paths - {r["storage_path"] for r in still_used})


async def refund_uploads(
    conn: AsyncConnection, user_id: UUID, deleted: list[dict], tz: str
) -> None:
    """A deleted document gives today's upload back only if it was never processed (FR-SEC-05),
    e.g. a wrong file deleted before it finished uploading. Once processing has started the
    upload stays counted, so upload → delete → upload can't get round the daily limit."""
    await usage.give_back(conn, user_id, "upload", sum(r["refundable"] for r in deleted), tz)


async def delete_document(
    conn: AsyncConnection, user_id: UUID, document_id: UUID, tz: str
) -> list[str] | None:
    """Deletes the document and everything tied to it (cascades). Returns Storage paths to remove,
    or None if there was no such document."""
    async with conn.transaction():
        rows = await (
            await conn.execute(
                "delete from documents where id = %(id)s and user_id = %(user)s "
                "returning upload_path, source_file_id, "
                "processing_started_at is null and "
                "(created_at at time zone %(tz)s)::date = (now() at time zone %(tz)s)::date "
                "as refundable",
                {"id": document_id, "user": user_id, "tz": tz},
            )
        ).fetchall()
        if not rows:
            return None
        await refund_uploads(conn, user_id, rows, tz)
        return await release(conn, rows)
