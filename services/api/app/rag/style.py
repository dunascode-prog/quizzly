"""A past paper's style (FR-QGEN-09): what to copy, and how to tell the question writer.

Only the format is kept: the share of each question type, typical marks, how questions start (a
few words each), the paper's general instruction and its overall difficulty. Nothing that could
reproduce a real past question survives validation.
"""

import json
import math
import re

from app.core.config import SERVICE_ROOT
from app.rag.questions import ALL_TYPES, TYPE_NAMES
from app.rag.text import escape_tags, token_estimate

PROMPT_VERSION = 1
PROMPT_PATH = SERVICE_ROOT / "prompts" / "style" / f"v{PROMPT_VERSION}.md"
PAPER_TOKENS = 6000  # the first pages of a long paper are enough to see its format
MAX_PHRASES = 8
PHRASE_WORDS = 5
INSTRUCTION_CHARS = 120


def build_prompt(template: str, pages: list[tuple[int, str]]) -> str:
    blocks, used = [], 0
    for number, text in pages:
        cost = token_estimate(text)
        if blocks and used + cost > PAPER_TOKENS:
            break
        blocks.append(f'<page n="{number}">\n{escape_tags(text)}\n</page>')
        used += cost
    return template.format(pages="\n".join(blocks))


def _clean(s: object, limit: int) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()[:limit]


def validate(raw: str) -> dict | None:
    """The style, or None when the model's answer can't be used."""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.S)
        if not m:
            return None
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return None
    if not isinstance(data, dict):
        return None
    shares: dict[str, float] = {}
    for kind, share in (data.get("types") or {}).items():
        try:
            value = float(share)
        except (TypeError, ValueError):
            continue
        if kind in ALL_TYPES and value > 0 and math.isfinite(value):
            shares[kind] = value
    total = sum(shares.values())
    if not total:
        return None
    types = {k: round(v / total, 2) for k, v in sorted(shares.items(), key=lambda kv: -kv[1])}
    marks: dict[str, int] = {}
    for kind, value in (data.get("marks") or {}).items():
        try:
            n = int(value)
        except (TypeError, ValueError):
            continue
        if kind in types and 1 <= n <= 30:
            marks[kind] = n
    phrasing: list[str] = []
    for p in data.get("phrasing") or []:
        phrase = _clean(p, 60).rstrip(".,:;?")
        if (
            phrase
            and len(phrase.split()) <= PHRASE_WORDS
            and phrase.lower() not in map(str.lower, phrasing)
        ):
            phrasing.append(phrase)
    difficulty = (
        data.get("difficulty") if data.get("difficulty") in ("easy", "medium", "hard") else "mixed"
    )
    return {
        "types": types,
        "marks": marks,
        "phrasing": phrasing[:MAX_PHRASES],
        "instructions": _clean(data.get("instructions"), INSTRUCTION_CHARS),
        "difficulty": difficulty,
    }


def max_theory_marks(style: dict) -> int:
    """Theory questions may carry the paper's own marks (at most 30), not just the usual 10."""
    return max(10, min(30, int(style.get("marks", {}).get("theory", 10))))


def question_types(style: dict) -> list[str]:
    """The types a quiz in this style uses: the ones that make up at least a tenth of the paper."""
    return sorted(k for k, v in style["types"].items() if v >= 0.1) or sorted(style["types"])


def guidance(style: dict, year: str | None) -> str:
    """Added to the question prompt. It describes format only; the content still comes from the
    notes, and no past question is ever shown to the writer."""
    paper = f"the {year} past paper" if year and year != "older" else "a past paper"
    lines = [
        f"Copy the style of {paper} for this course. This describes format only: every question "
        "and answer must still come from the notes above.",
        "- Question types: "
        + ", ".join(f"{TYPE_NAMES[k]} (about {round(v * 100)}%)" for k, v in style["types"].items())
        + ".",
    ]
    if style["marks"]:
        lines.append(
            "- Typical marks: "
            + ", ".join(f"{TYPE_NAMES[k]} {n}" for k, n in style["marks"].items())
            + "."
        )
        if "theory" in style["marks"]:
            lines.append(
                f"- Each theory question carries about {max_theory_marks(style)} marks; this "
                "replaces the 4 to 10 marks rule above. Keep 2 to 5 rubric criteria whose marks "
                "add up to the total."
            )
    if style["phrasing"]:
        lines.append(
            "- Start questions the way this paper does, for example: "
            + ", ".join(f'"{p}…"' for p in style["phrasing"])
            + "."
        )
    if style["difficulty"] != "mixed":
        lines.append(f"- Overall the paper is {style['difficulty']}.")
    return "\n".join(lines)
