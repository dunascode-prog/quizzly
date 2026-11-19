"""The evaluation set's scoring (NFR-11); the set itself runs in CI on prompt changes."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "evals"))

from scoring import CaseResult, failures, keyword_recall, leaked, summarise  # noqa: E402


def test_keywords_match_whole_words_and_alternatives():
    texts = ["A stack follows Last-In, First-Out.", "push adds to the top"]
    assert keyword_recall([["LIFO", "last in first out"], "push", "pop"], texts) == 2 / 3
    assert keyword_recall(["top"], ["stop"]) == 0  # whole words only
    assert keyword_recall([], texts) == 1.0


def test_leaks_are_reported():
    assert leaked(
        ["Explain the concept of a stack"], ["explain the concept of a stack and two uses"]
    ) == ["Explain the concept of a stack"]
    assert leaked(["copied sentence"], ["original wording"]) == []


def test_summary_and_thresholds():
    good = CaseResult(
        "a",
        topic_count=4,
        outline_ok=True,
        outline_recall=1,
        questions_asked=10,
        questions_valid=8,
        question_coverage=0.8,
        flashcards_asked=10,
        flashcards_valid=9,
    )
    weak = CaseResult(
        "b",
        topic_count=9,
        outline_ok=False,
        outline_recall=0.5,
        questions_asked=10,
        questions_valid=4,
        question_coverage=0.4,
        flashcards_asked=10,
        flashcards_valid=10,
    )
    broken = CaseResult("c", error="TimeoutError")
    s = summarise([good, weak, broken])
    assert s["cases"] == 2 and s["errors"] == 1
    assert s["outline_in_range"] == 0.5 and s["question_valid_rate"] == 0.6
    problems = failures(s, {"outline_in_range": 0.8, "question_valid_rate": 0.6, "errors": 0})
    assert problems == [
        "outline_in_range = 0.5, needs at least 0.8",
        "errors = 1, allowed at most 0",
    ]
