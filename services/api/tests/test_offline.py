"""Save a course for offline (FR-OFF-03): the manifest route. The SQL runs in the live check."""

import uuid

from app.domain import offline
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

USER = uuid.uuid4()
COURSE = uuid.uuid4()
DOC = uuid.uuid4()


def auth() -> dict:
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, sub=str(USER))}"}


def test_the_manifest_lists_sizes_and_never_files(client, monkeypatch):
    """FR-SEC: only the student's own course or one shared with them; the manifest carries ids,
    titles and sizes, never storage paths or URLs (FR-SHARE-02)."""
    calls = []

    async def manifest(conn, user_id, course_id):
        calls.append((user_id, course_id))
        if course_id != COURSE:
            return None
        quiz = uuid.uuid4()
        return {
            "course_id": COURSE,
            "documents": [{"id": DOC, "title": "Stacks", "bytes": 900, "storage_path": "x"}],
            "explanations": [
                {"document_id": DOC, "topic_id": uuid.uuid4(), "style": "standard", "bytes": 4000}
            ],
            "quizzes": [{"id": quiz, "document_id": DOC, "questions": 10, "bytes": 3000}],
            "bytes": 7900,
        }

    monkeypatch.setattr(offline, "manifest", manifest)
    r = client.get(f"/v1/courses/{COURSE}/offline", headers=auth())
    assert r.status_code == 200
    body = r.json()
    assert body["bytes"] == 7900 and len(body["explanations"]) == 1
    assert "storage_path" not in body["documents"][0]
    assert "storage" not in r.text and "url" not in r.text
    other = uuid.uuid4()
    assert client.get(f"/v1/courses/{other}/offline", headers=auth()).status_code == 404
    assert calls == [(USER, COURSE), (USER, other)]
    assert client.get(f"/v1/courses/{COURSE}/offline").status_code == 401
