"""Explanations always show their pages (FR-EXPL-02), even when a small model leaves them out."""

from app.llm.gateway import Completion
from app.worker import explain as worker

NOTES = "Osmosis is the diffusion of water across a selectively permeable membrane. " * 6
ALLOWED = {2, 3}


def completion(text: str) -> Completion:
    return Completion(text, "groq", "openai/gpt-oss-20b", 10, 10, 5)


class Gateway:
    def __init__(self, *answers: str):
        self.answers = list(answers)
        self.prompts: list[str] = []

    async def complete(self, task, messages, **kw):
        assert task == "explanation"
        self.prompts.append(messages[0]["content"])
        return completion(self.answers.pop(0))


async def test_cited_answers_are_used_as_they_are():
    g = Gateway(NOTES + " [p. 2]")
    markdown, cited, _ = await worker.write(g, "PROMPT", ALLOWED)
    assert cited == [2] and len(g.prompts) == 1


async def test_an_answer_without_citations_is_asked_for_again_with_a_reminder():
    g = Gateway(NOTES, NOTES + " [p. 3]")
    markdown, cited, _ = await worker.write(g, "PROMPT", ALLOWED)
    assert cited == [3] and markdown.endswith("[p. 3]")
    assert g.prompts[1] == "PROMPT" + worker.CITE_REMINDER


async def test_still_no_citations_falls_back_to_the_topics_pages():
    g = Gateway(NOTES, NOTES)
    markdown, cited, _ = await worker.write(g, "PROMPT", ALLOWED)
    assert cited == [2, 3] and markdown == NOTES.strip()


async def test_citations_to_pages_outside_the_topic_dont_count():
    g = Gateway(NOTES + " [p. 9]", NOTES + " [p. 2]")
    _, cited, _ = await worker.write(g, "PROMPT", ALLOWED)
    assert cited == [2]


async def test_a_broken_retry_keeps_the_first_answer():
    g = Gateway(NOTES, "too short")
    markdown, cited, _ = await worker.write(g, "PROMPT", ALLOWED)
    assert markdown == NOTES.strip() and cited == [2, 3]
