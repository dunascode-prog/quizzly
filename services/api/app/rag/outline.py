"""Topic outline (FR-TOP-01/02): the deck's own headings where they exist, otherwise the LLM."""

import json
import logging
import re
from dataclasses import dataclass

from app.llm.gateway import LLMGateway
from app.rag.extract import Page
from app.rag.text import Chunk, escape_tags

log = logging.getLogger("quizzly.outline")

MIN_TOPICS = 3
MAX_TOPICS = 25
DIGEST_CHARS = 14_000  # page excerpts sent to the LLM; fits comfortably in every model's context

SYSTEM_PROMPT = """You organise a student's lecture notes into a study outline.
Return JSON only, in this shape:
{"topics": [{"title": "...", "summary": "...", "first_page": 1}]}
Rules:
- Between 3 and 25 topics; roughly one topic per 3 to 6 pages.
- Topics follow the document order; first_page increases strictly; the first topic starts at page 1.
- Titles are 2 to 7 words and use the notes' own wording.
- Each summary is one plain sentence about what that part of the notes covers.
- Use only the notes. Don't add topics the notes don't contain."""


@dataclass
class TopicDraft:
    title: str
    summary: str | None
    page_start: int
    page_end: int
    from_heading: bool


def _heading_key(title: str) -> str:
    """'Stacks (cont.)', 'Stacks – continued' and 'Stacks 2/3' are the same topic."""
    t = title.lower()
    t = re.sub(r"\((cont(inued)?\.?|\d+\s*/\s*\d+)\)", "", t)
    t = re.sub(r"[-–—:]\s*(cont(inued)?\.?)$", "", t.strip())
    t = re.sub(r"\b\d+\s*/\s*\d+$", "", t.strip())
    return re.sub(r"\W+", " ", t).strip()


def topic_cap(page_count: int) -> int:
    """At most one topic per two pages (models sometimes make one per page), within 3–25."""
    return max(MIN_TOPICS, min(MAX_TOPICS, -(-page_count // 2)))


def _merge_smallest(drafts: list[TopicDraft], cap: int = MAX_TOPICS) -> list[TopicDraft]:
    """Merge adjacent topics until there are at most `cap`, smallest pair first."""
    drafts = list(drafts)
    while len(drafts) > cap:
        sizes = [(drafts[i + 1].page_end - drafts[i].page_start, i) for i in range(len(drafts) - 1)]
        _, i = min(sizes)
        a, b = drafts[i], drafts[i + 1]
        drafts[i : i + 2] = [
            TopicDraft(a.title, a.summary, a.page_start, b.page_end, a.from_heading)
        ]
    return drafts


def outline_from_headings(pages: list[Page]) -> list[TopicDraft] | None:
    """Group consecutive pages under the same heading. None when the deck lacks clear headings."""
    if not pages:
        return None
    with_heading = [p for p in pages if p.heading and _heading_key(p.heading)]
    distinct = {_heading_key(p.heading) for p in with_heading}
    if len(distinct) < MIN_TOPICS or len(with_heading) < 0.6 * len(pages):
        return None
    drafts: list[TopicDraft] = []
    current_key = None
    for p in pages:
        key = _heading_key(p.heading) if p.heading else None
        if key and key != current_key:
            drafts.append(TopicDraft(p.heading, None, p.number, p.number, True))
            current_key = key
        elif drafts:
            drafts[-1].page_end = p.number
    if drafts:
        drafts[0].page_start = pages[0].number  # untitled opening pages join the first topic
    drafts = _merge_smallest(drafts)
    return drafts if len(drafts) >= MIN_TOPICS else None


def _digest(pages: list[Page]) -> str:
    per_page = max(120, min(600, DIGEST_CHARS // max(len(pages), 1)))
    lines = []
    for p in pages:
        text = escape_tags(re.sub(r"\s+", " ", p.text).strip())
        if text:
            lines.append(f"[p{p.number}] {text[:per_page]}")
    return "\n".join(lines)


def parse_llm_outline(raw: str, last_page: int) -> list[TopicDraft]:
    """Turns the model's JSON into ordered, non-overlapping page ranges. Raises ValueError."""
    data = json.loads(raw)
    items = data.get("topics") if isinstance(data, dict) else None
    if not isinstance(items, list):
        raise ValueError("no topics list")
    cleaned: list[tuple[int, str, str | None]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        title = re.sub(r"\s+", " ", str(item.get("title", ""))).strip()[:120]
        try:
            first = int(item.get("first_page"))
        except (TypeError, ValueError):
            continue
        if not title:
            continue
        summary = re.sub(r"\s+", " ", str(item.get("summary") or "")).strip()[:300] or None
        cleaned.append((min(max(first, 1), last_page), title, summary))
    cleaned.sort(key=lambda t: t[0])
    starts: list[tuple[int, str, str | None]] = []
    for first, title, summary in cleaned:
        if not starts or first > starts[-1][0]:
            starts.append((first, title, summary))
    if not starts:
        raise ValueError("no usable topics")
    starts[0] = (1, *starts[0][1:])
    drafts = [
        TopicDraft(
            title,
            summary,
            first,
            (starts[i + 1][0] - 1) if i + 1 < len(starts) else last_page,
            False,
        )
        for i, (first, title, summary) in enumerate(starts)
    ]
    return _merge_smallest(drafts, topic_cap(last_page))


def outline_by_page_groups(pages: list[Page]) -> list[TopicDraft]:
    """Last resort when the LLM's answer is unusable: even groups titled by their first line."""
    size = max(1, -(-len(pages) // min(max(len(pages) // 5, 1), MAX_TOPICS)))
    drafts = []
    for i in range(0, len(pages), size):
        group = pages[i : i + size]
        first_line = next(
            (ln.strip() for p in group for ln in p.text.split("\n") if ln.strip()), ""
        )
        title = first_line[:60] or f"Pages {group[0].number}–{group[-1].number}"
        drafts.append(TopicDraft(title, None, group[0].number, group[-1].number, False))
    return drafts


async def outline_with_llm(gateway: LLMGateway, pages: list[Page]) -> list[TopicDraft]:
    """AllProvidersBusy propagates, so the job is re-queued rather than settling for less."""
    last_page = pages[-1].number
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Notes ({last_page} pages):\n{_digest(pages)}"},
    ]
    completion = await gateway.complete(
        "outline", messages, json_mode=True, temperature=0.2, max_tokens=3000
    )
    try:
        return parse_llm_outline(completion.text, last_page)
    except (ValueError, json.JSONDecodeError) as exc:
        log.warning("unusable outline from %s: %s", completion.model, exc)
        return outline_by_page_groups(pages)


def assign_chunks(drafts: list[TopicDraft], chunks: list[Chunk]) -> list[int]:
    """Index of the topic each chunk belongs to, by the page it starts on (FR-TOP-01)."""
    out = []
    for c in chunks:
        idx = next(
            (i for i, d in enumerate(drafts) if d.page_start <= c.page_start <= d.page_end),
            len(drafts) - 1,
        )
        out.append(idx)
    return out
