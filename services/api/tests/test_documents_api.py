import uuid
from datetime import UTC, datetime

import pytest

from app.api.deps import get_storage
from app.domain import courses, documents, usage
from app.worker import queue
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

USER = uuid.uuid4()
NOW = datetime.now(UTC)


def auth() -> dict:
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, sub=str(USER))}"}


def doc_row(**over) -> dict:
    row = {
        "id": uuid.uuid4(),
        "title": "Stacks",
        "original_filename": "Stacks.pdf",
        "course_id": None,
        "status": "awaiting_upload",
        "failure_reason": None,
        "upload_path": f"uploads/{USER}/x/Stacks.pdf",
        "source_file_id": None,
        "created_at": NOW,
        "page_count": None,
        "low_ocr_page_count": 0,
        "topic_count": 0,
        "progress": None,
    }
    return row | over


class FakeStorage:
    def __init__(self):
        self.removed: list[str] = []

    async def signed_upload_url(self, path):
        return f"https://storage.test/upload/{path}?token=t"

    async def remove(self, paths):
        self.removed.extend(paths)


@pytest.fixture
def fake(client, monkeypatch):
    """In-memory stand-ins for the course/document/usage queries and Storage."""
    state = {"courses": {}, "docs": {}, "uploads_used": 0, "jobs": [], "storage": FakeStorage()}
    client.app.dependency_overrides[get_storage] = lambda: state["storage"]

    async def list_courses(conn, user_id):
        return list(state["courses"].values())

    async def create_course(conn, user_id, code, title):
        code = courses.normalize_code(code)
        if any(c["code"] == code for c in state["courses"].values()):
            raise courses.DuplicateCourse(code)
        c = {"id": uuid.uuid4(), "code": code, "title": title, "document_count": 0}
        state["courses"][c["id"]] = c | {"created_at": NOW}
        return state["courses"][c["id"]]

    async def delete_course(conn, user_id, course_id, delete_documents):
        if state["courses"].pop(course_id, None) is None:
            return None
        return ["uploads/a.pdf"] if delete_documents else []

    async def take(conn, user_id, resource, limit, tz):
        if state["uploads_used"] >= limit:
            return None
        state["uploads_used"] += 1
        return state["uploads_used"]

    async def used_today(conn, user_id, tz):
        return {"upload": state["uploads_used"]}

    async def course_belongs_to(conn, user_id, course_id):
        return course_id in state["courses"]

    async def create_document(conn, user_id, filename, course_id):
        d = doc_row(
            title=filename.rsplit(".", 1)[0], original_filename=filename, course_id=course_id
        )
        state["docs"][d["id"]] = d
        return d

    async def get_document(conn, user_id, document_id):
        return state["docs"].get(document_id)

    async def mark_uploaded(conn, user_id, document_id):
        d = state["docs"][document_id]
        if d["status"] != "awaiting_upload":
            return False
        d["status"] = "uploaded"
        return True

    async def enqueue(conn, job_type, payload, *, user_id=None, dedupe_key=None):
        state["jobs"].append((job_type, payload, dedupe_key))

    for mod, name, fn in [
        (courses, "list_courses", list_courses),
        (courses, "create_course", create_course),
        (courses, "delete_course", delete_course),
        (usage, "take", take),
        (usage, "used_today", used_today),
        (documents, "course_belongs_to", course_belongs_to),
        (documents, "create_document", create_document),
        (documents, "get_document", get_document),
        (documents, "mark_uploaded", mark_uploaded),
        (queue, "enqueue", enqueue),
    ]:
        monkeypatch.setattr(mod, name, fn)
    return state


def test_course_codes_are_normalised_validated_and_unique(client, fake):
    r = client.post("/v1/courses", headers=auth(), json={"code": " csc  225 ", "title": "DS"})
    assert r.status_code == 201
    assert r.json()["code"] == "CSC 225"
    dup = client.post("/v1/courses", headers=auth(), json={"code": "csc 225"})
    assert dup.status_code == 409
    assert "already have a course called CSC 225" in dup.json()["detail"]
    for bad in ("C", "ABCDEFGHIJKLM"):
        assert client.post("/v1/courses", headers=auth(), json={"code": bad}).status_code == 422
    assert [c["code"] for c in client.get("/v1/courses", headers=auth()).json()] == ["CSC 225"]


def test_deleting_a_course_must_say_what_happens_to_its_documents(client, fake):
    cid = client.post("/v1/courses", headers=auth(), json={"code": "MTH 201"}).json()["id"]
    assert client.delete(f"/v1/courses/{cid}", headers=auth()).status_code == 422
    r = client.delete(f"/v1/courses/{cid}?documents=delete", headers=auth())
    assert r.status_code == 204
    assert fake["storage"].removed == ["uploads/a.pdf"]
    assert client.delete(f"/v1/courses/{cid}?documents=unfile", headers=auth()).status_code == 404


def test_upload_is_registered_and_gets_a_signed_url(client, fake):
    r = client.post(
        "/v1/documents", headers=auth(), json={"filename": "Stacks.PDF", "size_bytes": 1000}
    )
    assert r.status_code == 201
    body = r.json()
    assert body["upload_url"].startswith("https://storage.test/upload/uploads/")
    assert body["document"]["status"] == "awaiting_upload"

    doc_id = body["document"]["id"]
    done = client.post(f"/v1/documents/{doc_id}/uploaded", headers=auth())
    assert done.status_code == 200 and done.json()["status"] == "uploaded"
    assert fake["jobs"] == [("ingest_document", {"document_id": doc_id}, f"ingest:{doc_id}")]
    again = client.post(f"/v1/documents/{doc_id}/uploaded", headers=auth())
    assert again.status_code == 409


def test_uploads_are_checked_before_the_file_is_sent(client, fake):
    def post(**body):
        return client.post("/v1/documents", headers=auth(), json=body)

    assert post(filename="notes.docx", size_bytes=10).status_code == 422
    assert "25 MB" in post(filename="big.pdf", size_bytes=26 * 1024 * 1024).json()["detail"]
    unknown = post(filename="a.pdf", size_bytes=10, course_id=str(uuid.uuid4()))
    assert unknown.status_code == 422
    assert fake["uploads_used"] == 0  # rejected uploads don't use the daily allowance


def test_daily_upload_limit(client, fake):
    for _ in range(5):
        r = client.post(
            "/v1/documents", headers=auth(), json={"filename": "a.pdf", "size_bytes": 9}
        )
        assert r.status_code == 201
    over = client.post("/v1/documents", headers=auth(), json={"filename": "a.pdf", "size_bytes": 9})
    assert over.status_code == 429
    assert over.json()["detail"] == "You've used today's 5 uploads. Resets at 12:00 AM."
    assert client.get("/v1/usage", headers=auth()).json() == {
        "uploads": {"used": 5, "limit": 5, "remaining": 0},
        "explanations": {"used": 0, "limit": 30, "remaining": 30},
    }


def test_failed_documents_carry_a_readable_message(client, fake):
    d = doc_row(status="failed", failure_reason="encrypted")
    fake["docs"][d["id"]] = d
    body = client.get(f"/v1/documents/{d['id']}", headers=auth()).json()
    assert body["failure_reason"] == "encrypted"
    assert body["failure_message"].startswith("We couldn't read this file")
