import uuid
from datetime import UTC, date, datetime

import pytest

from app.api.deps import get_storage
from app.domain import courses, documents, sharing, uploads, usage
from app.worker import queue
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

USER = uuid.uuid4()
NOW = datetime.now(UTC)
TODAY = date(2026, 10, 27)


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
        "image_count": None,
        "upload_url_issued_at": None,
    }
    return row | over


class FakeStorage:
    """Uploaded objects are {path: (bytes, created_at)}; tests add them as the app's PUT would."""

    def __init__(self):
        self.removed: list[str] = []
        self.objects: dict[str, tuple[bytes, datetime]] = {}

    def put(self, path, data=b"%PDF-1.7 notes", created=None):
        self.objects[path] = (data, created or datetime.now(UTC))

    async def info(self, path):
        if path not in self.objects:
            return None
        data, created = self.objects[path]
        return {"size": len(data), "created_at": created.isoformat()}

    async def head(self, path, n=16):
        return self.objects[path][0][:n]

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

    async def create_course(conn, user_id, code, title, exam_date=None, accent=None):
        code = courses.normalize_code(code)
        if any(c["code"] == code for c in state["courses"].values()):
            raise courses.DuplicateCourse(code)
        accent = accent or ["lagoon", "ankara", "palm", "lavender"][len(state["courses"]) % 4]
        c = {
            "id": uuid.uuid4(),
            "code": code,
            "title": title,
            "document_count": 0,
            "exam_date": exam_date,
            "accent": accent,
        }
        state["courses"][c["id"]] = c | {"created_at": NOW}
        return state["courses"][c["id"]]

    async def update_course(conn, user_id, course_id, fields):
        if course_id not in state["courses"]:
            return None
        state["courses"][course_id] |= fields
        return state["courses"][course_id]

    async def today(conn, user_id):
        return TODAY

    async def no_shares(conn, user_id):
        return {}

    async def no_joined(conn, user_id):
        return []

    async def stop(conn, owner, course_id):
        return False

    async def delete_course(conn, user_id, course_id, delete_documents, tz):
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

    async def is_course_member(conn, user_id, course_id):
        return course_id in state.get("joined", set())

    async def create_document(conn, user_id, filename, course_id, image_count=None):
        doc_id = uuid.uuid4()
        ext = None if image_count else "." + filename.rsplit(".", 1)[-1].lower()
        d = doc_row(
            id=doc_id,
            title=filename if image_count else filename.rsplit(".", 1)[0],
            original_filename=filename,
            course_id=course_id,
            image_count=image_count,
            upload_path=uploads.new_path(user_id, doc_id, ext),
        )
        state["docs"][d["id"]] = d
        return d

    async def upload_url_issued(conn, document_id):
        state["docs"][document_id]["upload_url_issued_at"] = datetime.now(UTC)

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
        (courses, "update_course", update_course),
        (courses, "today", today),
        (courses, "shared_course_ids", no_shares),
        (courses, "joined_courses", no_joined),
        (sharing, "stop", stop),
        (courses, "delete_course", delete_course),
        (usage, "take", take),
        (usage, "used_today", used_today),
        (documents, "course_belongs_to", course_belongs_to),
        (documents, "is_course_member", is_course_member),
        (documents, "create_document", create_document),
        (documents, "get_document", get_document),
        (documents, "mark_uploaded", mark_uploaded),
        (documents, "upload_url_issued", upload_url_issued),
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


def test_exam_date_must_be_today_or_later_and_accents_rotate(client, fake):
    """FR-CRS-04/05."""
    past = client.post(
        "/v1/courses", headers=auth(), json={"code": "CSC 201", "exam_date": "2026-10-26"}
    )
    assert past.status_code == 422
    assert past.json()["detail"] == "Pick today or a later date for the exam."
    a = client.post(
        "/v1/courses", headers=auth(), json={"code": "CSC 201", "exam_date": "2026-10-27"}
    ).json()
    b = client.post("/v1/courses", headers=auth(), json={"code": "CSC 202", "accent": "palm"})
    assert (a["exam_date"], a["accent"]) == ("2026-10-27", "lagoon")
    assert (b.json()["exam_date"], b.json()["accent"]) == (None, "palm")
    ink = client.post("/v1/courses", headers=auth(), json={"code": "CSC 203", "accent": "ink"})
    assert ink.status_code == 422  # ink isn't a course accent

    r = client.patch(
        f"/v1/courses/{a['id']}", headers=auth(), json={"exam_date": None, "accent": "ankara"}
    )
    assert (r.json()["exam_date"], r.json()["accent"]) == (None, "ankara")
    r = client.patch(f"/v1/courses/{a['id']}", headers=auth(), json={"exam_date": "2026-01-01"})
    assert r.status_code == 422


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
    assert len(body["upload_urls"]) == 1
    assert body["upload_urls"][0].startswith("https://storage.test/upload/uploads/")
    assert body["document"]["status"] == "awaiting_upload"

    doc_id = body["document"]["id"]
    assert body["upload_urls"][0].endswith(f"/{doc_id}/1.pdf?token=t")  # server-named path
    fake["storage"].put(f"uploads/{USER}/{doc_id}/1.pdf")
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
        "question_sets": {"used": 0, "limit": 15, "remaining": 15},
        "markings": {"used": 0, "limit": 20, "remaining": 20},
        "chat_messages": {"used": 0, "limit": 40, "remaining": 40},
    }


def test_failed_documents_carry_a_readable_message(client, fake):
    d = doc_row(status="failed", failure_reason="encrypted")
    fake["docs"][d["id"]] = d
    body = client.get(f"/v1/documents/{d['id']}", headers=auth()).json()
    assert body["failure_reason"] == "encrypted"
    assert body["failure_message"].startswith("We couldn't read this file")


async def test_deleting_gives_back_only_todays_never_processed_uploads(monkeypatch):
    returned = []

    async def give_back(conn, user_id, resource, n, tz):
        returned.append((resource, n, tz))

    monkeypatch.setattr(usage, "give_back", give_back)
    # refundable = uploaded today and processing never started (FR-SEC-05)
    deleted = [{"refundable": True}, {"refundable": False}, {"refundable": True}]
    await documents.refund_uploads(None, USER, deleted, "Africa/Lagos")
    assert returned == [("upload", 2, "Africa/Lagos")]


def test_photo_sets_get_one_url_per_page_in_order(client, fake):
    r = client.post(
        "/v1/documents",
        headers=auth(),
        json={"filename": "Thermodynamics notes", "size_bytes": 900_000, "image_count": 3},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["document"]["title"] == "Thermodynamics notes"
    urls = body["upload_urls"]
    assert [u.split("/")[-1].split("?")[0] for u in urls] == [
        "001.jpg",
        "002.jpg",
        "003.jpg",
    ]
    assert fake["uploads_used"] == 1  # one document, however many photos


def test_photo_sets_are_limited_to_30_and_25_mb(client, fake):
    def post(**body):
        return client.post("/v1/documents", headers=auth(), json={"filename": "Notes", **body})

    assert post(size_bytes=1000, image_count=31).status_code == 422
    assert post(size_bytes=1000, image_count=0).status_code == 422
    assert post(size_bytes=26 * 1024 * 1024, image_count=5).status_code == 422
    assert fake["uploads_used"] == 0


# --- FR-SEC-02 / FR-SEC-17: what arrives in Storage is checked before processing -----------------


def register(client, **body):
    r = client.post("/v1/documents", headers=auth(), json={"size_bytes": 1000} | body)
    assert r.status_code == 201
    return r.json()["document"]["id"]


def finish(client, doc_id):
    return client.post(f"/v1/documents/{doc_id}/uploaded", headers=auth())


def test_paths_never_contain_the_clients_filename(client, fake):
    r = client.post(
        "/v1/documents",
        headers=auth(),
        json={"filename": "../../other-user/evil name.pdf", "size_bytes": 10},
    )
    doc = fake["docs"][uuid.UUID(r.json()["document"]["id"])]
    assert doc["upload_path"] == f"uploads/{USER}/{doc['id']}/1.pdf"


def test_a_missing_or_disguised_upload_is_refused_and_can_be_retried(client, fake):
    doc_id = register(client, filename="notes.pdf")
    path = f"uploads/{USER}/{doc_id}/1.pdf"
    r = finish(client, doc_id)
    assert r.status_code == 422 and r.json()["detail"].startswith("The upload didn't finish.")
    fake["storage"].put(path, bytes.fromhex("4d5a9000") + b" not a pdf")  # an .exe renamed to .pdf
    r = finish(client, doc_id)
    assert r.status_code == 422 and "isn't a readable PDF" in r.json()["detail"]
    assert fake["storage"].removed == [path]  # cleared so the student can upload again
    assert fake["jobs"] == []
    fake["storage"].put(path)
    assert finish(client, doc_id).status_code == 200


def test_an_upload_after_the_10_minutes_is_refused(client, fake):
    from datetime import timedelta

    doc_id = register(client, filename="slides.pptx")
    fake["storage"].put(
        f"uploads/{USER}/{doc_id}/1.pptx",
        bytes.fromhex("504b0304") + b" zip",
        datetime.now(UTC) + timedelta(minutes=11),
    )
    r = finish(client, doc_id)
    assert r.status_code == 422 and r.json()["detail"].startswith("The upload took too long.")


def test_every_photo_of_a_set_must_be_an_image(client, fake):
    doc_id = register(client, filename="Board notes", image_count=2)
    folder = f"uploads/{USER}/{doc_id}/"
    fake["storage"].put(folder + "001.jpg", bytes.fromhex("ffd8ffe0") + b" jpeg")
    assert finish(client, doc_id).status_code == 422  # second photo missing
    fake["storage"].put(folder + "002.jpg", bytes.fromhex("89504e470d0a1a0a") + b" png")
    assert finish(client, doc_id).status_code == 200


def test_a_row_pointing_outside_the_users_folder_gets_no_upload_url(client, fake):
    doc_id = register(client, filename="notes.pdf")
    fake["docs"][uuid.UUID(doc_id)]["upload_path"] = f"uploads/{uuid.uuid4()}/x/1.pdf"
    fake["docs"][uuid.UUID(doc_id)]["status"] = "failed"
    assert client.post(f"/v1/documents/{doc_id}/upload-url", headers=auth()).status_code == 409
    assert finish(client, doc_id).status_code == 409


def test_a_joined_course_is_read_only(client, fake):
    """FR-DOC-12: no uploads into a course shared with you, and its documents can't be changed."""
    joined = uuid.uuid4()
    fake["joined"] = {joined}
    r = client.post(
        "/v1/documents",
        headers=auth(),
        json={"filename": "a.pdf", "size_bytes": 10, "course_id": str(joined)},
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "This course was shared with you, so its notes can't be changed."
    doc = doc_row(read_only=True, status="ready")
    fake["docs"][doc["id"]] = doc
    assert (
        client.patch(f"/v1/documents/{doc['id']}", headers=auth(), json={"title": "x"}).status_code
        == 403
    )
    assert client.delete(f"/v1/documents/{doc['id']}", headers=auth()).status_code == 403
    assert client.get(f"/v1/documents/{doc['id']}", headers=auth()).json()["read_only"] is True
