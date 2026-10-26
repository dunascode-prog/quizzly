"""FR-SEC-07: processed files live in a service-owned shared copy."""

import httpx

from app.worker import cleanup, ingest, queue


class Storage:
    def __init__(self, fail_remove=False):
        self.copies: list[tuple[str, str]] = []
        self.removed: list[str] = []
        self.fail_remove = fail_remove

    async def copy(self, source, destination):
        self.copies.append((source, destination))

    async def list_folder(self, folder):
        return [folder + "001.jpg", folder + "002.jpg"]

    async def remove(self, paths):
        if self.fail_remove:
            raise httpx.ConnectError("storage down")
        self.removed.extend(paths)


async def test_a_file_is_copied_to_its_shared_path(monkeypatch):
    s = Storage()
    monkeypatch.setattr(ingest, "storage", lambda: s)
    path = await ingest._share({"upload_path": "uploads/u/d/1.pdf"}, "abc")
    assert path == "shared/abc" and s.copies == [("uploads/u/d/1.pdf", "shared/abc")]


async def test_each_photo_of_a_set_is_copied_into_a_shared_folder(monkeypatch):
    s = Storage()
    monkeypatch.setattr(ingest, "storage", lambda: s)
    path = await ingest._share({"upload_path": "uploads/u/d/"}, "abc")
    assert path == "shared/abc/"
    assert s.copies == [
        ("uploads/u/d/001.jpg", "shared/abc/001.jpg"),
        ("uploads/u/d/002.jpg", "shared/abc/002.jpg"),
    ]


async def test_a_failed_storage_removal_is_left_to_the_cleanup_job(monkeypatch):
    jobs = []

    async def enqueue(conn, job_type, payload, **kw):
        jobs.append((job_type, payload))

    monkeypatch.setattr(queue, "enqueue", enqueue)
    await cleanup.remove_or_queue(None, Storage(fail_remove=True), ["uploads/u/d/1.pdf"])
    assert jobs == [("cleanup_storage", {"paths": ["uploads/u/d/1.pdf"]})]
    ok = Storage()
    await cleanup.remove_or_queue(None, ok, ["a", "b"])
    assert ok.removed == ["a", "b"]


async def test_the_cleanup_job_removes_its_paths(monkeypatch):
    s = Storage()
    monkeypatch.setattr(ingest, "storage", lambda: s)
    await cleanup.cleanup_storage(None, {"payload": {"paths": ["x", "y"]}})
    assert s.removed == ["x", "y"]
