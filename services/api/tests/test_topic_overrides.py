"""Renaming and merging topics for one student (FR-TOP-03, screen 27). Domain writes are faked; the
SQL runs in the live end-to-end check."""

import uuid

import pytest

from app.domain import study
from app.domain import topics as overrides_mod
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

USER = uuid.uuid4()
DOC = uuid.uuid4()
SF = uuid.uuid4()
A, B, C, D = (uuid.uuid4() for _ in range(4))


def topic(tid, n, title, start, end):
    return {
        "id": tid,
        "ordinal": n,
        "title": title,
        "summary": None,
        "page_start": start,
        "page_end": end,
    }


TOPICS = [
    topic(A, 0, "What is a stack?", 1, 5),
    topic(B, 1, "Push, pop and peek", 6, 11),
    topic(C, 2, "Array vs linked list", 12, 17),
    topic(D, 3, "Queues", 18, 25),
]


def auth() -> dict:
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, sub=str(USER))}"}


# --- the outline as one student sees it -----------------------------------------------------------


def test_no_overrides_is_the_original_outline():
    rows = overrides_mod.apply_overrides(TOPICS, {})
    assert [r["title"] for r in rows] == [t["title"] for t in TOPICS]
    assert all(r["parts"] == [r["id"]] and r["original_title"] is None for r in rows)


def test_a_rename_keeps_the_original_name_alongside():
    rows = overrides_mod.apply_overrides(
        TOPICS, {B: {"title": "Stack operations", "merged_into_topic_id": None}}
    )
    assert (
        rows[1]["title"] == "Stack operations" and rows[1]["original_title"] == "Push, pop and peek"
    )


def test_a_merge_joins_pages_and_parts_and_names_both():
    rows = overrides_mod.apply_overrides(TOPICS, {C: {"title": None, "merged_into_topic_id": B}})
    assert len(rows) == 3
    merged = rows[1]
    assert merged["parts"] == [B, C]
    assert merged["part_titles"] == ["Push, pop and peek", "Array vs linked list"]
    assert (merged["page_start"], merged["page_end"]) == (6, 17)
    assert merged["title"] == "Push, pop and peek and Array vs linked list"
    named = overrides_mod.apply_overrides(
        TOPICS,
        {
            C: {"title": None, "merged_into_topic_id": B},
            B: {"title": "Push, pop and arrays", "merged_into_topic_id": None},
        },
    )
    assert named[1]["title"] == "Push, pop and arrays"


def test_merges_chain_and_a_forward_merge_is_ignored():
    chained = overrides_mod.apply_overrides(
        TOPICS,
        {
            C: {"title": None, "merged_into_topic_id": B},
            D: {"title": None, "merged_into_topic_id": B},
        },
    )
    assert chained[1]["parts"] == [B, C, D] and chained[1]["page_end"] == 25
    # B "merged into" C, which comes after it: not something the API makes; B just stays.
    odd = overrides_mod.apply_overrides(TOPICS, {B: {"title": None, "merged_into_topic_id": C}})
    assert [r["id"] for r in odd] == [A, C, D]


# --- the endpoints ---------------------------------------------------------------------------


@pytest.fixture
def fake(monkeypatch):
    state: dict = {"overrides": {}}

    async def ready_document(conn, user_id, document_id):
        if document_id != DOC or user_id != USER:
            return None
        return {
            "id": DOC,
            "title": "Stacks and queues",
            "course_code": "CSC 225",
            "page_count": 25,
            "source_file_id": SF,
            "low_ocr_pages": [],
        }

    async def topics_for(conn, sf):
        return TOPICS

    async def overrides(conn, user_id, sf):
        assert user_id == USER  # only ever this student's own overrides
        return state["overrides"]

    def row(tid):
        return state["overrides"].setdefault(tid, {"title": None, "merged_into_topic_id": None})

    async def rename(conn, user_id, tid, title):
        row(tid)["title"] = title

    async def merge(conn, user_id, keep, absorb, title):
        for r in state["overrides"].values():
            if r["merged_into_topic_id"] == absorb:
                r["merged_into_topic_id"] = keep
        row(absorb)["merged_into_topic_id"] = keep
        if title:
            row(keep)["title"] = title

    async def split(conn, user_id, keep):
        for r in state["overrides"].values():
            if r["merged_into_topic_id"] == keep:
                r["merged_into_topic_id"] = None
        row(keep)["title"] = None

    for mod, name, fn in [
        (study, "ready_document", ready_document),
        (study, "topics", topics_for),
        (overrides_mod, "overrides", overrides),
        (overrides_mod, "rename", rename),
        (overrides_mod, "merge", merge),
        (overrides_mod, "split", split),
    ]:
        monkeypatch.setattr(mod, name, fn)
    return state


URL = f"/v1/documents/{DOC}/topics"


def test_rename_and_reset(client, fake):
    r = client.put(f"{URL}/{B}/name", headers=auth(), json={"title": "  Stack   operations "})
    assert r.status_code == 200
    body = r.json()
    assert body["topics"][1]["title"] == "Stack operations"
    assert body["topics"][1]["original_title"] == "Push, pop and peek"
    reset = client.put(f"{URL}/{B}/name", headers=auth(), json={"title": "   "}).json()
    assert reset["topics"][1]["title"] == "Push, pop and peek"
    assert (
        client.put(f"{URL}/{B}/name", headers=auth(), json={"title": "x" * 61}).status_code == 422
    )


def test_merge_with_next_then_split(client, fake):
    r = client.post(f"{URL}/{B}/merge", headers=auth(), json={"title": "Push, pop and arrays"})
    assert r.status_code == 200
    body = r.json()
    assert body["document"]["topic_count"] == 3
    merged = body["topics"][1]
    assert merged["title"] == "Push, pop and arrays" and merged["parts"] == [str(B), str(C)]
    assert (merged["page_start"], merged["page_end"]) == (6, 17)
    # The merged-away topic is gone from this student's outline: it can't be renamed on its own.
    assert client.put(f"{URL}/{C}/name", headers=auth(), json={"title": "x"}).status_code == 404
    back = client.post(f"{URL}/{B}/split", headers=auth()).json()
    assert [t["title"] for t in back["topics"]] == [t["title"] for t in TOPICS]


def test_the_last_topic_has_nothing_to_merge_with(client, fake):
    r = client.post(f"{URL}/{D}/merge", headers=auth(), json={})
    assert r.status_code == 422 and r.json()["detail"] == "There's no next topic to merge"


def test_someone_elses_document_or_topic_is_not_found(client, fake):
    """FR-SEC: overrides are written only for a document the student can study, and only for its
    own topics."""
    other_doc = f"/v1/documents/{uuid.uuid4()}/topics/{B}/name"
    assert client.put(other_doc, headers=auth(), json={"title": "x"}).status_code == 404
    assert (
        client.put(f"{URL}/{uuid.uuid4()}/name", headers=auth(), json={"title": "x"}).status_code
        == 404
    )
    assert client.post(f"{URL}/{uuid.uuid4()}/merge", headers=auth(), json={}).status_code == 404
    assert fake["overrides"] == {}
    assert client.put(f"{URL}/{B}/name", json={"title": "x"}).status_code == 401
