"""`extract_style` job: a past paper's format, for quizzes in its style (FR-QGEN-09)."""

import json
import logging
from uuid import UUID

from psycopg import AsyncConnection

from app.domain import notifications
from app.llm.gateway import AllProvidersBusy
from app.rag import style
from app.worker import ingest

log = logging.getLogger("quizzly.style")


async def extract_style(conn: AsyncConnection, job: dict) -> None:
    style_id = UUID(job["payload"]["style_id"])
    row = await (
        await conn.execute(
            "select ps.id, ps.user_id, ps.course_id, ps.year, ps.status::text as status, "
            "d.source_file_id, d.title from paper_styles ps "
            "join documents d on d.id = ps.document_id "
            "where ps.id = %s and d.deleted_at is null",
            (style_id,),
        )
    ).fetchone()
    if row is None or row["status"] == "ready":
        return
    await conn.execute("update paper_styles set status = 'generating' where id = %s", (style_id,))
    try:
        pages = await (
            await conn.execute(
                "select page_number, text from pages where source_file_id = %s "
                "order by page_number",
                (row["source_file_id"],),
            )
        ).fetchall()
        prompt = style.build_prompt(
            style.PROMPT_PATH.read_text(encoding="utf-8"),
            [(p["page_number"], p["text"]) for p in pages if p["text"].strip()],
        )
        completion = await ingest.gateway().complete(
            "style", [{"role": "user", "content": prompt}], json_mode=True, temperature=0.2
        )
        found = style.validate(completion.text)
        if found is None:
            raise ValueError("no usable style in the model's answer")
        await conn.execute(
            "update paper_styles set status = 'ready', style = %s where id = %s",
            (json.dumps(found), style_id),
        )
        await notifications.notify(
            conn,
            row["user_id"],
            "quiz_ready",
            "Past-paper style ready",
            f"New quizzes can now copy the style of {row['title']}.",
            {"route": "/course/[id]", "params": {"id": str(row["course_id"])}},
            dedupe_key=f"style:{style_id}",
        )
        log.info("style %s ready: %s", style_id, found["types"])
    except AllProvidersBusy:
        await conn.execute("update paper_styles set status = 'pending' where id = %s", (style_id,))
        raise
    except Exception:
        final = job["attempts"] >= job["max_attempts"]
        await conn.execute(
            "update paper_styles set status = %s where id = %s",
            ("failed" if final else "pending", style_id),
        )
        raise
