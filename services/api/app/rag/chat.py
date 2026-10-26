"""Chat with notes: prompt, streaming clean-up and grounding (FR-CHAT-02/03/05)."""

import re

from app.core.config import SERVICE_ROOT
from app.rag.explain import clean_citations
from app.rag.text import escape_tags

PROMPT_VERSION = 1
PROMPT_PATH = SERVICE_ROOT / "prompts" / "chat" / f"v{PROMPT_VERSION}.md"
HISTORY_MESSAGES = 12  # the last 6 turns (FR-CHAT-05)
HISTORY_CHARS = 1500  # per message, so a long answer can't crowd out the excerpts
OUTSIDE_MARKER = "NOT IN YOUR NOTES:"
NOT_IN_NOTES = "Your notes don't say."

_OUTSIDE = re.compile(r"\s*NOT IN YOUR NOTES:\s*", re.I)


def build_messages(
    template: str, document_title: str, chunks: list[dict], history: list[dict], question: str
) -> list[dict]:
    def tag(c: dict) -> str:
        start, end = c["page_start"], c["page_end"]
        return f"[p. {start}]" if start == end else f"[p. {start}] to [p. {end}]"

    documents = "\n\n".join(
        f"<document>\n{tag(c)}\n{escape_tags(c['content'])}\n</document>" for c in chunks
    )
    system = template.format(document_title=escape_tags(document_title), documents=documents)
    turns = [
        {"role": m["role"], "content": m["content"][:HISTORY_CHARS]}
        for m in history[-HISTORY_MESSAGES:]
    ]
    return [{"role": "system", "content": system}, *turns, {"role": "user", "content": question}]


def allowed_pages(chunks: list[dict]) -> set[int]:
    return {n for c in chunks for n in range(c["page_start"], c["page_end"] + 1)}


def finish(raw: str, chunks: list[dict]) -> dict:
    """The stored reply: citations limited to pages that were in the prompt, outside knowledge
    only after the marker, and `grounded` false when the notes didn't answer it."""
    text = raw.strip()
    parts = _OUTSIDE.split(text, maxsplit=1)
    answer, outside = parts[0], parts[1] if len(parts) > 1 else ""
    answer, pages = clean_citations(answer, allowed_pages(chunks))
    outside, _ = clean_citations(outside, set())  # no citations outside the notes
    refused = answer.lower().startswith(NOT_IN_NOTES.lower().rstrip("."))
    content = answer if not outside else f"{answer}\n\n{OUTSIDE_MARKER} {outside.strip()}"
    return {
        "content": content.strip() or NOT_IN_NOTES,
        "pages": pages,
        "grounded": bool(pages) and not refused,
    }


_CITATION = re.compile(r"[ \t]?\[p\.\s*(\d{1,4})\]")
# What the end of the text so far could be the start of: "[", "[p", "[p.", "[p. 1"...
_PARTIAL_CITATION = re.compile(r"[ \t]?\[(p\.?\s*\d{0,4})?")


class CitationStream:
    """Cleans a chat reply as it streams (FR-SEC-14): a citation or the "NOT IN YOUR NOTES:"
    marker is held back until it's complete, citations of pages that weren't in the prompt are
    dropped, and so is any citation after the marker, matching how `finish` cleans the stored
    reply. So the student never sees a half-written or wrong marker."""

    def __init__(self, allowed: set[int]):
        self.allowed = allowed
        self.pending = ""
        self.outside = False  # past the marker: no citations at all

    def feed(self, text: str) -> str:
        self.pending += text
        return self._release(final=False)

    def flush(self) -> str:
        return self._release(final=True)

    def _held(self, buf: str) -> int:
        """How many characters at the end might still grow into a citation or the marker."""
        hold = 0
        i = buf.rfind("[")
        if i != -1:
            # The space before a citation goes with it (`finish` drops it with the citation).
            start = i - 1 if i > 0 and buf[i - 1] in " \t" else i
            if _PARTIAL_CITATION.fullmatch(buf[start:]):
                hold = len(buf) - start
        marker = OUTSIDE_MARKER.lower()
        for k in range(min(len(marker) - 1, len(buf)), 0, -1):
            if marker.startswith(buf[-k:].lower()):
                hold = max(hold, k)
                break
        return hold

    def _release(self, final: bool) -> str:
        buf = self.pending
        cut = len(buf) if final else len(buf) - self._held(buf)
        out, self.pending = buf[:cut], buf[cut:]
        m = None if self.outside else _OUTSIDE.search(out)
        if m is None:
            return self._clean(out)
        before = self._clean(out[: m.start()])
        self.outside = True  # everything after the marker is outside the notes
        return before + out[m.start() : m.end()] + self._clean(out[m.end() :])

    def _clean(self, text: str) -> str:
        def keep(m: re.Match) -> str:
            return "" if self.outside or int(m.group(1)) not in self.allowed else m.group(0)

        return _CITATION.sub(keep, text)


class ThinkFilter:
    """Drops a leading <think>…</think> block that some reasoning models put in the stream."""

    def __init__(self) -> None:
        self.buffer = ""
        self.state = "start"  # start → thinking → open

    def feed(self, text: str) -> str:
        if self.state == "open":
            return text
        self.buffer += text
        if self.state == "start":
            stripped = self.buffer.lstrip()
            if not stripped:
                return ""
            if stripped.startswith("<think>"):
                self.state = "thinking"
            elif "<think>".startswith(stripped):
                return ""  # could still become <think>
            else:
                self.state = "open"
                out, self.buffer = self.buffer, ""
                return out
        if self.state == "thinking" and "</think>" in self.buffer:
            out = self.buffer.split("</think>", 1)[1].lstrip()
            self.state, self.buffer = "open", ""
            return out
        return ""
