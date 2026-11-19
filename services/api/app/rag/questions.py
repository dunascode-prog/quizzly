"""Question generation and objective marking (FR-QGEN-01..05, FR-QUIZ-03)."""

import hashlib
import json
import math
import random
import re
import unicodedata
from dataclasses import dataclass, field

from app.core.config import SERVICE_ROOT
from app.rag.text import escape_attr, escape_tags

PROMPT_VERSION = 2  # 2: short answer and theory questions
PROMPT_PATH = SERVICE_ROOT / "prompts" / "questions" / f"v{PROMPT_VERSION}.md"
OBJECTIVE_TYPES = ("mcq", "true_false", "fill_blank")  # marked on the device (FR-QUIZ-03)
OPEN_TYPES = ("short_answer", "theory")  # marked by the LLM against a rubric (FR-QUIZ-04)
ALL_TYPES = OBJECTIVE_TYPES + OPEN_TYPES
FLASHCARD = "flashcard"  # front/back cards, self-rated (FR-QGEN-10); generated on their own
FLASHCARD_PROMPT_VERSION = 1
FLASHCARD_PROMPT_PATH = SERVICE_ROOT / "prompts" / "flashcards" / f"v{FLASHCARD_PROMPT_VERSION}.md"
MAX_TOPIC_SHARE = 0.4  # FR-QGEN-04: no topic gets more than 40% unless it's the only one
TOPIC_TOKENS = 1800  # most of one topic's pages sent per call
BATCH_TOKENS = 5000  # notes per LLM call; several small topics share one call
BATCH_QUESTIONS = 12  # questions per LLM call
MIN_SUPPORT = 0.35  # share of a question's content words that must appear on its cited pages
DUPLICATE_SIMILARITY = 0.92  # FR-QGEN-05

TYPE_NAMES = {
    "mcq": "multiple choice",
    "true_false": "true or false",
    "fill_blank": "fill in the blank",
    "short_answer": "short answer",
    "theory": "theory (essay)",
    "flashcard": "flashcard",
}
_STOPWORDS = set(
    "a an the of to in on for and or but is are was were be been being it its this that these "
    "those with as by at from which what who whom when where why how not no yes true false than "
    "then so such into over under about between do does did can could will would should may "
    "might must has have had their there they them he she his her we you your our i".split()
)


@dataclass
class Topic:
    id: str
    title: str
    token_count: int


@dataclass
class SourcePage:
    number: int
    text: str
    token_count: int


@dataclass
class TopicSource:
    """One topic as shown to the model: its label (t1…), how many questions, and its pages."""

    label: str
    topic_id: str
    title: str
    count: int
    pages: list[SourcePage]
    types: dict[str, int] = field(default_factory=dict)  # how many of each type, if planned


@dataclass
class Draft:
    """A validated question, ready to save."""

    type: str
    stem: str
    answer: object
    explanation: str
    difficulty: str
    options: list[str] | None
    chunk_ids: list[str]
    pages: list[int]
    topic_id: str
    rubric: dict | None = None
    marks: int = 1
    alternatives: list[str] = field(default_factory=list)


def cache_key(
    source_file_id: str,
    topic_ids: list[str],
    types: list[str],
    difficulty: str,
    count: int,
    variant: int,
    style_id: str | None = None,
) -> str:
    """Same file, topics, types, difficulty, count and prompt version → same set (FR-QGEN-07).
    A past-paper style (FR-QGEN-09) makes its own set."""
    parts: list = [
        source_file_id,
        sorted(topic_ids),
        sorted(types),
        difficulty,
        count,
        variant,
        prompt_version(types),
    ]
    if style_id:
        parts.append(style_id)
    raw = json.dumps(parts)
    return hashlib.sha256(raw.encode()).hexdigest()


def prompt_version(types: list[str]) -> int:
    return FLASHCARD_PROMPT_VERSION if list(types) == [FLASHCARD] else PROMPT_VERSION


def allocate(topics: list[Topic], count: int) -> dict[str, int]:
    """Questions per topic in proportion to its length, capped at 40% unless only one topic."""
    if not topics:
        return {}
    if len(topics) == 1:
        return {topics[0].id: count}
    cap = max(1, math.floor(count * MAX_TOPIC_SHARE))
    weights = {t.id: max(t.token_count, 1) for t in topics}
    alloc = dict.fromkeys(weights, 0)
    remaining = count
    open_ids = list(weights)
    # Repeatedly share what's left among topics under the cap (largest remainder method).
    while remaining > 0 and open_ids:
        total = sum(weights[i] for i in open_ids)
        shares = {i: remaining * weights[i] / total for i in open_ids}
        given = {i: min(math.floor(shares[i]), cap - alloc[i]) for i in open_ids}
        for i, n in given.items():
            alloc[i] += n
        remaining -= sum(given.values())
        if remaining > 0:
            by_remainder = sorted(
                open_ids, key=lambda i: shares[i] - math.floor(shares[i]), reverse=True
            )
            for i in by_remainder:
                if remaining == 0:
                    break
                if alloc[i] < cap:
                    alloc[i] += 1
                    remaining -= 1
        open_ids = [i for i in open_ids if alloc[i] < cap]
    return {i: n for i, n in alloc.items() if n > 0}


def plan_types(counts: dict[str, int], types: list[str]) -> dict[str, dict[str, int]]:
    """Deals the chosen types out across all questions in turn, so a mixed quiz really is mixed
    (models otherwise favour one or two types)."""
    plan: dict[str, dict[str, int]] = {}
    turn = 0
    for topic_id, n in counts.items():
        mix: dict[str, int] = {}
        for _ in range(n):
            kind = types[turn % len(types)]
            mix[kind] = mix.get(kind, 0) + 1
            turn += 1
        plan[topic_id] = mix
    return plan


def select_pages(pages: list[SourcePage], budget: int = TOPIC_TOKENS) -> list[SourcePage]:
    """All of a topic's pages if they fit, otherwise an even spread (keeps page order)."""
    total = sum(pg.token_count for pg in pages)
    if total <= budget:
        return pages
    keep = max(1, int(len(pages) * budget / total))
    step = len(pages) / keep
    return [pages[int(i * step)] for i in range(keep)]


def batches(sources: list[TopicSource]) -> list[list[TopicSource]]:
    """Groups topics into as few LLM calls as fit the token and question budgets."""
    out: list[list[TopicSource]] = []
    tokens = questions = 0
    for src in sources:
        size = sum(pg.token_count for pg in src.pages)
        if out and (tokens + size > BATCH_TOKENS or questions + src.count > BATCH_QUESTIONS):
            out.append([])
            tokens = questions = 0
        if not out:
            out.append([])
        out[-1].append(src)
        tokens += size
        questions += src.count
    return out


def build_prompt(
    template: str, batch: list[TopicSource], types: list[str], difficulty: str, over_ask: float = 0
) -> str:
    level = "a mix of easy, medium and hard" if difficulty == "mixed" else difficulty
    blocks = []
    for src in batch:
        want = src.count + (max(1, math.ceil(src.count * over_ask)) if over_ask else 0)
        pages = "\n".join(
            f'<page n="{pg.number}">\n{escape_tags(pg.text)}\n</page>' for pg in src.pages
        )
        title = escape_attr(src.title)
        mix = ", ".join(f"{n} {TYPE_NAMES[t]}" for t, n in src.types.items())
        types_attr = f' types="{mix}"' if mix else ""
        blocks.append(
            f'<topic id="{src.label}" title="{title}" questions="{want}"{types_attr}>\n'
            f"{pages}\n</topic>"
        )
    return template.format(
        difficulty=level,
        types=", ".join(TYPE_NAMES[t] for t in types),
        topics="\n\n".join(blocks),
    )


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in _STOPWORDS and len(w) > 1}


def support(text: str, sources: list[SourcePage]) -> float:
    """Share of the question's content words found on its cited pages (FR-QGEN-05)."""
    words = _words(text)
    if not words:
        return 0.0
    source_words = set().union(*(_words(pg.text) for pg in sources))
    return len(words & source_words) / len(words)


def _marked_content(stem: str, rubric: list[dict]) -> str:
    """For written questions, what's marked (the stem and the rubric points) must come from the
    notes; the model answer is longer prose that paraphrases, so it would fail the word check."""
    return " ".join([stem, *(r["criterion"] for r in rubric)])


def _clean(s: object, limit: int) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()[:limit]


def validate(
    item: dict,
    topics_by_label: dict[str, TopicSource],
    allowed_types: list[str],
    default_difficulty: str,
    max_theory_marks: int = 10,
) -> Draft | None:
    """A Draft if the item passes every check, else None (it's dropped and topped up later).
    A past paper's style may allow bigger theory questions (FR-QGEN-09)."""
    kind = item.get("type")
    if kind not in allowed_types:
        return None
    stem = _clean(item.get("stem"), 500)
    explanation = _clean(item.get("explanation"), 600)
    topic = topics_by_label.get(str(item.get("topic")))
    if topic is None:
        return None
    by_number = {pg.number: pg for pg in topic.pages}
    cited = []
    for raw in item.get("pages") or []:
        try:
            n = int(raw)
        except (TypeError, ValueError):
            continue
        if n in by_number and n not in cited:
            cited.append(n)
    if len(stem) < 8 or not explanation or not cited:
        return None
    sources = [by_number[n] for n in cited]
    difficulty = (
        item.get("difficulty") if item.get("difficulty") in ("easy", "medium", "hard") else None
    )
    difficulty = difficulty or ("medium" if default_difficulty == "mixed" else default_difficulty)
    options = None
    alternatives: list[str] = []
    rubric: list[dict] | None = None
    marks = 1
    if kind == "mcq":
        raw = item.get("options")
        if not isinstance(raw, list) or len(raw) != 4:
            return None
        options = [_clean(o, 200) for o in raw]
        if any(not o for o in options) or len({normalise(o) for o in options}) != 4:
            return None
        if any(re.search(r"\b(all|none) of the above\b", o, re.I) for o in options):
            return None
        answer = item.get("answer")
        if not isinstance(answer, int) or isinstance(answer, bool) or not 0 <= answer <= 3:
            return None
        checked = f"{stem} {options[answer]}"
    elif kind == "true_false":
        answer = item.get("answer")
        if not isinstance(answer, bool):
            return None
        checked = stem
    elif kind == "short_answer":
        answer = _clean(item.get("answer"), 600)
        points = [_clean(k, 160) for k in item.get("key_points") or [] if _clean(k, 160)]
        if len(answer) < 10 or not 2 <= len(points) <= 4:
            return None
        rubric = [{"criterion": k, "marks": 1} for k in points]
        marks = len(points)
        checked = _marked_content(stem, rubric)
    elif kind == "theory":
        answer = _clean(item.get("answer"), 2500)
        try:
            marks = int(item.get("marks"))
            rubric = [
                {"criterion": _clean(r["criterion"], 160), "marks": int(r["marks"])}
                for r in item.get("rubric") or []
            ]
        except (KeyError, TypeError, ValueError):
            return None
        # FR-QGEN-06: the rubric's marks add up to the question's total.
        if not 4 <= marks <= max_theory_marks or not 2 <= len(rubric) <= 5 or len(answer) < 40:
            return None
        if any(not r["criterion"] or r["marks"] < 1 for r in rubric):
            return None
        if sum(r["marks"] for r in rubric) != marks:
            return None
        checked = _marked_content(stem, rubric)
    else:  # fill_blank
        if stem.count("____") != 1:
            return None
        answer = _clean(item.get("answer"), 80)
        if not answer or len(answer.split()) > 6:
            return None
        alternatives = [_clean(a, 80) for a in item.get("alternatives") or [] if _clean(a, 80)][:5]
        checked = stem.replace("____", answer)
    if support(checked, sources) < MIN_SUPPORT:
        return None
    return Draft(
        type=kind,
        stem=stem,
        answer=answer,
        explanation=explanation,
        difficulty=difficulty,
        options=options,
        chunk_ids=[],  # the worker fills these from the pages
        pages=sorted(cited),
        topic_id=topic.topic_id,
        alternatives=alternatives,
        rubric={"criteria": rubric} if rubric else None,
        marks=marks,
    )


def validate_flashcard(item: dict, topics_by_label: dict[str, TopicSource]) -> Draft | None:
    """A flashcard: a short front (a term or question), a short back, an optional one-line
    extra, and the pages it comes from. Both sides must come from those pages."""
    topic = topics_by_label.get(str(item.get("topic")))
    if topic is None:
        return None
    front = _clean(item.get("front"), 200)
    back = _clean(item.get("back"), 300)
    extra = _clean(item.get("extra"), 200)
    by_number = {pg.number: pg for pg in topic.pages}
    cited: list[int] = []
    for raw in item.get("pages") or []:
        try:
            n = int(raw)
        except (TypeError, ValueError):
            continue
        if n in by_number and n not in cited:
            cited.append(n)
    if len(front) < 3 or len(back) < 2 or not cited:
        return None
    if normalise(front) == normalise(back):
        return None
    if support(f"{front} {back}", [by_number[n] for n in cited]) < MIN_SUPPORT:
        return None
    return Draft(
        type=FLASHCARD,
        stem=front,
        answer=back,
        explanation=extra,
        difficulty="medium",
        options=None,
        chunk_ids=[],
        pages=sorted(cited),
        topic_id=topic.topic_id,
    )


def parse(raw: str) -> list[dict]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.S)
        if not m:
            return []
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return []
    items = (data.get("questions") or data.get("cards")) if isinstance(data, dict) else data
    return [i for i in items if isinstance(i, dict)] if isinstance(items, list) else []


def shuffle_options(draft: Draft, seed: str) -> Draft:
    """Models put the right answer first far too often; shuffle reproducibly per question."""
    if draft.type != "mcq" or not draft.options:
        return draft
    order = list(range(4))
    random.Random(seed).shuffle(order)
    draft.options = [draft.options[i] for i in order]
    draft.answer = order.index(draft.answer)
    return draft


def stored_answer(draft: Draft) -> object:
    if draft.type == "fill_blank":
        return {"text": draft.answer, "alternatives": draft.alternatives}
    if draft.type == FLASHCARD:
        return {"text": draft.answer}
    if draft.type in OPEN_TYPES:
        return {"model_answer": draft.answer}
    return draft.answer


# --- Marking (the app marks the same way, instantly and offline) ---


def normalise(text: str) -> str:
    """Case, accents, punctuation and extra spaces don't matter (FR-QUIZ-03)."""
    text = unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9 ]+", " ", text.lower())
    return " ".join(text.split())


def is_correct(qtype: str, answer: object, response: object) -> bool | None:
    """None for types the device can't mark (short answer, theory). A flashcard's response is
    the student's own rating: true for "Knew it", false for "Didn't know"."""
    if qtype == FLASHCARD:
        return response if isinstance(response, bool) else None
    if qtype == "mcq":
        return isinstance(response, int) and not isinstance(response, bool) and response == answer
    if qtype == "true_false":
        return isinstance(response, bool) and response == answer
    if qtype == "fill_blank":
        accepted = (
            [answer["text"], *answer.get("alternatives", [])]
            if isinstance(answer, dict)
            else [answer]
        )
        return isinstance(response, str) and normalise(response) in {normalise(a) for a in accepted}
    return None
