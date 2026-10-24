"""`generate_questions` job: a question set spread across topics, validated, topped up (FR-QGEN).

Questions are written from each topic's own pages (so citations are exact pages), with several
topics per LLM call and calls made one at a time, to stay inside free-tier rate limits.
"""

import asyncio
import json
import logging
from uuid import UUID

from psycopg import AsyncConnection

from app.core.config import get_settings
from app.llm.gateway import AllProvidersBusy
from app.rag import embed, text
from app.rag import questions as q
from app.worker import ingest, queue

log = logging.getLogger("quizzly.questions")

TOP_UPS = 2  # FR-QGEN-05: refill dropped questions up to twice
# A first topic with less text than this is the cover page: questions from it are trivia
# ("Lecture ____ covers…"), so it's skipped when other topics are selected. Later short topics
# stay in, because real slides are often that short.
COVER_PAGE_TOKENS = 40
OVER_ASK = 0.3  # ask for 30% more than needed; some fail validation


async def _pages(conn: AsyncConnection, source_file_id: UUID) -> dict[int, q.SourcePage]:
    rows = await (
        await conn.execute(
            "select page_number, text from pages where source_file_id = %s order by page_number",
            (source_file_id,),
        )
    ).fetchall()
    return {
        r["page_number"]: q.SourcePage(r["page_number"], r["text"], text.token_estimate(r["text"]))
        for r in rows
        if r["text"].strip()
    }


async def _chunk_pages(conn: AsyncConnection, source_file_id: UUID) -> list[tuple[str, int, int]]:
    rows = await (
        await conn.execute(
            "select id::text, page_start, page_end from chunks where source_file_id = %s",
            (source_file_id,),
        )
    ).fetchall()
    return [(r["id"], r["page_start"], r["page_end"]) for r in rows]


async def _ask(
    batch: list[q.TopicSource], types: list[str], difficulty: str, template: str
) -> list[q.Draft]:
    """One LLM call for a batch of topics; validated questions, at most each topic's count."""
    prompt = q.build_prompt(template, batch, types, difficulty, over_ask=OVER_ASK)
    completion = await ingest.gateway().complete(
        "questions",
        [{"role": "user", "content": prompt}],
        json_mode=True,
        temperature=0.6,
        max_tokens=6000,
    )
    by_label = {src.label: src for src in batch}
    wanted = {src.topic_id: src.count for src in batch}
    drafts: list[q.Draft] = []
    for item in q.parse(completion.text):
        d = q.validate(item, by_label, types, difficulty)
        if d is not None and sum(x.topic_id == d.topic_id for x in drafts) < wanted[d.topic_id]:
            drafts.append(d)
    return drafts


def _drop_duplicates(drafts: list[q.Draft], model: str) -> tuple[list[q.Draft], list[list[float]]]:
    """Removes near-duplicate stems (cosine > 0.92); bge vectors are normalised, so dot = cosine."""
    if not drafts:
        return [], []
    vectors = embed.embed_passages([d.stem for d in drafts], model)
    kept: list[q.Draft] = []
    kept_vecs: list[list[float]] = []
    for d, v in zip(drafts, vectors, strict=True):
        similar = (sum(a * b for a, b in zip(v, k, strict=True)) for k in kept_vecs)
        if all(s <= q.DUPLICATE_SIMILARITY for s in similar):
            kept.append(d)
            kept_vecs.append(v)
    return kept, kept_vecs


async def generate_questions(conn: AsyncConnection, job: dict) -> None:
    settings = get_settings()
    set_id = UUID(job["payload"]["question_set_id"])
    qs = await (
        await conn.execute(
            "select id, source_file_id, topic_ids, question_types::text[] as types, "
            "difficulty::text as difficulty, requested_count, status::text as status "
            "from question_sets where id = %s",
            (set_id,),
        )
    ).fetchone()
    if qs is None or qs["status"] == "ready":
        return
    await conn.execute("update question_sets set status = 'generating' where id = %s", (set_id,))
    try:
        topics = await (
            await conn.execute(
                "select id::text, title, page_start, page_end from topics "
                "where id = any(%s) order by ordinal",
                (qs["topic_ids"],),
            )
        ).fetchall()
        types = [t for t in qs["types"] if t in q.ALL_TYPES]
        pages = await _pages(conn, qs["source_file_id"])
        topic_pages = {
            t["id"]: [
                pages[n]
                for n in range(t["page_start"] or 0, (t["page_end"] or 0) + 1)
                if n in pages
            ]
            for t in topics
        }
        with_text = [t for t in topics if topic_pages[t["id"]]]
        first = await (
            await conn.execute(
                "select id::text from topics where source_file_id = %s order by ordinal limit 1",
                (qs["source_file_id"],),
            )
        ).fetchone()
        usable = [
            t
            for t in with_text
            if not (
                first
                and t["id"] == first["id"]
                and sum(pg.token_count for pg in topic_pages[t["id"]]) < COVER_PAGE_TOKENS
            )
        ] or with_text
        if not usable or not types:
            raise ValueError("no topics with text, or no supported question types")
        # A topic's share follows the length of its own pages (FR-QGEN-04).
        weights = [
            q.Topic(t["id"], t["title"], sum(pg.token_count for pg in topic_pages[t["id"]]))
            for t in usable
        ]
        alloc = q.allocate(weights, qs["requested_count"])
        labels = {t["id"]: f"t{i}" for i, t in enumerate(usable, start=1)}
        titles = {t["id"]: t["title"] for t in usable}
        template = q.PROMPT_PATH.read_text(encoding="utf-8")

        drafts: list[q.Draft] = []
        vectors: list[list[float]] = []
        for round_ in range(1 + TOP_UPS):
            have = {tid: sum(d.topic_id == tid for d in drafts) for tid in alloc}
            missing = {tid: n - have[tid] for tid, n in alloc.items() if n > have[tid]}
            mix = q.plan_types(missing, types)
            sources = [
                q.TopicSource(
                    labels[tid], tid, titles[tid], n, q.select_pages(topic_pages[tid]), mix[tid]
                )
                for tid, n in missing.items()
            ]
            if not sources:
                break
            for batch in q.batches(sources):  # one call at a time: free tiers rate-limit bursts
                drafts += await _ask(batch, types, qs["difficulty"], template)
            drafts, vectors = await asyncio.to_thread(
                _drop_duplicates, drafts, settings.embedding_model
            )
            await queue.set_progress(conn, job["id"], 20 + 25 * (round_ + 1))

        if not drafts:
            raise ValueError("no question passed validation")
        chunk_pages = await _chunk_pages(conn, qs["source_file_id"])
        for d in drafts:
            d.chunk_ids = [cid for cid, a, b in chunk_pages if any(a <= p <= b for p in d.pages)]
        order = {tid: i for i, tid in enumerate(alloc)}
        ranked = sorted(range(len(drafts)), key=lambda i: order[drafts[i].topic_id])
        await _save(conn, set_id, [drafts[i] for i in ranked], [vectors[i] for i in ranked])
        log.info("question set %s ready: %d/%d", set_id, len(drafts), qs["requested_count"])
    except AllProvidersBusy:
        await conn.execute("update question_sets set status = 'pending' where id = %s", (set_id,))
        raise
    except Exception:
        final = job["attempts"] >= job["max_attempts"]
        await conn.execute(
            "update question_sets set status = %s where id = %s",
            ("failed" if final else "pending", set_id),
        )
        raise


async def _save(
    conn: AsyncConnection, set_id: UUID, drafts: list[q.Draft], vectors: list[list[float]]
) -> None:
    rows = []
    for ordinal, (d, v) in enumerate(zip(drafts, vectors, strict=True)):
        d = q.shuffle_options(d, f"{set_id}:{ordinal}")
        rows.append(
            (
                set_id,
                d.topic_id,
                ordinal,
                d.type,
                d.difficulty,
                d.stem,
                json.dumps(d.options) if d.options else None,
                json.dumps(q.stored_answer(d)),
                d.explanation,
                json.dumps(d.rubric) if d.rubric else None,
                d.marks,
                d.chunk_ids,
                d.pages,
                embed.to_pgvector(v),
            )
        )
    async with conn.transaction():
        await conn.execute("delete from questions where question_set_id = %s", (set_id,))
        async with conn.cursor() as cur:
            await cur.executemany(
                "insert into questions (question_set_id, topic_id, ordinal, type, difficulty, "
                "stem, options, answer, explanation, rubric, marks, source_chunk_ids, "
                "source_pages, embedding) "
                "values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector)",
                rows,
            )
        await conn.execute(
            "update question_sets set status = 'ready', generated_count = %s where id = %s",
            (len(drafts), set_id),
        )
