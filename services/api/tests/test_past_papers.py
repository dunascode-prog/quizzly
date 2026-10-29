"""Past-question mode (FR-QGEN-09): a past paper's style, never its questions."""

import json
import uuid

from app.domain import styles
from app.rag import style
from tests.test_questions import DOC, URL, auth, fake  # noqa: F401  (fake is a fixture)

COURSE = uuid.uuid4()


def test_only_the_format_survives_validation():
    raw = json.dumps(
        {
            "types": {"theory": 7, "short_answer": 3, "essay": 5},
            "marks": {"theory": 10, "short_answer": 3, "mcq": 2},
            "phrasing": [
                "Explain",
                "Distinguish between",
                "Explain",
                # a real question, not a way of starting one: dropped
                "Explain the role of the stack pointer in a recursive call",
            ],
            "instructions": "Answer any four questions.",
            "difficulty": "hard",
        }
    )
    found = style.validate(raw)
    assert found == {
        "types": {"theory": 0.7, "short_answer": 0.3},
        "marks": {"theory": 10, "short_answer": 3},
        "phrasing": ["Explain", "Distinguish between"],
        "instructions": "Answer any four questions.",
        "difficulty": "hard",
    }
    assert style.validate('{"types": {"essay": 1}}') is None
    assert style.validate("not json") is None


def test_guidance_describes_format_and_points_back_to_the_notes():
    found = style.validate(
        json.dumps(
            {
                "types": {"theory": 0.95, "mcq": 0.05},
                "marks": {"theory": 10},
                "phrasing": ["Discuss"],
            }
        )
    )
    text = style.guidance(found, "2023")
    assert "the 2023 past paper" in text and "must still come from the notes" in text
    assert "theory (essay) (about 95%)" in text and '"Discuss…"' in text
    assert style.question_types(found) == ["theory"]  # 5% of mcq isn't worth a type


def test_a_past_paper_needs_one_of_the_students_courses():
    from app.api.documents import DocumentCreate

    body = DocumentCreate(
        filename="csc225-2023.pdf", size_bytes=10, kind="past_paper", paper_year="2023"
    )
    assert body.kind == "past_paper"
    for bad in ("23", "2023a", "last year"):
        try:
            DocumentCreate(filename="p.pdf", size_bytes=10, kind="past_paper", paper_year=bad)
        except ValueError:
            continue
        raise AssertionError(f"{bad!r} accepted")


def test_a_style_is_used_only_by_its_owner_when_ready(client, fake, monkeypatch):  # noqa: F811
    """FR-SEC: someone else's style, or one for another course, is a 404; a style still being
    learnt is refused; a ready one makes its own cached set."""
    mine, pending = uuid.uuid4(), uuid.uuid4()
    rows = {
        mine: {"id": mine, "course_id": COURSE, "status": "ready", "style": {}, "year": "2023"},
        pending: {
            "id": pending,
            "course_id": COURSE,
            "status": "generating",
            "style": None,
            "year": None,
        },
    }

    async def get_style(conn, user_id, style_id):
        return rows.get(style_id)  # the real query also filters on user_id

    monkeypatch.setattr(styles, "get_style", get_style)
    fake["doc_course"] = COURSE
    body = {"types": ["theory"], "count": 5}
    assert (
        client.post(URL, headers=auth(), json=body | {"style_id": str(uuid.uuid4())}).status_code
        == 404
    )
    r = client.post(URL, headers=auth(), json=body | {"style_id": str(pending)})
    assert r.status_code == 409
    assert (
        r.json()["detail"] == "We're still learning that past paper's style. Try again in a minute."
    )
    assert client.post(URL, headers=auth(), json=body | {"style_id": str(mine)}).status_code == 201
    assert client.post(URL, headers=auth(), json=body).status_code == 201
    assert len(fake["sets"]) == 2  # the styled set and the plain one are cached apart
    rows[mine]["course_id"] = uuid.uuid4()  # a style from another course
    assert client.post(URL, headers=auth(), json=body | {"style_id": str(mine)}).status_code == 404


def test_paper_styles_are_listed_for_their_owner_only(client, monkeypatch):
    seen = []

    async def list_styles(conn, user_id, course_id):
        seen.append((user_id, course_id))
        return [
            {
                "id": uuid.uuid4(),
                "document_id": DOC,
                "course_id": course_id,
                "title": "CSC 225 2023",
                "year": "2023",
                "status": "ready",
                "style": {"types": {"theory": 0.6, "short_answer": 0.4}, "marks": {"theory": 10}},
            }
        ]

    monkeypatch.setattr(styles, "list_styles", list_styles)
    r = client.get(f"/v1/courses/{COURSE}/paper-styles", headers=auth())
    assert r.status_code == 200
    (only,) = r.json()
    assert only["question_types"] == ["short_answer", "theory"] and only["year"] == "2023"
    assert "phrasing" not in only and "style" not in only
    assert len(seen) == 1 and seen[0][1] == COURSE


def test_a_paper_style_allows_its_own_theory_marks():
    from app.rag import questions as q
    from tests.test_questions import TOPICS

    found = style.validate(json.dumps({"types": {"theory": 1}, "marks": {"theory": 15}}))
    assert style.max_theory_marks(found) == 15
    assert "about 15 marks; this replaces the 4 to 10 marks rule" in style.guidance(found, None)
    item = {
        "topic": "t1",
        "type": "theory",
        "stem": "Explain how a stack works and where it is used.",
        "marks": 15,
        "rubric": [
            {"criterion": "A stack is a linear data structure", "marks": 5},
            {"criterion": "Items are added and removed at the top", "marks": 5},
            {"criterion": "It follows Last In, First Out", "marks": 5},
        ],
        "answer": "A stack is a linear data structure where items are added and removed at the top, "
        "so it follows Last In, First Out.",
        "explanation": "From the notes on stacks.",
        "pages": [3],
    }
    assert q.validate(item, TOPICS, ["theory"], "mixed") is None  # 15 marks is too many normally
    assert q.validate(item, TOPICS, ["theory"], "mixed", max_theory_marks=15) is not None
