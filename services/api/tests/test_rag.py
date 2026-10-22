import json

import pytest

from app.llm.gateway import Completion
from app.rag import extract, outline, text
from app.rag.extract import Page
from tests.fixtures import make_pdf, make_pptx

LOREM = (
    "A stack stores items so the last one pushed is the first one popped. "
    "Queues instead serve items in the order they arrived, which suits scheduling. "
)


# --- extraction --------------------------------------------------------------------------------


def test_pdf_text_per_page():
    data = make_pdf([["Stacks", "Push adds to the top."], ["Queues", "Enqueue adds at the back."]])
    assert extract.sniff(data) == extract.PDF_MIME
    assert extract.page_count(data, extract.PDF_MIME) == 2
    pages = extract.extract(data, extract.PDF_MIME)
    assert [p.number for p in pages] == [1, 2]
    assert "Push adds to the top." in pages[0].text
    assert "Enqueue" in pages[1].text


def test_pptx_titles_become_headings_and_tables_are_read():
    data = make_pptx([("Stacks", ["LIFO order", "push and pop"]), ("Table", ["Costs"])])
    assert extract.sniff(data) == extract.PPTX_MIME
    pages = extract.extract(data, extract.PPTX_MIME)
    assert pages[0].heading == "Stacks"
    assert pages[0].text.startswith("Stacks\n") and "push and pop" in pages[0].text
    assert "Push | O(1)" in pages[1].text


@pytest.mark.parametrize(
    ("data", "reason"),
    [
        (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 64, "encrypted"),
        (b"hello, not a document", "corrupt"),
        (b"%PDF-1.4\n garbage", "corrupt"),
        (b"PK\x03\x04 broken zip", "corrupt"),
    ],
)
def test_unreadable_files_fail_with_a_reason(data, reason):
    with pytest.raises(extract.ExtractionError) as exc:
        extract.extract(data, extract.sniff(data))
    assert exc.value.reason == reason


# --- cleaning and headings --------------------------------------------------------------------


def test_clean_drops_repeated_footers_page_numbers_and_rejoins_hyphens():
    pages = [
        Page(i, f"Example {i}\nStep {i} of the algo-\nrithm.\nCSC 225 - University of Lagos\n{i}")
        for i in range(1, 7)
    ]
    cleaned = text.clean_pages(pages)
    assert cleaned[0].text == "Example 1\nStep 1 of the algorithm."
    assert all("University of Lagos" not in p.text for p in cleaned)
    # Numbered slide titles are content, not a repeated header.
    assert [p.text.split("\n")[0] for p in cleaned] == [f"Example {i}" for i in range(1, 7)]


def test_guess_headings_only_for_slide_like_pdfs():
    slides = [Page(1, "Stacks\nLIFO"), Page(2, "Queues\nFIFO"), Page(3, "A sentence ends here.\nx")]
    guessed = text.guess_headings(slides)
    assert [p.heading for p in guessed] == ["Stacks", "Queues", None]
    prose = [Page(1, "Intro\n" + LOREM * 20)]
    assert text.guess_headings(prose)[0].heading is None


# --- chunking --------------------------------------------------------------------------------


def test_chunks_cover_every_word_with_overlap_and_page_refs():
    pages = [Page(i, LOREM * 10) for i in range(1, 6)]  # ~1,250 words
    chunks = text.chunk_pages(pages, size=300, overlap=45)
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))
    assert chunks[0].page_start == 1 and chunks[-1].page_end == 5
    assert all(c.page_start <= c.page_end for c in chunks)
    first, second = chunks[0].content.split(), chunks[1].content.split()
    assert first[-45:] == second[:45]  # overlap
    words = [w for p in pages for w in p.text.split()]
    assert chunks[-1].content.split()[-1] == words[-1]  # nothing dropped at the end
    assert all(c.token_count > 0 for c in chunks)


def test_short_tail_is_folded_into_the_last_chunk():
    pages = [Page(1, " ".join(f"w{i}" for i in range(310)))]
    chunks = text.chunk_pages(pages, size=300, overlap=45)
    assert len(chunks) == 1
    assert chunks[0].content.split()[-1] == "w309"


# --- outline ---------------------------------------------------------------------------------


def test_headings_group_consecutive_pages_and_ignore_continued_slides():
    heads = ["Intro", "Stacks", "Stacks (cont.)", None, "Queues", "Queues 2/2", "Trees"]
    pages = [Page(i + 1, "x", h) for i, h in enumerate(heads)]
    drafts = outline.outline_from_headings(pages)
    assert [(d.title, d.page_start, d.page_end) for d in drafts] == [
        ("Intro", 1, 1),
        ("Stacks", 2, 4),
        ("Queues", 5, 6),
        ("Trees", 7, 7),
    ]
    assert all(d.from_heading for d in drafts)


def test_headings_are_ignored_when_too_few():
    pages = [Page(1, "x", "Stacks"), Page(2, "x", None), Page(3, "x", None), Page(4, "x", "Q")]
    assert outline.outline_from_headings(pages) is None


def test_long_decks_are_merged_to_25_topics():
    pages = [Page(i, "x", f"Slide topic {i}") for i in range(1, 61)]
    drafts = outline.outline_from_headings(pages)
    assert len(drafts) == 25
    assert drafts[0].page_start == 1 and drafts[-1].page_end == 60
    assert all(a.page_end + 1 == b.page_start for a, b in zip(drafts, drafts[1:], strict=False))


def test_llm_outline_is_ordered_clamped_and_starts_at_page_one():
    raw = json.dumps(
        {
            "topics": [
                {"title": "Queues", "summary": "FIFO.", "first_page": 6},
                {"title": "Stacks", "summary": "LIFO.", "first_page": 2},
                {"title": "Dup", "first_page": 6},
                {"title": "Beyond", "first_page": 99},
                {"title": "", "first_page": 3},
                {"title": "Bad page", "first_page": "x"},
            ]
        }
    )
    drafts = outline.parse_llm_outline(raw, last_page=10)
    assert [(d.title, d.page_start, d.page_end) for d in drafts] == [
        ("Stacks", 1, 5),
        ("Queues", 6, 9),
        ("Beyond", 10, 10),
    ]
    assert drafts[0].summary == "LIFO."


def test_llm_outline_is_capped_at_one_topic_per_two_pages():
    raw = json.dumps({"topics": [{"title": f"T{i}", "first_page": i} for i in range(1, 13)]})
    drafts = outline.parse_llm_outline(raw, last_page=12)
    assert len(drafts) == 6
    assert drafts[0].page_start == 1 and drafts[-1].page_end == 12


def test_llm_outline_rejects_unusable_json():
    with pytest.raises(ValueError):
        outline.parse_llm_outline(json.dumps({"topics": "nope"}), 5)


class FakeGateway:
    def __init__(self, reply: str):
        self.reply, self.calls = reply, []

    async def complete(self, task, messages, **kw):
        self.calls.append((task, messages, kw))
        return Completion(self.reply, "fake", "fake-model", 10, 10, 1)


async def test_outline_with_llm_sends_page_tagged_digest_and_falls_back_on_garbage():
    pages = [Page(i, f"Content of page {i}") for i in range(1, 11)]
    good = FakeGateway(json.dumps({"topics": [{"title": "All", "first_page": 1}]}))
    drafts = await outline.outline_with_llm(good, pages)
    task, messages, kw = good.calls[0]
    assert task == "outline" and kw["json_mode"] is True
    assert "[p3] Content of page 3" in messages[1]["content"]
    assert drafts[0].page_end == 10

    fallback = await outline.outline_with_llm(FakeGateway("not json"), pages)
    assert fallback[0].page_start == 1 and fallback[-1].page_end == 10


def test_every_chunk_gets_the_topic_its_first_page_is_in():
    drafts = [
        outline.TopicDraft("A", None, 1, 3, True),
        outline.TopicDraft("B", None, 4, 9, True),
    ]
    chunks = [text.Chunk(0, 1, 2, "x", 1), text.Chunk(1, 3, 4, "x", 1), text.Chunk(2, 5, 9, "x", 1)]
    assert outline.assign_chunks(drafts, chunks) == [0, 0, 1]
