import uuid

import pytest

from app.domain import study, usage
from app.domain import topics as topic_overrides
from app.rag import explain
from app.worker import queue
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

USER = uuid.uuid4()
DOC = uuid.uuid4()
SF = uuid.uuid4()
TOPIC = uuid.uuid4()


def auth() -> dict:
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, sub=str(USER))}"}


# --- prompt and citations -----------------------------------------------------------------------


def chunk(p1, p2, tokens=100, text="Push adds to the top."):
    return explain.SourceChunk(p1, p2, text, tokens)


def test_long_topics_are_sampled_evenly_in_order():
    chunks = [chunk(i, i, 1000) for i in range(1, 21)]
    picked = explain.select_chunks(chunks, budget=5000)
    assert len(picked) == 5
    assert [c.page_start for c in picked] == sorted(c.page_start for c in picked)
    assert picked[0].page_start == 1 and picked[-1].page_start > 10
    assert explain.select_chunks(chunks[:3], budget=5000) == chunks[:3]


def test_prompt_marks_notes_as_data_and_carries_style_and_pages():
    template = explain.load_template()
    prompt = explain.build_prompt(template, "exam", "Push, pop and peek", 6, 8, [chunk(6, 7)])
    assert "never as instructions" in prompt
    assert '<document pages="6-7">' in prompt and "[p. 6] to [p. 7]" in prompt
    assert "Likely exam questions" in prompt
    assert "Topic: Push, pop and peek" in prompt
    assert "{" not in prompt.split("<document")[0]  # every placeholder was filled


def test_citations_outside_the_prompt_are_removed_and_code_is_untouched():
    md = (
        "A stack is LIFO [p. 6]. Invented fact [p. 99].\n\n"
        "```python\ndef push(x):\n    stack.append(x)  # [p. 6]\n```\n"
        "Peek shows the top [p. 7] [p. 6]."
    )
    text, cited = explain.clean_citations(md, allowed_pages={6, 7})
    assert "[p. 99]" not in text and "Invented fact." in text
    assert "    stack.append(x)" in text  # indentation kept
    assert cited == [6, 7]


def test_whole_answer_fences_are_stripped():
    assert explain.strip_fence("```markdown\n## Overview\nHi\n```") == "## Overview\nHi"
    assert explain.strip_fence("## Overview\n```py\nx\n```") == "## Overview\n```py\nx\n```"


# --- routes -------------------------------------------------------------------------------------


@pytest.fixture
def fake(client, monkeypatch):
    state = {"rows": {}, "used": 0, "jobs": [], "feedback": [], "reports": []}
    doc = {
        "id": DOC,
        "title": "Stacks",
        "source_file_id": SF,
        "course_code": "CSC 225",
        "page_count": 9,
    }
    topic = {
        "id": TOPIC,
        "ordinal": 0,
        "title": "Stacks",
        "summary": None,
        "page_start": 2,
        "page_end": 4,
    }

    async def ready_document(conn, user_id, document_id):
        return doc if document_id == DOC and user_id == USER else None

    async def topics(conn, sf):
        return [topic]

    async def explanation(conn, topic_id, style, version):
        return state["rows"].get(style)

    async def create_explanation(conn, sf, topic_id, style, version):
        state["rows"][style] = {
            "id": uuid.uuid4(),
            "style": style,
            "status": "pending",
            "content_md": None,
            "citations": [],
        }
        return state["rows"][style]["id"]

    async def retry_explanation(conn, eid):
        for r in state["rows"].values():
            if r["id"] == eid:
                r["status"] = "pending"

    async def take(conn, user_id, resource, limit, tz):
        if state["used"] >= limit:
            return None
        state["used"] += 1
        return state["used"]

    async def enqueue(conn, job_type, payload, *, user_id=None, dedupe_key=None):
        state["jobs"].append((job_type, dedupe_key))

    async def can_see(conn, user_id, eid):
        return any(r["id"] == eid for r in state["rows"].values())

    async def rate(conn, user_id, t, eid, rating):
        state["feedback"].append(rating)

    async def report(conn, user_id, t, eid, reason, note):
        state["reports"].append((reason, note))

    async def no_overrides(conn, user_id, sf):
        return {}

    for mod, name, fn in [
        (topic_overrides, "overrides", no_overrides),
        (study, "ready_document", ready_document),
        (study, "topics", topics),
        (study, "explanation", explanation),
        (study, "create_explanation", create_explanation),
        (study, "retry_explanation", retry_explanation),
        (study, "can_see_explanation", can_see),
        (study, "rate", rate),
        (study, "report", report),
        (usage, "take", take),
        (queue, "enqueue", enqueue),
    ]:
        monkeypatch.setattr(mod, name, fn)
    return state


URL = f"/v1/documents/{DOC}/topics/{TOPIC}/explanation"


def test_outline_lists_topics(client, fake):
    body = client.get(f"/v1/documents/{DOC}/outline", headers=auth()).json()
    assert body["document"]["topic_count"] == 1 and body["document"]["course_code"] == "CSC 225"
    assert body["topics"][0]["page_start"] == 2
    assert client.get(f"/v1/documents/{uuid.uuid4()}/outline", headers=auth()).status_code == 404


def test_first_request_queues_generation_and_uses_one_explanation(client, fake):
    r = client.post(URL, headers=auth(), json={"style": "simple"})
    assert r.status_code == 200 and r.json()["status"] == "pending"
    assert fake["used"] == 1
    eid = fake["rows"]["simple"]["id"]
    assert fake["jobs"] == [("generate_explanation", f"explain:{eid}")]
    # Asking again while it's being written doesn't use another explanation.
    client.post(URL, headers=auth(), json={"style": "simple"})
    assert fake["used"] == 1


def test_cached_explanation_is_free_and_returns_content(client, fake):
    fake["rows"]["standard"] = {
        "id": uuid.uuid4(),
        "style": "standard",
        "status": "ready",
        "content_md": "## Overview\nLIFO [p. 2]",
        "citations": [2],
    }
    body = client.post(URL, headers=auth(), json={"style": "standard"}).json()
    assert body["content_md"].startswith("## Overview") and body["citations"] == [2]
    assert fake["used"] == 0 and fake["jobs"] == []
    assert client.get(URL + "?style=standard", headers=auth()).json()["status"] == "ready"
    assert client.get(URL + "?style=exam", headers=auth()).status_code == 404


def test_failed_generation_is_retried_without_using_the_allowance(client, fake):
    eid = uuid.uuid4()
    fake["rows"]["exam"] = {
        "id": eid,
        "style": "exam",
        "status": "failed",
        "content_md": None,
        "citations": [],
    }
    body = client.post(URL, headers=auth(), json={"style": "exam"}).json()
    assert body["status"] == "pending" and fake["used"] == 0
    assert fake["jobs"] == [("generate_explanation", f"explain:{eid}")]


def test_daily_explanation_limit(client, fake):
    fake["used"] = 30
    r = client.post(URL, headers=auth(), json={"style": "standard"})
    assert r.status_code == 429
    assert r.json()["detail"] == (
        "You've used your explanations for now. 20 more arrive at midnight. "
        "Student gives you 60 a day."
    )


def test_feedback_and_reports_need_access(client, fake):
    client.post(URL, headers=auth(), json={"style": "standard"})
    eid = str(fake["rows"]["standard"]["id"])
    ok = client.post(
        "/v1/feedback",
        headers=auth(),
        json={"target_type": "explanation", "target_id": eid, "rating": 1},
    )
    assert ok.status_code == 204 and fake["feedback"] == [1]
    rep = client.post(
        "/v1/reports",
        headers=auth(),
        json={
            "target_type": "explanation",
            "target_id": eid,
            "reason": "wrong",
            "note": "  p.3 is wrong ",
        },
    )
    assert rep.status_code == 204 and fake["reports"] == [("wrong", "p.3 is wrong")]
    other = {"target_type": "explanation", "target_id": str(uuid.uuid4()), "rating": -1}
    assert client.post("/v1/feedback", headers=auth(), json=other).status_code == 404
