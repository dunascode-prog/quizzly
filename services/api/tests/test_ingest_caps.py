"""FR-SEC-04: one hostile or enormous file can't exhaust the worker."""

import asyncio
import io
import struct
import zipfile
import zlib
from datetime import timedelta

import pytest

from app.rag import extract
from app.worker import ingest, queue
from app.worker import main as worker
from tests.fixtures import make_pptx


def png_header(width: int, height: int) -> bytes:
    """A PNG that claims a size in its header but carries almost no pixel data."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(b"\x00"))
        + chunk(b"IEND", b"")
    )


def test_a_photo_over_40_megapixels_fails_before_it_is_decoded():
    for w, h in ((10_000, 10_000), (7_000, 7_000)):  # Pillow refuses the first, we the second
        with pytest.raises(extract.ExtractionError) as e:
            extract.check_image(png_header(w, h))
        assert e.value.reason == "too_large"


def test_pages_render_at_most_40_megapixels_and_absurd_pages_fail():
    assert extract.render_scale(595, 842) == 2.5  # A4 renders as wanted
    big = extract.render_scale(3000, 3000)  # a poster: scaled down to fit
    assert big < 2.5 and (3000 * big) * (3000 * big) <= extract.MAX_PIXELS + 1
    with pytest.raises(extract.ExtractionError) as e:
        extract.render_scale(10_000, 10_000)  # too big even at 72 dpi
    assert e.value.reason == "too_large"


def zip_with(name: str, size: int) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z, z.open(name, "w") as f:
        for _ in range(size // (1024 * 1024)):
            f.write(b"\x00" * 1024 * 1024)
    return buf.getvalue()


def test_zip_bombs_fail_before_unpacking_but_real_decks_pass(monkeypatch):
    with pytest.raises(extract.ExtractionError) as e:
        extract.check_zip(zip_with("ppt/media/bomb.bin", 8 * 1024 * 1024))  # ratio ~1000
    assert e.value.reason == "too_large"
    monkeypatch.setattr(extract, "MAX_ZIP_UNCOMPRESSED", 1024 * 1024)
    monkeypatch.setattr(extract, "MAX_ZIP_RATIO", 10**9)
    with pytest.raises(extract.ExtractionError):
        extract.check_zip(zip_with("big.bin", 2 * 1024 * 1024))  # over the size cap
    monkeypatch.undo()
    extract.check_zip(make_pptx([("Stacks", ["LIFO"])]))  # a normal deck is fine


async def test_oversized_uploads_are_refused_from_metadata_without_downloading(monkeypatch):
    downloads = []

    class Storage:
        async def list_sizes(self, folder):
            return {folder + "1.pdf": 900 * 1024 * 1024}

        async def download(self, path):
            downloads.append(path)
            return b""

    monkeypatch.setattr(ingest, "storage", lambda: Storage())
    doc = {"upload_path": "uploads/u/d/1.pdf", "image_count": None}
    with pytest.raises(extract.ExtractionError) as e:
        await ingest._download(doc, 25 * 1024 * 1024)
    assert e.value.reason == "too_large" and downloads == []


async def test_a_job_past_the_time_limit_is_stopped_and_its_document_failed(monkeypatch):
    calls = []

    async def slow(conn, job):
        await asyncio.sleep(5)

    async def claim(conn, worker_id, types):
        return {"id": 1, "type": "ingest_document", "attempts": 1, "max_attempts": 5, "payload": {}}

    async def fail(conn, job, error, retry=True):
        calls.append(("fail", error, retry))

    async def handle(conn, job, reason="crashed"):
        calls.append(("work failed", reason))

    monkeypatch.setattr(worker, "JOB_TIMEOUT", timedelta(seconds=0.05))
    monkeypatch.setitem(worker.HANDLERS, "ingest_document", slow)
    monkeypatch.setattr(queue, "claim", claim)
    monkeypatch.setattr(queue, "fail", fail)
    monkeypatch.setattr(worker.crashed, "handle", handle)
    await worker.run_one(None, "w1")
    assert calls == [("fail", "timeout", False), ("work failed", "too_large")]
