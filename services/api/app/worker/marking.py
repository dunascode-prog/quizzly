"""`mark_answers` job: one short or theory answer marked against its rubric (FR-QUIZ-04)."""

import logging
from uuid import UUID

from psycopg import AsyncConnection

from app.domain import quizzes
from app.llm.gateway import AllProvidersBusy
from app.rag import marking
from app.worker import ingest

log = logging.getLogger("quizzly.marking")


def not_marked(reason: str, message: str, model_answer: str = "") -> dict:
    """Feedback for an answer we couldn't mark; it scores zero so the attempt can finish."""
    return {
        "status": "not_marked",
        "reason": reason,
        "summary": message,
        "criteria": [],
        "model_answer": model_answer,
    }


async def mark_answer(conn: AsyncConnection, job: dict) -> None:
    attempt_id = UUID(job["payload"]["attempt_id"])
    question_id = UUID(job["payload"]["question_id"])
    inputs = await quizzes.marking_inputs(conn, attempt_id, question_id)
    if inputs is None or inputs["score"] is not None:
        await quizzes.finish_if_marked(conn, attempt_id)
        return  # answer deleted, or already marked
    model_answer = inputs["answer"].get("model_answer", "")
    response = inputs["response"] if isinstance(inputs["response"], str) else ""
    if not response.strip():
        await quizzes.record_marking(
            conn,
            attempt_id,
            question_id,
            0,
            False,
            not_marked("empty", "No answer was given.", model_answer) | {"status": "marked"},
        )
        await quizzes.finish_if_marked(conn, attempt_id)
        return
    try:
        prompt = marking.build_prompt(
            marking.PROMPT_PATH.read_text(encoding="utf-8"), inputs, inputs["notes"], response
        )
        completion = await ingest.gateway().complete(
            "marking",
            [{"role": "user", "content": prompt}],
            json_mode=True,
            temperature=0.1,
            max_tokens=2000,
        )
        result = marking.score(completion.text, inputs)
        await quizzes.record_marking(
            conn,
            attempt_id,
            question_id,
            result["score"],
            marking.is_correct(result["score"], inputs["marks"]),
            result | {"status": "marked", "model": f"{completion.provider}/{completion.model}"},
        )
        log.info("marked %s/%s: %s/%s", attempt_id, question_id, result["score"], inputs["marks"])
    except AllProvidersBusy:
        raise  # re-queued; the answer stays unmarked until a provider is free
    except Exception:
        if job["attempts"] < job["max_attempts"]:
            raise
        await quizzes.record_marking(
            conn,
            attempt_id,
            question_id,
            0,
            None,
            not_marked(
                "error",
                "We couldn't mark this answer. Compare it with the model answer.",
                model_answer,
            ),
        )
    await quizzes.finish_if_marked(conn, attempt_id)
