"""Cleaning and chunking (ARCHITECTURE §5.1): ~400-token chunks, 60 overlap, page refs kept."""

import math
import re
from collections import Counter
from dataclasses import dataclass, replace
from statistics import median

from app.rag.extract import Page

# Tokens per whitespace word for English lecture text; close enough for budgeting.
TOKENS_PER_WORD = 1.33
CHUNK_WORDS = 300  # ≈ 400 tokens
OVERLAP_WORDS = 45  # ≈ 60 tokens

_PAGE_NUMBER = re.compile(r"^\s*(page\s*)?\d{1,4}(\s*(of|/)\s*\d{1,4})?\s*$", re.I)


@dataclass
class Chunk:
    ordinal: int
    page_start: int
    page_end: int
    content: str
    token_count: int


def token_estimate(text: str) -> int:
    return math.ceil(len(text.split()) * TOKENS_PER_WORD)


def _normalise(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ").replace("\xad", "")
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # re-join words hyphenated across lines
    text = re.sub(r"[ \t\f\v]+", " ", text)
    return text


def _line_key(line: str) -> str:
    # Exact text, so numbered slide titles ("Example 1", "Example 2") are never seen as one
    # repeated header. Bare page numbers are caught separately by _PAGE_NUMBER.
    return " ".join(line.lower().split())


def clean_pages(pages: list[Page]) -> list[Page]:
    """Drops repeated headers/footers and page numbers; tidies whitespace."""
    split = [[ln.strip() for ln in _normalise(p.text).split("\n")] for p in pages]
    repeated: set[str] = set()
    if len(pages) >= 5:
        counts = Counter(k for lines in split for k in {_line_key(ln) for ln in lines if ln})
        repeated = {k for k, n in counts.items() if n >= 0.6 * len(pages) and len(k) < 80}
    out = []
    for page, lines in zip(pages, split, strict=True):
        kept = [
            ln
            for ln in lines
            if ln and _line_key(ln) not in repeated and not _PAGE_NUMBER.match(ln)
        ]
        out.append(replace(page, text="\n".join(kept)))
    return out


def guess_headings(pages: list[Page]) -> list[Page]:
    """For slide-like PDFs, treat a short first line as the page's heading."""
    if any(p.heading for p in pages):
        return pages  # PPTX already has real slide titles
    lengths = [len(p.text) for p in pages if p.text]
    if not lengths or median(lengths) > 1500:
        return pages  # dense prose: first lines are sentences, not headings
    out = []
    for p in pages:
        first = next((ln for ln in p.text.split("\n") if ln.strip()), "")
        looks_like_heading = (
            3 <= len(first) <= 80
            and not first.rstrip().endswith((".", ",", ";", ":"))
            and re.search(r"[A-Za-z]{3}", first)
        )
        out.append(replace(p, heading=first.strip() if looks_like_heading else None))
    return out


def chunk_pages(
    pages: list[Page], size: int = CHUNK_WORDS, overlap: int = OVERLAP_WORDS
) -> list[Chunk]:
    """Sliding window over the words of the whole document, tracking which pages each covers."""
    words: list[tuple[str, int]] = [(w, p.number) for p in pages for w in p.text.split() if w]
    chunks: list[Chunk] = []
    step = max(size - overlap, 1)
    for start in range(0, len(words), step):
        window = words[start : start + size]
        if not window:
            break
        # A short tail is folded into the previous chunk instead of standing alone.
        if chunks and len(window) < overlap * 2 and start + size >= len(words):
            prev = chunks[-1]
            tail = words[start + overlap :]
            if tail:
                content = prev.content + " " + " ".join(w for w, _ in tail)
                chunks[-1] = replace(
                    prev,
                    content=content,
                    page_end=tail[-1][1],
                    token_count=token_estimate(content),
                )
            break
        content = " ".join(w for w, _ in window)
        chunks.append(
            Chunk(
                ordinal=len(chunks),
                page_start=window[0][1],
                page_end=window[-1][1],
                content=content,
                token_count=token_estimate(content),
            )
        )
        if start + size >= len(words):
            break
    return chunks


# The tags our prompts use to fence off untrusted text (prompts/*). Text from notes or students
# that contains one could otherwise close the fence and speak as the prompt (FR-SEC-13).
_DELIMITERS = re.compile(
    r"<(\s*/?\s*)(document|topic|page|notes|model_answer|student_answer|think)\b", re.I
)


def escape_tags(text: str) -> str:
    """Neutralises our delimiter tags inside untrusted text: `</document>` becomes `‹/document>`,
    which reads the same but isn't a tag. Other angle brackets (a < b, HTML in notes) stay."""
    return _DELIMITERS.sub(lambda m: "‹" + m.group(1) + m.group(2), text)


def escape_attr(text: str) -> str:
    """For untrusted text placed inside a tag attribute, e.g. a topic title."""
    return escape_tags(text).replace('"', "'")
