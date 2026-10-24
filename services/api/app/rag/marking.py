"""LLM marking of short and theory answers against the question's rubric (FR-QUIZ-04)."""

import json
import re

from app.core.config import SERVICE_ROOT

PROMPT_VERSION = 2
PROMPT_PATH = SERVICE_ROOT / "prompts" / "marking" / f"v{PROMPT_VERSION}.md"
MAX_ANSWER_CHARS = 4000  # a long essay is still marked; anything beyond this is cut


def build_prompt(template: str, question: dict, notes: str, response: str) -> str:
    criteria = question["rubric"]["criteria"]
    rubric = "\n".join(
        f"{i}. {c['criterion']} ({c['marks']} mark{'s' if c['marks'] != 1 else ''})"
        for i, c in enumerate(criteria)
    )
    return template.format(
        marks=question["marks"],
        question=question["stem"],
        rubric=rubric,
        model_answer=question["answer"].get("model_answer", ""),
        notes=notes,
        student_answer=response[:MAX_ANSWER_CHARS],
    )


def _json(raw: str) -> dict:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.S)
        data = json.loads(m.group(0)) if m else {}
    return data if isinstance(data, dict) else {}


def score(raw: str, question: dict) -> dict:
    """The model's marks, made safe: every criterion present, none above its marks, total summed
    here (never trusted from the model). Raises ValueError if nothing usable came back."""
    criteria = question["rubric"]["criteria"]
    data = _json(raw)
    given = {}
    for item in data.get("criteria") or []:
        if not isinstance(item, dict):
            continue
        try:
            i = int(item.get("index"))
            awarded = float(item.get("awarded"))
        except (TypeError, ValueError):
            continue
        if 0 <= i < len(criteria):
            given[i] = (awarded, str(item.get("feedback") or "").strip()[:300])
    if not given:
        raise ValueError("no criteria marked")
    out = []
    for i, c in enumerate(criteria):
        awarded, feedback = given.get(i, (0.0, ""))
        awarded = round(min(max(awarded, 0.0), float(c["marks"])) * 2) / 2  # halves at most
        out.append(
            {
                "criterion": c["criterion"],
                "awarded": awarded,
                "marks": c["marks"],
                "feedback": feedback,
            }
        )
    total = sum(c["awarded"] for c in out)
    return {
        "criteria": out,
        "score": total,
        "summary": str(data.get("summary") or "").strip()[:300],
        "model_answer": question["answer"].get("model_answer", ""),
    }


def is_correct(total: float, marks: int) -> bool:
    """For per-topic stats a written answer counts as right at half marks or more."""
    return total >= marks / 2
