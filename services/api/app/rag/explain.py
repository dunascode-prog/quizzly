"""Explanation prompts and citation checks (FR-EXPL-01..03, ARCHITECTURE §5.5)."""

import re
from dataclasses import dataclass
from pathlib import Path

from app.core.config import SERVICE_ROOT

PROMPT_VERSION = 1
PROMPT_PATH = SERVICE_ROOT / "prompts" / "explanation" / f"v{PROMPT_VERSION}.md"
CONTEXT_TOKENS = 6000  # notes sent per explanation; long topics are sampled evenly

STYLES = {
    "standard": "Standard. Clear and complete, for a student meeting this topic in class.",
    "simple": (
        "Simple. Explain it as if to someone completely new to the subject: everyday words, "
        "an analogy early on, one idea per sentence. Keep every section, but make them short."
    ),
    "exam": (
        "Exam-focused. Lead with precise definitions a lecturer would accept. In 'Common "
        "mistakes' include the errors that lose marks. Add a final section '## Likely exam "
        "questions' with three questions and, for each, one line on how to structure the answer."
    ),
}

# The optional leading space goes too when a bad citation is removed.
_CITATION = re.compile(r"[ \t]?\[p\.\s*(\d{1,4})\]")


@dataclass
class SourceChunk:
    page_start: int
    page_end: int
    content: str
    token_count: int


def select_chunks(chunks: list[SourceChunk], budget: int = CONTEXT_TOKENS) -> list[SourceChunk]:
    """All of the topic if it fits, otherwise an even spread across it (keeps document order)."""
    total = sum(c.token_count for c in chunks)
    if total <= budget:
        return chunks
    keep = max(1, int(len(chunks) * budget / total))
    step = len(chunks) / keep
    return [chunks[int(i * step)] for i in range(keep)]


def build_prompt(
    template: str, style: str, title: str, page_start: int, page_end: int, chunks: list[SourceChunk]
) -> str:
    documents = "\n\n".join(
        f'<document pages="{c.page_start}-{c.page_end}">\n'
        f"[p. {c.page_start}]{'' if c.page_end == c.page_start else f' to [p. {c.page_end}]'}\n"
        f"{c.content}\n</document>"
        for c in chunks
    )
    return template.format(
        style_instructions=STYLES[style],
        topic_title=title,
        page_start=page_start,
        page_end=page_end,
        documents=documents,
    )


def load_template(path: Path = PROMPT_PATH) -> str:
    return path.read_text(encoding="utf-8")


def clean_citations(markdown: str, allowed_pages: set[int]) -> tuple[str, list[int]]:
    """Drops citations of pages that weren't in the prompt; returns the text and pages cited."""
    cited: list[int] = []

    def keep(m: re.Match) -> str:
        page = int(m.group(1))
        if page not in allowed_pages:
            return ""
        if page not in cited:
            cited.append(page)
        return m.group(0)

    return _CITATION.sub(keep, markdown).strip(), sorted(cited)


def strip_fence(markdown: str) -> str:
    """Some models wrap the whole answer in ```markdown fences."""
    m = re.fullmatch(r"\s*```(?:markdown|md)?\s*\n(.*)\n```\s*", markdown, re.S)
    return m.group(1) if m else markdown
