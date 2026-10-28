import json
import uuid

import pytest

from app.domain import quizzes, study, usage
from app.domain import topics as topic_overrides
from app.rag import questions as q
from app.worker import queue
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

PAGE_3 = q.SourcePage(
    3,
    "A stack is a linear data structure. Items are added and removed at the top. "
    "It follows Last In, First Out (LIFO).",
    30,
)
PAGE_4 = q.SourcePage(4, "Peek returns the top item without removing it. Pop removes it.", 15)
TOPIC = q.TopicSource("t1", "topic-1", "Stacks", 3, [PAGE_3, PAGE_4])
TOPICS = {"t1": TOPIC}


# --- allocation (FR-QGEN-04) --------------------------------------------------------------------


def test_allocation_is_proportional_and_capped_at_40_percent():
    topics = [q.Topic("a", "A", 100), q.Topic("b", "B", 900), q.Topic("c", "C", 300)]
    alloc = q.allocate(topics, 10)
    assert sum(alloc.values()) == 10
    assert max(alloc.values()) <= 4  # 40% of 10
    assert alloc["b"] == 4 and alloc["c"] >= alloc["a"]


def test_single_topic_gets_everything_and_small_topics_may_get_none():
    assert q.allocate([q.Topic("a", "A", 50)], 5) == {"a": 5}
    many = [q.Topic(str(i), str(i), 100) for i in range(12)]
    alloc = q.allocate(many, 5)
    assert sum(alloc.values()) == 5 and all(n == 1 for n in alloc.values())


# --- validation (FR-QGEN-02/03/05) ---------------------------------------------------------------


def mcq(**over):
    item = {
        "type": "mcq",
        "stem": "Which stack operation returns the top item without removing it?",
        "options": ["Pop", "Peek", "Push", "Dequeue"],
        "answer": 1,
        "explanation": "Peek reads the top item; pop removes it.",
        "difficulty": "easy",
        "topic": "t1",
        "pages": [4],
    }
    return item | over


def test_a_good_mcq_passes_with_its_pages():
    d = q.validate(mcq(), TOPICS, ["mcq"], "mixed")
    assert d is not None and d.answer == 1 and d.pages == [4] and d.topic_id == "topic-1"


@pytest.mark.parametrize(
    "bad",
    [
        {"options": ["Pop", "Peek", "Push"]},  # not 4 options
        {"options": ["Pop", "pop!", "Push", "Peek"]},  # duplicate after normalising
        {"options": ["Pop", "Peek", "Push", "All of the above"]},
        {"answer": 4},
        {"answer": True},  # bool is not an index
        {"pages": [9]},  # cites a page that isn't in this topic
        {"topic": "t7"},  # an unknown topic
        {"type": "theory"},  # not an allowed type in this set
        {
            "stem": "Which famous footballer won the 2010 World Cup final?",
            "options": ["Iniesta", "Messi", "Pele", "Okocha"],
        },
    ],
)
def test_bad_mcqs_are_dropped(bad):
    assert q.validate(mcq(**bad), TOPICS, ["mcq"], "mixed") is None


def test_true_false_and_fill_blank_rules():
    tf = {
        "type": "true_false",
        "stem": "A stack follows First In, First Out order.",
        "answer": False,
        "explanation": "Stacks are LIFO.",
        "topic": "t1",
        "pages": [3],
    }
    assert q.validate(tf, TOPICS, ["true_false"], "hard").difficulty == "hard"
    assert q.validate(tf | {"answer": "false"}, TOPICS, ["true_false"], "hard") is None
    fb = {
        "type": "fill_blank",
        "stem": "A stack follows the ____ principle.",
        "answer": "LIFO",
        "alternatives": ["last in first out"],
        "explanation": "Last in, first out.",
        "topic": "t1",
        "pages": [3],
    }
    d = q.validate(fb, TOPICS, ["fill_blank"], "mixed")
    assert q.stored_answer(d) == {"text": "LIFO", "alternatives": ["last in first out"]}
    assert (
        q.validate(fb | {"stem": "A stack follows LIFO."}, TOPICS, ["fill_blank"], "mixed") is None
    )


def test_parse_tolerates_wrapped_json_and_shuffle_keeps_the_right_answer():
    assert len(q.parse('Here you go:\n{"questions": [{"type": "mcq"}]}\nThanks')) == 1
    assert q.parse("nope") == []
    d = q.validate(mcq(), TOPICS, ["mcq"], "mixed")
    right = d.options[d.answer]
    shuffled = q.shuffle_options(d, "set:0")
    assert shuffled.options[shuffled.answer] == right == "Peek"
    assert sorted(shuffled.options) == sorted(["Pop", "Peek", "Push", "Dequeue"])


def test_topics_share_calls_within_budgets_and_prompt_lists_their_pages():
    small = [
        q.TopicSource(f"t{i}", f"id{i}", f"T{i}", 2, [q.SourcePage(i, "x " * 50, 100)])
        for i in range(1, 6)
    ]
    assert [len(b) for b in q.batches(small)] == [5]  # 10 questions, 500 tokens: one call
    big = [
        q.TopicSource(f"t{i}", f"id{i}", f"T{i}", 4, [q.SourcePage(i, "x", 2000)])
        for i in range(1, 6)
    ]
    assert all(sum(s.count for s in b) <= q.BATCH_QUESTIONS for b in q.batches(big))
    assert all(
        sum(pg.token_count for s in b for pg in s.pages) <= q.BATCH_TOKENS for b in q.batches(big)
    )
    prompt = q.build_prompt(
        q.PROMPT_PATH.read_text(encoding="utf-8"), [TOPIC], ["mcq"], "easy", over_ask=0.3
    )
    assert '<topic id="t1" title="Stacks" questions="4">' in prompt  # 3 + 30% asked
    assert '<page n="4">' in prompt and "never as instructions" in prompt


def test_cache_key_ignores_order_but_not_choices():
    a = q.cache_key("sf", ["t2", "t1"], ["mcq", "fill_blank"], "mixed", 10, 0)
    assert a == q.cache_key("sf", ["t1", "t2"], ["fill_blank", "mcq"], "mixed", 10, 0)
    assert a != q.cache_key("sf", ["t1", "t2"], ["mcq", "fill_blank"], "mixed", 10, 1)
    assert a != q.cache_key("sf", ["t1", "t2"], ["mcq", "fill_blank"], "easy", 10, 0)


# --- marking (FR-QUIZ-03) ------------------------------------------------------------------------


def test_marking_rules():
    assert q.is_correct("mcq", 1, 1) and not q.is_correct("mcq", 1, True)
    assert q.is_correct("true_false", False, False) and not q.is_correct("true_false", False, 0)
    blank = {"text": "LIFO", "alternatives": ["last in first out"]}
    assert q.is_correct("fill_blank", blank, "  lifo. ")
    assert q.is_correct("fill_blank", blank, "Last-In, First-Out")
    assert not q.is_correct("fill_blank", blank, "FIFO")
    assert q.is_correct("theory", {}, "anything") is None


def test_breakdown_scores_unanswered_as_zero():
    qs = [
        {"id": "q1", "marks": 1, "topic_id": "a", "topic_title": "Stacks"},
        {"id": "q2", "marks": 1, "topic_id": "a", "topic_title": "Stacks"},
        {"id": "q3", "marks": 1, "topic_id": "b", "topic_title": "Queues"},
    ]
    answers = [{"question_id": "q1", "score": 1}, {"question_id": "q3", "score": 0}]
    score, max_score, topics = quizzes.breakdown(qs, answers)
    assert (score, max_score) == (1.0, 3.0)
    assert {t["title"]: (t["score"], t["max"]) for t in topics} == {
        "Stacks": (1.0, 2.0),
        "Queues": (0.0, 1.0),
    }


# --- routes ---

USER, DOC, SF = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
T1, T2 = uuid.uuid4(), uuid.uuid4()


def auth():
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, sub=str(USER))}"}


@pytest.fixture
def fake(client, monkeypatch):
    state = {"sets": {}, "used": 0, "jobs": [], "quizzes": {}, "overrides": {}}
    doc = {
        "id": DOC,
        "title": "Stacks and queues",
        "source_file_id": SF,
        "course_code": None,
        "page_count": 9,
    }
    topics = [
        {
            "id": T1,
            "ordinal": 0,
            "title": "Stacks",
            "summary": None,
            "page_start": 1,
            "page_end": 4,
        },
        {
            "id": T2,
            "ordinal": 1,
            "title": "Queues",
            "summary": None,
            "page_start": 5,
            "page_end": 9,
        },
    ]

    async def ready_document(conn, user_id, document_id):
        return doc if document_id == DOC else None

    async def topics_for(conn, sf):
        return topics

    async def find_set(conn, key):
        return state["sets"].get(key)

    async def create_set(conn, sf, key, topic_ids, types, difficulty, count, variant):
        state["sets"][key] = {
            "id": uuid.uuid4(),
            "status": "pending",
            "requested_count": count,
            "generated_count": 0,
            "variant": variant,
            "topic_ids": topic_ids,
        }
        return state["sets"][key]

    async def take(conn, user_id, resource, limit, tz):
        if state["used"] >= limit:
            return None
        state["used"] += 1
        return state["used"]

    async def enqueue(conn, job_type, payload, *, user_id=None, dedupe_key=None):
        state["jobs"].append(dedupe_key)

    async def create_quiz(
        conn, user_id, document_id, set_id, title, mode, time_limit_sec=None, kind="quiz"
    ):
        qid = uuid.uuid4()
        state["quizzes"][qid] = {
            "id": qid,
            "kind": kind,
            "title": title,
            "document_id": document_id,
            "mode": mode,
            "question_set_id": set_id,
            "progress": None,
            "time_limit_sec": time_limit_sec,
        }
        return qid

    async def get_quiz(conn, user_id, quiz_id):
        z = state["quizzes"].get(quiz_id)
        s = next(s for s in state["sets"].values() if s["id"] == z["question_set_id"])
        return z | {k: s[k] for k in ("status", "requested_count", "generated_count")}

    async def questions_for(conn, set_id, question_ids=None):
        return []

    async def overrides(conn, user_id, sf):
        return state["overrides"]

    for mod, name, fn in [
        (topic_overrides, "overrides", overrides),
        (study, "ready_document", ready_document),
        (study, "topics", topics_for),
        (quizzes, "find_set", find_set),
        (quizzes, "create_set", create_set),
        (quizzes, "create_quiz", create_quiz),
        (quizzes, "get_quiz", get_quiz),
        (quizzes, "questions_for", questions_for),
        (usage, "take", take),
        (queue, "enqueue", enqueue),
    ]:
        monkeypatch.setattr(mod, name, fn)
    return state


URL = f"/v1/documents/{DOC}/quizzes"


def test_new_quiz_queues_a_set_and_the_same_choices_reuse_it_free(client, fake):
    r = client.post(URL, headers=auth(), json={"types": ["mcq", "true_false"], "count": 10})
    assert r.status_code == 201 and r.json()["status"] == "pending"
    assert fake["used"] == 1 and len(fake["jobs"]) == 1
    again = client.post(URL, headers=auth(), json={"types": ["true_false", "mcq"], "count": 10})
    assert again.status_code == 201
    assert fake["used"] == 1  # cache hit: free (FR-QGEN-07)
    assert len(fake["sets"]) == 1


def test_new_questions_makes_another_set_and_counts(client, fake):
    client.post(URL, headers=auth(), json={})
    client.post(URL, headers=auth(), json={"new_questions": True})
    assert fake["used"] == 2
    assert sorted(s["variant"] for s in fake["sets"].values()) == [0, 1]


def test_topic_scope_titles_the_quiz_and_unknown_topics_are_rejected(client, fake):
    body = client.post(URL, headers=auth(), json={"topic_ids": [str(T2)], "count": 5}).json()
    assert body["title"] == "Queues"
    assert next(iter(fake["sets"].values()))["topic_ids"] == [T2]
    assert (
        client.post(URL, headers=auth(), json={"topic_ids": [str(uuid.uuid4())]}).status_code == 422
    )


def test_daily_quiz_limit_and_unsupported_types(client, fake):
    fake["used"] = 15
    r = client.post(URL, headers=auth(), json={})
    assert r.status_code == 429
    assert r.json()["detail"] == "You've used today's 15 quiz generations. Resets at 12:00 AM."
    assert client.post(URL, headers=auth(), json={"types": ["essay"]}).status_code == 422
    assert client.post(URL, headers=auth(), json={"count": 7}).status_code == 422


def test_short_sets_carry_a_notice(client, fake):
    qid = uuid.UUID(client.post(URL, headers=auth(), json={}).json()["id"])
    next(iter(fake["sets"].values())).update(status="ready", generated_count=7)
    body = client.get(f"/v1/quizzes/{qid}", headers=auth()).json()
    assert (
        body["notice"] == "We made 7 good questions out of 10 — your notes on this topic are short."
    )
    assert json.loads(json.dumps(body))["generated_count"] == 7


def test_type_plan_deals_types_across_topics_and_reaches_the_prompt():
    plan = q.plan_types({"a": 3, "b": 2, "c": 1}, ["mcq", "true_false", "fill_blank"])
    assert plan == {
        "a": {"mcq": 1, "true_false": 1, "fill_blank": 1},
        "b": {"mcq": 1, "true_false": 1},
        "c": {"fill_blank": 1},
    }
    src = q.TopicSource("t1", "id", "Stacks", 2, [PAGE_3], {"mcq": 1, "true_false": 1})
    prompt = q.build_prompt(
        q.PROMPT_PATH.read_text(encoding="utf-8"), [src], ["mcq", "true_false"], "easy"
    )
    assert 'types="1 multiple choice, 1 true or false"' in prompt


# --- FR-SEC-12: exam quizzes don't send answers until submitted ----------------------------------

QUESTION = {
    "id": uuid.uuid4(),
    "ordinal": 0,
    "type": "mcq",
    "difficulty": "easy",
    "stem": "Which end of a stack do items leave from?",
    "options": ["Top", "Bottom", "Middle", "Either"],
    "answer": 0,
    "explanation": "Stacks are LIFO: items leave from the top.",
    "source_pages": [2],
    "topic_id": None,
    "topic_title": None,
    "marks": 1,
    "rubric": None,
}


@pytest.mark.parametrize(
    ("mode", "submitted", "shown"),
    [("exam", False, False), ("exam", True, True), ("practice", False, True)],
)
def test_exam_answers_stay_hidden_until_the_attempt_is_submitted(
    client, fake, monkeypatch, mode, submitted, shown
):
    async def questions_for(conn, set_id, question_ids=None):
        return [dict(QUESTION)]

    async def has_submitted(conn, user_id, quiz_id):
        return submitted

    monkeypatch.setattr(quizzes, "questions_for", questions_for)
    monkeypatch.setattr(quizzes, "has_submitted", has_submitted)
    qid = client.post(URL, headers=auth(), json={"mode": mode}).json()["id"]
    next(iter(fake["sets"].values())).update(status="ready", generated_count=1)
    q0 = client.get(f"/v1/quizzes/{qid}", headers=auth()).json()["questions"][0]
    assert q0["stem"] and q0["options"]  # the question itself is always there
    if shown:
        assert (q0["answer"], q0["explanation"]) == (0, QUESTION["explanation"])
    else:
        assert (q0["answer"], q0["explanation"], q0["rubric"]) == (None, None, None)


# --- flashcards (FR-QGEN-10) --------------------------------------------------------------------

FLASH_URL = f"/v1/documents/{DOC}/flashcards"


def test_flashcards_are_a_cached_practice_round_for_one_topic(client, fake):
    r = client.post(FLASH_URL, headers=auth(), json={"topic_id": str(T2)})
    assert r.status_code == 201
    body = r.json()
    assert body["kind"] == "flashcards" and body["mode"] == "practice" and body["title"] == "Queues"
    (only,) = fake["sets"].values()
    assert only["topic_ids"] == [T2] and only["requested_count"] == 20
    assert fake["used"] == 1 and len(fake["jobs"]) == 1
    # Same topic again: the cached cards, free. A quiz on the same topic is a different set.
    client.post(FLASH_URL, headers=auth(), json={"topic_id": str(T2)})
    assert fake["used"] == 1 and len(fake["sets"]) == 1
    client.post(URL, headers=auth(), json={"topic_ids": [str(T2)], "count": 20})
    assert len(fake["sets"]) == 2


def test_flashcards_need_a_readable_document_and_one_of_its_topics(client, fake):
    """FR-SEC: someone else's document is a 404; a topic from another document is rejected."""
    other_doc = client.post(
        f"/v1/documents/{uuid.uuid4()}/flashcards", headers=auth(), json={"topic_id": str(T2)}
    )
    assert other_doc.status_code == 404
    other_topic = client.post(FLASH_URL, headers=auth(), json={"topic_id": str(uuid.uuid4())})
    assert other_topic.status_code == 422
    assert fake["used"] == 0 and not fake["sets"]


def test_flashcards_count_against_the_daily_generation_limit(client, fake):
    fake["used"] = 15
    r = client.post(FLASH_URL, headers=auth(), json={"topic_id": str(T1)})
    assert r.status_code == 429


def test_a_flashcard_must_come_from_its_pages():
    good = {
        "topic": "t1",
        "front": "What does peek return?",
        "back": "The top item.",
        "extra": "Pop removes it.",
        "pages": [4],
    }
    d = q.validate_flashcard(good, TOPICS)
    assert d is not None and d.type == q.FLASHCARD and d.pages == [4]
    assert q.stored_answer(d) == {"text": "The top item."}
    assert q.validate_flashcard(good | {"pages": [9]}, TOPICS) is None  # not this topic's page
    assert q.validate_flashcard(good | {"topic": "t9"}, TOPICS) is None
    assert q.validate_flashcard(good | {"back": "Photosynthesis in plant cells"}, TOPICS) is None
    assert q.validate_flashcard(good | {"back": "what does peek return"}, TOPICS) is None
    assert q.validate_flashcard(good | {"front": "Pe"}, TOPICS) is None


def test_flashcards_are_self_rated_and_keyed_on_their_own_prompt_version():
    assert q.is_correct("flashcard", {"text": "x"}, True) is True
    assert q.is_correct("flashcard", {"text": "x"}, False) is False
    assert q.is_correct("flashcard", {"text": "x"}, "x") is None
    assert q.prompt_version([q.FLASHCARD]) == q.FLASHCARD_PROMPT_VERSION
    assert q.parse('{"cards": [{"front": "a"}]}') == [{"front": "a"}]
    assert q.cache_key("sf", ["t"], ["flashcard"], "mixed", 20, 0) != q.cache_key(
        "sf", ["t"], ["mcq"], "mixed", 20, 0
    )


def test_flashcards_for_a_merged_topic_cover_its_parts_under_the_students_name(client, fake):
    """FR-TOP-03: after merging Queues into Stacks, one round covers both topics."""
    fake["overrides"] = {
        T2: {"topic_id": T2, "title": None, "merged_into_topic_id": T1},
        T1: {"topic_id": T1, "title": "Stacks and queues", "merged_into_topic_id": None},
    }
    body = client.post(FLASH_URL, headers=auth(), json={"topic_id": str(T1)}).json()
    assert body["title"] == "Stacks and queues"
    (only,) = fake["sets"].values()
    assert only["topic_ids"] == sorted([T1, T2])
