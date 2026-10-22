"""`generate_explanation` job: one topic, one style → grounded Markdown with page citations."""

import json
import logging
from uuid import UUID

from psycopg import AsyncConnection

from app.llm.gateway import AllProvidersBusy
from app.rag import explain
from app.worker import ingest

log = logging.getLogger("quizzly.explain")

MIN_LENGTH = 200  # shorter than this is a broken answer, not an explanation


async def _topic_chunks(conn: AsyncConnection, row: dict) -> list[explain.SourceChunk]:
    rows = await (
        await conn.execute(
            "select page_start, page_end, content, token_count from chunks "
            "where topic_id = %s order by ordinal",
            (row["topic_id"],),
        )
    ).fetchall()
    if not rows and row["page_start"]:
        # Topic without chunks of its own (tiny topic): use the chunks covering its pages.
        rows = await (
            await conn.execute(
                "select page_start, page_end, content, token_count from chunks "
                "where source_file_id = %s and page_start <= %s and page_end >= %s "
                "order by ordinal",
                (row["source_file_id"], row["page_end"], row["page_start"]),
            )
        ).fetchall()
    return [explain.SourceChunk(**r) for r in rows]


async def generate_explanation(conn: AsyncConnection, job: dict) -> None:
    explanation_id = UUID(job["payload"]["explanation_id"])
    row = await (
        await conn.execute(
            "select e.id, e.source_file_id, e.topic_id, e.style::text as style, "
            "e.status::text as status, t.title, t.page_start, t.page_end "
            "from explanations e join topics t on t.id = e.topic_id where e.id = %s",
            (explanation_id,),
        )
    ).fetchone()
    if row is None or row["status"] == "ready":
        return
    await conn.execute(
        "update explanations set status = 'generating' where id = %s", (explanation_id,)
    )
    try:
        chunks = explain.select_chunks(await _topic_chunks(conn, row))
        if not chunks:
            raise ValueError("topic has no text")
        allowed = {p for c in chunks for p in range(c.page_start, c.page_end + 1)}
        prompt = explain.build_prompt(
            explain.load_template(),
            row["style"],
            row["title"],
            row["page_start"] or chunks[0].page_start,
            row["page_end"] or chunks[-1].page_end,
            chunks,
        )
        completion = await ingest.gateway().complete(
            "explanation", [{"role": "user", "content": prompt}], temperature=0.3, max_tokens=4096
        )
        markdown, cited = explain.clean_citations(explain.strip_fence(completion.text), allowed)
        if len(markdown) < MIN_LENGTH:
            raise ValueError(f"answer too short ({len(markdown)} chars) from {completion.model}")
        await conn.execute(
            "update explanations set content_md = %s, citations = %s, model = %s, "
            "status = 'ready' where id = %s",
            (
                markdown,
                json.dumps(cited),
                f"{completion.provider}/{completion.model}",
                explanation_id,
            ),
        )
        log.info(
            "explanation %s ready (%s, %d chars, %d pages cited)",
            explanation_id,
            completion.model,
            len(markdown),
            len(cited),
        )
    except AllProvidersBusy:
        await conn.execute(
            "update explanations set status = 'pending' where id = %s", (explanation_id,)
        )
        raise
    except Exception:
        final = job["attempts"] >= job["max_attempts"]
        await conn.execute(
            "update explanations set status = %s where id = %s",
            ("failed" if final else "pending", explanation_id),
        )
        raise
