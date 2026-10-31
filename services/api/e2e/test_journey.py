"""The whole student journey against a running API and worker, with real AI calls on the free
models: upload → outline → explanation → quiz → marking → chat → sharing → invites → plans.

It costs a few cents of free-tier AI and takes a few minutes, so CI runs it on staging, not on
every production deploy. Run it alone with `-m journey`.
"""

from __future__ import annotations

import json

import httpx
import pytest

from e2e.conftest import Student, new_id, upload, wait_for

pytestmark = pytest.mark.journey

PROCESSING_TIMEOUT = 420  # free models on a busy day
AI_TIMEOUT = 300


@pytest.fixture(scope="module")
def owner(make_student) -> Student:
    return make_student(name="Ada Owner")


@pytest.fixture(scope="module")
def course(owner) -> dict:
    r = owner.post("/v1/courses", json={"code": "bio  101", "title": "Cell Biology"})
    assert r.status_code == 201, r.text
    assert r.json()["code"] == "BIO 101"  # upper-case, single spaces (FR-CRS-01)
    return r.json()


@pytest.fixture(scope="module")
def document(owner, course) -> dict:
    doc = upload(owner, course["id"])
    assert doc["status"] in ("uploaded", "processing", "ready")
    return wait_for(
        lambda: owner.get(f"/v1/documents/{doc['id']}").json(),
        lambda d: d["status"] == "ready",
        PROCESSING_TIMEOUT,
        "processing the notes",
    )


@pytest.fixture(scope="module")
def outline(owner, document) -> dict:
    r = owner.get(f"/v1/documents/{document['id']}/outline")
    assert r.status_code == 200, r.text
    return r.json()


def test_upload_is_processed(document):
    assert document["page_count"] == 3
    assert document["topic_count"] >= 1
    assert document["failure_reason"] is None


def test_outline_has_topics_with_pages(outline):
    assert outline["topics"], outline
    for topic in outline["topics"]:
        assert topic["title"]


def test_page_text_is_the_students_own(owner, document):
    r = owner.get(f"/v1/documents/{document['id']}/pages/2")
    assert r.status_code == 200
    page = r.json()
    assert "Osmosis" in page["text"] and page["quote"] is False
    assert owner.get(f"/v1/documents/{document['id']}/pages/99").status_code == 404


def test_explanation_with_citations(owner, document, outline):
    topic = outline["topics"][0]["id"]
    path = f"/v1/documents/{document['id']}/topics/{topic}/explanation"
    r = owner.post(path, json={"style": "standard"})
    assert r.status_code == 200, r.text
    done = wait_for(
        lambda: owner.get(path, params={"style": "standard"}).json(),
        lambda e: e["status"] == "ready",
        AI_TIMEOUT,
        "the explanation",
    )
    assert done["content_md"]
    assert done["citations"], "every AI answer cites pages (FR-EXPL-02)"
    assert all(1 <= p <= 3 for p in done["citations"])
    # Asking again is free: the same explanation comes back (FR-EXPL-04).
    before = owner.get("/v1/usage").json()["explanations"]["used"]
    again = owner.post(path, json={"style": "standard"}).json()
    assert again["id"] == done["id"]
    assert owner.get("/v1/usage").json()["explanations"]["used"] == before


def _quiz(owner: Student, document: dict, **body) -> dict:
    r = owner.post(f"/v1/documents/{document['id']}/quizzes", json={"count": 5, **body})
    assert r.status_code == 201, r.text
    quiz = r.json()
    return wait_for(
        lambda: owner.get(f"/v1/quizzes/{quiz['id']}").json(),
        lambda q: q["status"] == "ready",
        AI_TIMEOUT,
        "the quiz",
    )


@pytest.fixture(scope="module")
def practice_quiz(owner, document) -> dict:
    return _quiz(owner, document, mode="practice", types=["mcq"])


def test_practice_quiz_questions_cite_the_notes(practice_quiz):
    qs = practice_quiz["questions"]
    assert 1 <= len(qs) <= 5
    for q in qs:
        assert q["stem"] and q["options"] and len(q["options"]) >= 2
        assert q["answer"] is not None  # practice: answers come with the questions
        assert q["source_pages"], q


def test_attempt_and_score(owner, practice_quiz):
    attempt_id = new_id()
    r = owner.post(f"/v1/quizzes/{practice_quiz['id']}/attempts", json={"id": attempt_id})
    assert r.status_code in (200, 201), r.text
    # Retrying the same request doesn't start a second attempt.
    again = owner.post(f"/v1/quizzes/{practice_quiz['id']}/attempts", json={"id": attempt_id})
    assert again.json()["id"] == attempt_id
    answers = [
        {"id": new_id(), "question_id": q["id"], "response": q["answer"]}
        for q in practice_quiz["questions"]
    ]
    saved = owner.put(f"/v1/attempts/{attempt_id}/answers", json={"answers": answers[:1]})
    assert saved.status_code == 200, saved.text
    done = owner.post(f"/v1/attempts/{attempt_id}/submit", json={"answers": answers[1:]})
    assert done.status_code == 200, done.text
    result = done.json()
    assert result["status"] == "completed"
    assert result["score"] == result["max_score"] > 0
    # Submitted means closed.
    late = owner.put(f"/v1/attempts/{attempt_id}/answers", json={"answers": answers[:1]})
    assert late.status_code == 409
    assert any(a["id"] == attempt_id for a in owner.get("/v1/practice").json()["attempts"])


def test_exam_mode_hides_answers_until_submitted(owner, document):
    """FR-SEC-12."""
    exam = _quiz(owner, document, mode="exam", types=["mcq"])
    for q in exam["questions"]:
        assert q["answer"] is None and q["explanation"] is None and q["rubric"] is None
    attempt_id = new_id()
    owner.post(f"/v1/quizzes/{exam['id']}/attempts", json={"id": attempt_id, "mode": "exam"})
    owner.post(f"/v1/attempts/{attempt_id}/submit", json={"answers": []})
    after = owner.get(f"/v1/quizzes/{exam['id']}").json()
    assert all(q["answer"] is not None for q in after["questions"])


def test_written_answers_are_marked(owner, document):
    quiz = _quiz(owner, document, mode="practice", types=["short_answer"])
    attempt_id = new_id()
    owner.post(f"/v1/quizzes/{quiz['id']}/attempts", json={"id": attempt_id})
    q = quiz["questions"][0]
    answer = {
        "id": new_id(),
        "question_id": q["id"],
        "response": "Water moves from dilute to "
        "concentrated solution across a selectively permeable membrane.",
    }
    owner.post(f"/v1/attempts/{attempt_id}/submit", json={"answers": [answer]})
    result = wait_for(
        lambda: owner.get(f"/v1/attempts/{attempt_id}").json(),
        lambda a: a["status"] == "completed",
        AI_TIMEOUT,
        "marking",
    )
    assert result["score"] is not None


def _chat(student: Student, document_id: str, text: str) -> dict:
    events: dict[str, list] = {}
    with student.api.stream(
        "POST",
        f"/v1/documents/{document_id}/chat/messages",
        headers=student.headers,
        json={"text": text},
        timeout=httpx.Timeout(AI_TIMEOUT),
    ) as r:
        assert r.status_code == 200, r.read()
        assert r.headers["content-type"].startswith("text/event-stream")
        name = None
        for line in r.iter_lines():
            if line.startswith("event: "):
                name = line[7:]
            elif line.startswith("data: ") and name:
                events.setdefault(name, []).append(json.loads(line[6:]))
    assert "error" not in events, events.get("error")
    return events["done"][0]


def test_chat_answers_from_the_notes_with_citations(owner, document):
    done = _chat(owner, document["id"], "What is osmosis?")
    answer = done["answer"]
    assert answer["content"]
    assert answer["citations"] or answer["grounded"] is False  # cites, or says not in notes
    history = owner.get(f"/v1/documents/{document['id']}/chat").json()
    assert len(history["messages"]) >= 2


def test_chat_says_when_its_not_in_the_notes(owner, document):
    done = _chat(owner, document["id"], "Who won the 2010 FIFA World Cup?")
    assert done["answer"]["grounded"] is False or not done["answer"]["citations"]


# --- sharing (FR-SHARE-01..07) --------------------------------------------------------------------


@pytest.fixture(scope="module")
def member(make_student, owner, course, document) -> tuple[Student, dict]:
    share = owner.post(f"/v1/courses/{course['id']}/share", json={})
    assert share.status_code == 200, share.text
    code = share.json()["code"]
    mate = make_student(name="Bola Mate")
    preview = mate.get(f"/v1/shares/code/{code}")
    assert preview.status_code == 200, preview.text
    assert preview.json()["title"] == "Cell Biology"
    joined = mate.post("/v1/shares/join", json={"code": code})
    assert joined.status_code == 200, joined.text
    return mate, joined.json()


def test_member_sees_the_course_read_only(member, course, document):
    mate, _ = member
    courses = mate.get("/v1/courses").json()
    shared = next(c for c in courses if c["id"] == course["id"])
    assert shared["shared_by"] == "Ada O."  # a display name, never the full name or email
    docs = mate.get("/v1/documents", params={"course_id": course["id"]}).json()
    listed = docs if isinstance(docs, list) else docs.get("documents", [])
    assert any(d["id"] == document["id"] and d["read_only"] for d in listed)
    assert mate.patch(f"/v1/documents/{document['id']}", json={"title": "x"}).status_code == 403
    assert mate.delete(f"/v1/documents/{document['id']}").status_code in (403, 404)
    assert mate.patch(f"/v1/courses/{course['id']}", json={"title": "x"}).status_code in (403, 404)


def test_member_never_gets_storage_urls_or_full_pages(member, document):
    """FR-SHARE-02: a short quote, and no signed URL to the owner's file."""
    mate, _ = member
    page = mate.get(f"/v1/documents/{document['id']}/pages/1").json()
    assert page["quote"] is True and len(page["text"]) <= 610
    image = mate.get(f"/v1/documents/{document['id']}/pages/1/image")
    assert image.status_code == 403
    for path in (f"/v1/documents/{document['id']}", f"/v1/documents/{document['id']}/outline"):
        assert "supabase" not in mate.get(path).text and "/storage/" not in mate.get(path).text


def test_member_cannot_see_the_owners_scores_or_chats(member, owner, document):
    mate, _ = member
    attempts = owner.get("/v1/practice").json()["attempts"]
    for a in attempts:
        assert mate.get(f"/v1/attempts/{a['id']}").status_code == 404
    mine = mate.get(f"/v1/documents/{document['id']}/chat").json()
    assert mine["messages"] == []  # the owner's chat isn't theirs


def test_members_list_shows_display_names_only(member, owner, course):
    r = owner.get(f"/v1/courses/{course['id']}/members")
    assert r.status_code == 200
    text = r.text
    mate, _ = member
    assert mate.email not in text and "@" not in text
    names = [m.get("display_name") for m in r.json()]
    assert "Bola M." in names


def test_member_can_leave(member, course):
    mate, joined = member
    r = mate.post(f"/v1/shares/{joined['member_id']}/leave")
    assert r.status_code == 200
    assert course["id"] not in [c["id"] for c in mate.get("/v1/courses").json()]


# --- invites, plans, home, notifications ----------------------------------------------------------


def test_invite_code_is_credited_only_after_study(make_student, owner):
    invite = owner.get("/v1/me/invite").json()
    assert invite["code"] and invite["link"].endswith(invite["code"])
    friend = make_student(onboard=False)
    r = friend.post("/v1/referrals", json={"code": invite["code"], "channel": "link"})
    assert r.json()["status"] == "pending"  # counts after 3 study days (FR-INV-03)
    assert owner.post("/v1/referrals", json={"code": invite["code"], "channel": "link"}).json()[
        "status"
    ] in ("pending", "ignored")
    assert owner.get("/v1/me/invite").json()["credited"] == 0


def test_plans_and_usage(owner):
    plans = owner.get("/v1/plans").json()
    assert plans["current"] == "free"
    assert [p["id"] for p in plans["plans"]] == ["free", "student", "premium"]
    usage = owner.get("/v1/usage").json()
    assert usage["uploads"]["used"] >= 1 and usage["question_sets"]["used"] >= 2
    # Buying can't be faked: a made-up Play token is refused.
    r = owner.post(
        "/v1/plans/purchase", json={"product_id": "student_monthly", "purchase_token": "fake-token"}
    )
    assert r.status_code in (400, 402, 403, 422, 503)
    assert owner.get("/v1/plans").json()["current"] == "free"


def test_home_and_notifications(owner):
    assert owner.get("/v1/home").status_code == 200
    notes = owner.get("/v1/notifications")
    assert notes.status_code == 200
    assert owner.post("/v1/notifications/read-all").status_code in (200, 204)


def test_deleting_the_document(owner, document):
    assert owner.delete(f"/v1/documents/{document['id']}").status_code in (200, 204)
    assert owner.get(f"/v1/documents/{document['id']}").status_code == 404
