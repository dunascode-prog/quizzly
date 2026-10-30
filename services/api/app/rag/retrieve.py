"""Hybrid retrieval inside Postgres (ARCHITECTURE §5.2): vector and keyword search over one
source file's chunks, merged with reciprocal rank fusion."""

import re
from uuid import UUID

from psycopg import AsyncConnection

from app.rag import embed

# bge models expect this instruction on queries (not on the passages they're compared with).
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
CANDIDATES = 20  # from each search, before fusion
RRF_K = 60
# About 2,000 tokens of notes per answer: 25% less input than 12,000 characters with the same
# citation and "not in your notes" behaviour in testing (FR-LIM-06).
CONTEXT_CHARS = 8_000
PAGE_CHARS = 3_000


def embed_query(text: str, model: str) -> list[float]:
    """Blocking; call with asyncio.to_thread."""
    return embed.embed_passages([QUERY_PREFIX + text], model)[0]


def keyword_query(text: str) -> str:
    """Any of the question's words (OR), as a to_tsquery string; '' when there are none."""
    words = dict.fromkeys(w.lower() for w in re.findall(r"[A-Za-z0-9]{2,}", text))
    return " | ".join(list(words)[:30])


async def hybrid(
    conn: AsyncConnection, source_file_id: UUID, text: str, vector: list[float], k: int = 6
) -> list[dict]:
    """The k best chunks for the question, best first."""
    rows = await (
        await conn.execute(
            """
            with v as (
                select id, row_number() over (order by embedding <=> %(vec)s::vector) as r
                from chunks where source_file_id = %(sf)s and embedding is not null
                order by embedding <=> %(vec)s::vector limit %(n)s
            ),
            kw as (
                select id, row_number() over (order by ts_rank_cd(tsv, q) desc) as r
                from chunks, to_tsquery('english', %(q)s) q
                where source_file_id = %(sf)s and %(q)s <> '' and tsv @@ q
                order by ts_rank_cd(tsv, q) desc limit %(n)s
            ),
            fused as (
                select id, sum(1.0 / (%(rrf)s + r)) as score
                from (select * from v union all select * from kw) x group by id
                order by score desc limit %(k)s
            )
            select c.id, c.page_start, c.page_end, c.content
            from fused join chunks c using (id)
            order by fused.score desc
            """,
            {
                "vec": embed.to_pgvector(vector),
                "sf": source_file_id,
                "q": keyword_query(text),
                "n": CANDIDATES,
                "rrf": RRF_K,
                "k": k,
            },
        )
    ).fetchall()
    return rows


async def pages_for(
    conn: AsyncConnection, source_file_id: UUID, chunks: list[dict], budget: int = CONTEXT_CHARS
) -> list[dict]:
    """The pages under the best chunks, one excerpt per page so every citation is exact
    (a short deck can be a single chunk spanning many pages). Best chunks' pages come first
    within the budget; the result is in page order."""
    wanted = list(
        dict.fromkeys(n for c in chunks for n in range(c["page_start"], c["page_end"] + 1))
    )
    if not wanted:
        return []
    rows = await (
        await conn.execute(
            "select page_number, text from pages where source_file_id = %s "
            "and page_number = any(%s) and text <> ''",
            (source_file_id, wanted),
        )
    ).fetchall()
    text = {r["page_number"]: r["text"][:PAGE_CHARS] for r in rows}
    kept, used = [], 0
    for n in wanted:
        if n in text and used + len(text[n]) <= budget:
            kept.append(n)
            used += len(text[n])
    return [{"page_start": n, "page_end": n, "content": text[n]} for n in sorted(kept)]
