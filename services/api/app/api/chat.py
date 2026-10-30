"""Chat with notes, streamed over Server-Sent Events (FR-CHAT-01..05, ARCHITECTURE §5.7)."""

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.deps import AppSettings, Conn, User
from app.core import db
from app.domain import accounts, chat, study, usage
from app.llm import usage as llm_usage
from app.llm.gateway import AllProvidersBusy
from app.llm.gateway import plan as llm_plan
from app.rag import chat as rag
from app.rag import retrieve
from app.worker import ingest

log = logging.getLogger("quizzly.chat")
router = APIRouter(tags=["chat"])

BUSY = "High demand right now. Try again in a minute; this didn't use up a message."
FAILED = "Something went wrong while answering. Try again; this didn't use up a message."


class Citation(BaseModel):
    page: int


class MessageOut(BaseModel):
    id: UUID
    role: str
    content: str
    citations: list[Citation]
    grounded: bool | None
    created_at: datetime


class ChatOut(BaseModel):
    thread_id: UUID | None
    messages: list[MessageOut]


class AskIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)  # FR-SEC-10


async def _document(conn, user_id: UUID, document_id: UUID) -> dict:
    doc = await study.ready_document(conn, user_id, document_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found or not ready yet")
    return doc


def _event(name: str, data: dict) -> str:
    return f"event: {name}\ndata: {json.dumps(data, default=str)}\n\n"


@router.get("/v1/documents/{document_id}/chat")
async def get_chat(document_id: UUID, user: User, conn: Conn) -> ChatOut:
    """The saved chat for this document; `thread_id` is null until the first question."""
    await _document(conn, user.id, document_id)
    thread = await chat.thread_for(conn, user.id, document_id)
    rows = await chat.messages(conn, thread["id"]) if thread else []
    return ChatOut(
        thread_id=thread["id"] if thread else None, messages=[MessageOut(**r) for r in rows]
    )


SSE_EXAMPLE = (
    'event: token\ndata: {"text": "Osmosis is "}\n\n'
    'event: token\ndata: {"text": "the movement of water (p. 4)."}\n\n'
    'event: done\ndata: {"thread_id": "…", "question": {…}, "answer": {…}}\n\n'
)


@router.post(
    "/v1/documents/{document_id}/chat/messages",
    response_class=StreamingResponse,
    responses={
        200: {
            "description": "A Server-Sent Events stream: `token` events with `{text}`, then one "
            "`done` event with `{thread_id, question, answer}` (each a MessageOut), or one "
            "`error` event with `{detail}`.",
            "content": {
                "text/event-stream": {"schema": {"type": "string"}, "example": SSE_EXAMPLE}
            },
        },
        429: {"description": "Today's chat messages are used up."},
    },
)
async def ask(
    document_id: UUID, body: AskIn, user: User, settings: AppSettings
) -> StreamingResponse:
    """Streams `token` events, then one `done` event with both stored messages (or `error`).
    The pooled connection is released before streaming so a slow model can't hold it."""
    question = body.text.strip()
    if not question:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Type a question first")
    started = time.perf_counter()
    async with db.get_pool().connection() as conn:
        doc = await _document(conn, user.id, document_id)
        plan = await accounts.plan_of(conn, user.id)  # which models answer (FR-LIM-04)
        limit = settings.daily_chat_messages
        if await usage.take(conn, user.id, "chat_message", limit, settings.timezone) is None:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"You've used today's {limit} chat messages. Resets at 12:00 AM.",
            )
        thread = await chat.thread_for(conn, user.id, document_id)
        history = await chat.messages(conn, thread["id"], rag.HISTORY_MESSAGES) if thread else []
        # A follow-up ("explain that more simply") is searched together with the last question.
        last_question = next((m["content"] for m in reversed(history) if m["role"] == "user"), "")
        query = f"{last_question} {question}" if len(question.split()) < 8 else question
        vector = await asyncio.to_thread(retrieve.embed_query, query, settings.embedding_model)
        best = await retrieve.hybrid(conn, doc["source_file_id"], query, vector)
        chunks = await retrieve.pages_for(conn, doc["source_file_id"], best)
    prepared_ms = int((time.perf_counter() - started) * 1000)

    messages = rag.build_messages(
        rag.PROMPT_PATH.read_text(encoding="utf-8"), doc["title"], chunks, history, question
    )

    async def give_back() -> None:
        async with db.get_pool().connection() as conn:
            await usage.give_back(conn, user.id, "chat_message", 1, settings.timezone)

    async def events() -> AsyncIterator[str]:
        llm_usage.for_user(user.id)  # llm_calls rows for chat carry the student, no job
        llm_plan.set(plan)
        think = rag.ThinkFilter()
        # What the student sees: half-written or invalid markers are held back (FR-SEC-14).
        clean = rag.CitationStream(rag.allowed_pages(chunks))
        raw, model, first_ms = "", "", None
        try:
            async for delta in ingest.gateway().stream(
                "chat", messages, temperature=0.2, max_tokens=900
            ):
                model = f"{delta.provider}/{delta.model}"
                text = think.feed(delta.text)
                if text:
                    raw += text
                    shown = clean.feed(text)
                    if shown:
                        if first_ms is None:
                            first_ms = int((time.perf_counter() - started) * 1000)
                        yield _event("token", {"text": shown})
            rest = clean.flush()
            if rest:
                yield _event("token", {"text": rest})
        except AllProvidersBusy:
            await give_back()
            yield _event("error", {"detail": BUSY})
            return
        except Exception:
            log.exception("chat stream failed")
            await give_back()
            yield _event("error", {"detail": FAILED})
            return
        reply = rag.finish(raw, chunks)
        log.info("chat answered: prepared %sms, first token %sms", prepared_ms, first_ms)
        async with db.get_pool().connection() as conn:
            thread_id = thread["id"] if thread else None
            if thread_id is None:
                thread_id = await chat.create_thread(conn, user.id, document_id, question)
            asked, answered = await chat.add_turn(conn, thread_id, question, reply, model)
        yield _event(
            "done",
            {
                "thread_id": thread_id,
                "question": MessageOut(**asked).model_dump(mode="json"),
                "answer": MessageOut(**answered).model_dump(mode="json"),
            },
        )

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/v1/chat/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def clear_chat(thread_id: UUID, user: User, conn: Conn) -> Response:
    """Starts over: deletes the thread and its messages."""
    if not await chat.delete_thread(conn, user.id, thread_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chat not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
