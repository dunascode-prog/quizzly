"""FR-SEC-06: transient errors don't poison a shared source file for every later upload."""

import uuid

import pytest

from app.rag import extract
from app.worker import ingest


class Conn:
    """Records SQL; `rows` are what the next fetchone calls return, in order."""

    def __init__(self, rows=()):
        self.sql: list[str] = []
        self.rows = list(rows)

    async def execute(self, sql, params=None):
        self.sql.append(" ".join(sql.split()))
        rows = self.rows

        class Cur:
            async def fetchone(self):
                return rows.pop(0) if rows else None

        return Cur()


def touched(conn: Conn, table: str) -> list[str]:
    return [s for s in conn.sql if f" {table} " in f" {s} "]


@pytest.mark.parametrize("reason", sorted(ingest.PERMANENT_REASONS))
async def test_permanent_reasons_fail_the_shared_file(reason):
    conn = Conn()
    await ingest._fail(conn, uuid.uuid4(), reason, uuid.uuid4())
    assert any(s.startswith("update source_files set status = 'failed'") for s in conn.sql)


@pytest.mark.parametrize("reason", ["internal", "upload_missing"])
async def test_transient_failures_release_the_shared_file_instead(reason):
    conn = Conn()
    doc, src = uuid.uuid4(), uuid.uuid4()
    await ingest._fail(conn, doc, reason, src)
    assert touched(conn, "source_files") == [
        "delete from source_files where id = %s and status <> 'ready'"
    ]
    assert (
        conn.sql[-1] == "update documents set status = 'failed', failure_reason = %s where id = %s"
    )


async def test_a_permanently_failed_file_fails_new_uploads_at_once():
    conn = Conn([{"id": uuid.uuid4(), "status": "failed", "failure_reason": "encrypted"}])
    doc = {"id": uuid.uuid4(), "source_file_id": None, "upload_path": "uploads/u/d/1.pdf"}
    with pytest.raises(extract.ExtractionError) as e:
        await ingest._claim_source_file(conn, doc, "sha", "application/pdf", 10)
    assert e.value.reason == "encrypted"


async def test_a_file_that_failed_for_a_transient_reason_is_taken_over_and_reprocessed():
    src = uuid.uuid4()
    conn = Conn([{"id": src, "status": "failed", "failure_reason": "internal"}])
    doc = {"id": uuid.uuid4(), "source_file_id": None, "upload_path": "uploads/u/d/1.pdf"}
    assert await ingest._claim_source_file(conn, doc, "sha", "application/pdf", 10) == (src, False)
    assert any(s.startswith("update source_files set status = 'processing'") for s in conn.sql)
    assert any(s.startswith("update documents set source_file_id") for s in conn.sql)
