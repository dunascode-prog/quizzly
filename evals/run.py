"""Runs the evaluation set (NFR-11) through the real pipeline: PDF → text → outline → questions and
flashcards, with the real prompts, validators and LLM routing. No database is needed.

    cd services/api && uv run python ../../evals/run.py [case-name ...]

Writes evals/report.json and evals/report.md, and exits 1 when a metric is below
evals/thresholds.json, so CI fails a prompt change that makes the output worse.
"""

import asyncio
import json
import sys
import time
from pathlib import Path

EVALS = Path(__file__).resolve().parent
API = EVALS.parent / "services" / "api"
sys.path[:0] = [str(API), str(EVALS)]

from scoring import CaseResult, failures, in_range, keyword_recall, leaked, summarise  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.llm.config import load_models_config  # noqa: E402
from app.llm.gateway import LLMGateway  # noqa: E402
from app.rag import extract, outline, text  # noqa: E402
from app.rag import questions as q  # noqa: E402
from app.worker.questions import COVER_PAGE_TOKENS  # noqa: E402
from tests.fixtures import make_pdf  # noqa: E402

QUESTION_COUNT = 10
QUESTION_TYPES = ["mcq", "true_false", "fill_blank", "short_answer"]
FLASHCARD_COUNT = 10


def load_cases(names: list[str]) -> list[dict]:
    files = sorted((EVALS / "cases").glob("*.json"))
    cases = [json.loads(f.read_text(encoding="utf-8")) | {"name": f.stem} for f in files]
    return [c for c in cases if not names or c["name"] in names]


async def _generate(gateway, topics, pages, types, count, template, validate) -> tuple[list, int]:
    """Same steps as the generate_questions job: allocate by length, plan types, batch, validate."""
    by_number = {
        p.number: q.SourcePage(p.number, p.text, text.token_estimate(p.text)) for p in pages
    }
    topic_pages = {
        f"t{i}": [
            by_number[n] for n in range(t.page_start or 0, (t.page_end or 0) + 1) if n in by_number
        ]
        for i, t in enumerate(topics)
    }
    weights = [
        q.Topic(f"t{i}", t.title, sum(pg.token_count for pg in topic_pages[f"t{i}"]))
        for i, t in enumerate(topics)
        if topic_pages[f"t{i}"]
    ]
    # Like the job: a near-empty cover page gets no questions when there are other topics.
    if len(weights) > 1 and weights[0].id == "t0" and weights[0].token_count < COVER_PAGE_TOKENS:
        weights = weights[1:]
    alloc = q.allocate(weights, count)
    mix = q.plan_types(alloc, types)
    titles = {f"t{i}": t.title for i, t in enumerate(topics)}
    sources = [
        q.TopicSource(tid, tid, titles[tid], n, q.select_pages(topic_pages[tid]), mix[tid])
        for tid, n in alloc.items()
        if n
    ]
    drafts = []
    for batch in q.batches(sources):
        prompt = q.build_prompt(template, batch, types, "mixed", over_ask=0.3)
        completion = await gateway.complete(
            "questions",
            [{"role": "user", "content": prompt}],
            json_mode=True,
            temperature=0.6,
            max_tokens=6000,
        )
        by_label = {s.label: s for s in batch}
        wanted = {s.topic_id: s.count for s in batch}
        for item in q.parse(completion.text):
            d = validate(item, by_label)
            if d is not None and sum(x.topic_id == d.topic_id for x in drafts) < wanted[d.topic_id]:
                drafts.append(d)
    return drafts, sum(alloc.values())


def _texts(d) -> list[str]:
    answer = d.answer if isinstance(d.answer, str) else json.dumps(d.answer)
    return [d.stem, answer, *(d.options or [])]


async def run_case(gateway: LLMGateway, case: dict) -> CaseResult:
    result = CaseResult(case["name"])
    try:
        pages = text.guess_headings(
            text.clean_pages(extract.extract(make_pdf(case["pages"]), extract.PDF_MIME))
        )
        topics = outline.outline_from_headings(pages) or await outline.outline_with_llm(
            gateway, pages
        )
        expected = case["expected"]
        result.topic_count = len(topics)
        result.outline_ok = in_range(len(topics), *expected["topics"])
        result.outline_recall = keyword_recall(
            expected.get("topic_keywords", []), [t.title for t in topics]
        )

        drafts, asked = await _generate(
            gateway,
            topics,
            pages,
            QUESTION_TYPES,
            QUESTION_COUNT,
            q.PROMPT_PATH.read_text(encoding="utf-8"),
            lambda item, labels: q.validate(item, labels, QUESTION_TYPES, "mixed"),
        )
        result.questions_asked, result.questions_valid = asked, len(drafts)
        produced = [t for d in drafts for t in _texts(d)]
        result.question_coverage = keyword_recall(expected.get("must_cover", []), produced)

        cards, asked = await _generate(
            gateway,
            topics,
            pages,
            [q.FLASHCARD],
            FLASHCARD_COUNT,
            q.FLASHCARD_PROMPT_PATH.read_text(encoding="utf-8"),
            q.validate_flashcard,
        )
        result.flashcards_asked, result.flashcards_valid = asked, len(cards)
        produced += [t for c in cards for t in _texts(c)]
        result.leaks = leaked(expected.get("banned", []), produced)
    except Exception as exc:  # one broken case shouldn't hide the others' results
        result.error = f"{type(exc).__name__}: {exc}"
    return result


def report(results: list[CaseResult], summary: dict, problems: list[str], seconds: float) -> str:
    lines = [
        "# Evaluation report (NFR-11)",
        "",
        f"{summary.get('cases', 0)} cases in {seconds:.0f} s. "
        + ("**Passed.**" if not problems else "**Failed:** " + "; ".join(problems)),
        "",
        "| Metric | Value |",
        "|---|---|",
        *(f"| {k} | {v} |" for k, v in summary.items()),
        "",
        "| Case | Topics | Outline recall | Questions | Coverage | Flashcards | Notes |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in results:
        notes = r.error or (f"leaked: {', '.join(r.leaks)}" if r.leaks else "")
        lines.append(
            f"| {r.name} | {r.topic_count}{'' if r.outline_ok else ' ✗'} | {r.outline_recall:.2f} "
            f"| {r.questions_valid}/{r.questions_asked} | {r.question_coverage:.2f} "
            f"| {r.flashcards_valid}/{r.flashcards_asked} | {notes} |"
        )
    return "\n".join(lines) + "\n"


async def main(names: list[str]) -> int:
    settings = get_settings()
    gateway = LLMGateway(load_models_config(settings.models_config_path))
    cases = load_cases(names)
    started = time.time()
    results = []
    for case in cases:  # one at a time: free tiers limit bursts
        results.append(await run_case(gateway, case))
        r = results[-1]
        done = f"{r.topic_count} topics, {r.questions_valid}/{r.questions_asked} questions"
        print(f"{r.name}: {r.error or done}")
    summary = summarise(results)
    thresholds = json.loads((EVALS / "thresholds.json").read_text(encoding="utf-8"))
    problems = failures(summary, thresholds)
    (EVALS / "report.json").write_text(
        json.dumps(
            {"summary": summary, "cases": [r.__dict__ for r in results], "failures": problems},
            indent=2,
        ),
        encoding="utf-8",
    )
    md = report(results, summary, problems, time.time() - started)
    (EVALS / "report.md").write_text(md, encoding="utf-8")
    print(md)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
