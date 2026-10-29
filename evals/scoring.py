"""Scores for the evaluation set (NFR-11). Pure functions, so the unit tests can check them
without calling a model."""

import re
from dataclasses import dataclass, field


def _norm(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def keyword_recall(keywords: list[str | list[str]], texts: list[str]) -> float:
    """Share of the expected keywords found in at least one of the texts (case and punctuation
    don't matter). A keyword may be a list of alternative wordings ("LIFO", "last in first out").
    1.0 when nothing is expected."""
    if not keywords:
        return 1.0
    haystack = " " + " ".join(_norm(t) for t in texts) + " "

    def found(k: str | list[str]) -> bool:
        return any(f" {_norm(w)} " in haystack for w in ([k] if isinstance(k, str) else k))

    return sum(1 for k in keywords if found(k)) / len(keywords)


def in_range(n: int, low: int, high: int) -> bool:
    return low <= n <= high


def leaked(banned: list[str], texts: list[str]) -> list[str]:
    """Banned phrases (e.g. a past paper's exact wording) that appear in the output."""
    joined = " ".join(_norm(t) for t in texts)
    return [b for b in banned if _norm(b) and _norm(b) in joined]


@dataclass
class CaseResult:
    name: str
    topic_count: int = 0
    outline_ok: bool = False
    outline_recall: float = 0.0
    questions_asked: int = 0
    questions_valid: int = 0
    question_coverage: float = 0.0
    flashcards_asked: int = 0
    flashcards_valid: int = 0
    leaks: list[str] = field(default_factory=list)
    error: str | None = None

    @property
    def question_valid_rate(self) -> float:
        return self.questions_valid / self.questions_asked if self.questions_asked else 0.0

    @property
    def flashcard_valid_rate(self) -> float:
        return self.flashcards_valid / self.flashcards_asked if self.flashcards_asked else 0.0


def summarise(results: list[CaseResult]) -> dict[str, float]:
    ran = [r for r in results if r.error is None]
    if not ran:
        return {"cases": 0, "errors": len(results)}

    def mean(values: list[float]) -> float:
        return round(sum(values) / len(values), 3)

    return {
        "cases": len(ran),
        "errors": len(results) - len(ran),
        "outline_in_range": mean([1.0 if r.outline_ok else 0.0 for r in ran]),
        "outline_recall": mean([r.outline_recall for r in ran]),
        "question_valid_rate": mean([r.question_valid_rate for r in ran]),
        "question_coverage": mean([r.question_coverage for r in ran]),
        "flashcard_valid_rate": mean([r.flashcard_valid_rate for r in ran]),
        "leaks": sum(len(r.leaks) for r in ran),
    }


def failures(summary: dict[str, float], thresholds: dict[str, float]) -> list[str]:
    """Each metric below its threshold (or `leaks` / `errors` above it), as a sentence."""
    out = []
    for key, limit in thresholds.items():
        value = summary.get(key)
        if value is None:
            continue
        if key in ("leaks", "errors"):
            if value > limit:
                out.append(f"{key} = {value}, allowed at most {limit}")
        elif value < limit:
            out.append(f"{key} = {value}, needs at least {limit}")
    return out
