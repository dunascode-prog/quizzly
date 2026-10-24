"""Chat threads and messages, one thread per document for now (FR-CHAT-01/05)."""

import json
from uuid import UUID

from psycopg import AsyncConnection

_MESSAGE = "id, role::text as role, content, citations, grounded, created_at"


async def thread_for(conn: AsyncConnection, user_id: UUID, document_id: UUID) -> dict | None:
    return await (
        await conn.execute(
            "select id, title from chat_threads where user_id = %s and document_id = %s "
            "order by updated_at desc limit 1",
            (user_id, document_id),
        )
    ).fetchone()


async def create_thread(
    conn: AsyncConnection, user_id: UUID, document_id: UUID, title: str
) -> UUID:
    row = await (
        await conn.execute(
            "insert into chat_threads (user_id, document_id, title) values (%s, %s, %s) "
            "returning id",
            (user_id, document_id, title[:80]),
        )
    ).fetchone()
    return row["id"]


async def messages(conn: AsyncConnection, thread_id: UUID, limit: int = 100) -> list[dict]:
    """The latest messages, oldest first."""
    rows = await (
        await conn.execute(
            f"select {_MESSAGE} from chat_messages where thread_id = %s "
            "order by created_at desc limit %s",
            (thread_id, limit),
        )
    ).fetchall()
    return rows[::-1]


async def add_turn(
    conn: AsyncConnection,
    thread_id: UUID,
    question: str,
    reply: dict,
    model: str,
) -> tuple[dict, dict]:
    """Stores the student's message and the assistant's reply together."""
    async with conn.transaction():
        asked = await (
            await conn.execute(
                f"insert into chat_messages (thread_id, role, content) values (%s, 'user', %s) "
                f"returning {_MESSAGE}",
                (thread_id, question),
            )
        ).fetchone()
        answered = await (
            await conn.execute(
                "insert into chat_messages (thread_id, role, content, citations, grounded, model, "
                "created_at) values (%s, 'assistant', %s, %s, %s, %s, now() + interval '1 ms') "
                f"returning {_MESSAGE}",
                (
                    thread_id,
                    reply["content"],
                    json.dumps([{"page": p} for p in reply["pages"]]),
                    reply["grounded"],
                    model,
                ),
            )
        ).fetchone()
        await conn.execute("update chat_threads set updated_at = now() where id = %s", (thread_id,))
    return asked, answered


async def delete_thread(conn: AsyncConnection, user_id: UUID, thread_id: UUID) -> bool:
    cur = await conn.execute(
        "delete from chat_threads where id = %s and user_id = %s", (thread_id, user_id)
    )
    return cur.rowcount > 0


async def can_see_message(conn: AsyncConnection, user_id: UUID, message_id: UUID) -> bool:
    row = await (
        await conn.execute(
            "select 1 from chat_messages m join chat_threads t on t.id = m.thread_id "
            "where m.id = %s and t.user_id = %s",
            (message_id, user_id),
        )
    ).fetchone()
    return row is not None
