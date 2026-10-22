"""Question sets, quizzes and attempts (FR-QGEN-07, FR-QUIZ-01..06)."""

import json
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

from app.rag import questions as q


async def find_set(conn: AsyncConnection, key: str) -> dict | None:
    return await (
        await conn.execute(
            "select id, status::text as status, requested_count, generated_count "
            "from question_sets where cache_key = %s",
            (key,),
        )
    ).fetchone()


async def create_set(
    conn: AsyncConnection,
    source_file_id: UUID,
    key: str,
    topic_ids: list[UUID],
    types: list[str],
    difficulty: str,
    count: int,
    variant: int,
) -> dict:
    await conn.execute(
        "insert into question_sets (source_file_id, cache_key, topic_ids, question_types, "
        "difficulty, requested_count, variant, prompt_version) "
        "values (%s, %s, %s, %s::question_type[], %s, %s, %s, %s) "
        "on conflict (cache_key) do nothing",
        (source_file_id, key, topic_ids, types, difficulty, count, variant, q.PROMPT_VERSION),
    )
    return await find_set(conn, key)


async def retry_set(conn: AsyncConnection, set_id: UUID) -> None:
    await conn.execute(
        "update question_sets set status = 'pending' where id = %s and status = 'failed'", (set_id,)
    )


async def create_quiz(
    conn: AsyncConnection, user_id: UUID, document_id: UUID, set_id: UUID, title: str, mode: str
) -> UUID:
    row = await (
        await conn.execute(
            "insert into quizzes (user_id, document_id, question_set_id, title, mode_default) "
            "values (%s, %s, %s, %s, %s) returning id",
            (user_id, document_id, set_id, title[:200], mode),
        )
    ).fetchone()
    return row["id"]


async def get_quiz(conn: AsyncConnection, user_id: UUID, quiz_id: UUID) -> dict | None:
    return await (
        await conn.execute(
            """
            select z.id, z.title, z.document_id, z.mode_default::text as mode, z.question_set_id,
                   s.status::text as status, s.requested_count, s.generated_count,
                   (select progress from jobs where dedupe_key = 'questions:' || s.id::text
                    order by created_at desc limit 1) as progress
            from quizzes z join question_sets s on s.id = z.question_set_id
            where z.id = %s and z.user_id = %s
            """,
            (quiz_id, user_id),
        )
    ).fetchone()


async def questions_for(conn: AsyncConnection, set_id: UUID) -> list[dict[str, Any]]:
    return await (
        await conn.execute(
            """
            select qn.id, qn.ordinal, qn.type::text as type, qn.difficulty::text as difficulty,
                   qn.stem, qn.options, qn.answer, qn.explanation, qn.source_pages, qn.marks,
                   qn.topic_id, t.title as topic_title
            from questions qn left join topics t on t.id = qn.topic_id
            where qn.question_set_id = %s and not qn.hidden order by qn.ordinal
            """,
            (set_id,),
        )
    ).fetchall()


async def start_attempt(
    conn: AsyncConnection, user_id: UUID, quiz_id: UUID, attempt_id: UUID, mode: str
) -> dict:
    """Idempotent: the app picks the id, so a retried request returns the same attempt."""
    await conn.execute(
        "insert into quiz_attempts (id, user_id, quiz_id, mode) values (%s, %s, %s, %s) "
        "on conflict (id) do nothing",
        (attempt_id, user_id, quiz_id, mode),
    )
    return await get_attempt(conn, user_id, attempt_id)


async def get_attempt(conn: AsyncConnection, user_id: UUID, attempt_id: UUID) -> dict | None:
    return await (
        await conn.execute(
            """
            select a.id, a.quiz_id, a.mode::text as mode, a.status::text as status, a.started_at,
                   a.submitted_at, a.current_index, a.score, a.max_score, a.topic_breakdown,
                   z.question_set_id, z.title
            from quiz_attempts a join quizzes z on z.id = a.quiz_id
            where a.id = %s and a.user_id = %s
            """,
            (attempt_id, user_id),
        )
    ).fetchone()


async def save_answers(
    conn: AsyncConnection, attempt: dict, answers: list[dict], current_index: int | None
) -> dict[UUID, bool | None]:
    """Upserts answers, re-marking objective ones here so the score can't be tampered with."""
    qs = {row["id"]: row for row in await questions_for(conn, attempt["question_set_id"])}
    marks: dict[UUID, bool | None] = {}
    async with conn.transaction():
        for a in answers:
            question = qs.get(a["question_id"])
            if question is None:
                continue
            correct = q.is_correct(question["type"], question["answer"], a["response"])
            marks[a["question_id"]] = correct
            await conn.execute(
                """
                insert into attempt_answers (id, attempt_id, question_id, response, is_correct,
                                             score, marked_by)
                values (%s, %s, %s, %s, %s, %s, 'server')
                on conflict (attempt_id, question_id) do update
                set response = excluded.response, is_correct = excluded.is_correct,
                    score = excluded.score, answered_at = now()
                """,
                (
                    a["id"],
                    attempt["id"],
                    a["question_id"],
                    json.dumps(a["response"]),
                    correct,
                    (question["marks"] if correct else 0) if correct is not None else None,
                ),
            )
        if current_index is not None:
            await conn.execute(
                "update quiz_attempts set current_index = %s where id = %s",
                (current_index, attempt["id"]),
            )
    return marks


async def answers_for(conn: AsyncConnection, attempt_id: UUID) -> list[dict]:
    return await (
        await conn.execute(
            "select question_id, response, is_correct, score from attempt_answers "
            "where attempt_id = %s",
            (attempt_id,),
        )
    ).fetchall()


def breakdown(questions: list[dict], answers: list[dict]) -> tuple[float, float, list[dict]]:
    """Score, max score and per-topic results; unanswered questions score zero (FR-QUIZ-02/06)."""
    by_question = {a["question_id"]: a for a in answers}
    topics: dict[str, dict] = {}
    score = max_score = 0.0
    for question in questions:
        answer = by_question.get(question["id"])
        got = float(answer["score"] or 0) if answer else 0.0
        score += got
        max_score += question["marks"]
        key = str(question["topic_id"])
        t = topics.setdefault(
            key, {"topic_id": key, "title": question["topic_title"], "score": 0.0, "max": 0.0}
        )
        t["score"] += got
        t["max"] += question["marks"]
    return score, max_score, list(topics.values())


async def submit(conn: AsyncConnection, attempt: dict) -> None:
    questions = await questions_for(conn, attempt["question_set_id"])
    score, max_score, topics = breakdown(questions, await answers_for(conn, attempt["id"]))
    await conn.execute(
        "update quiz_attempts set status = 'completed', "
        "submitted_at = coalesce(submitted_at, now()), "
        "score = %s, max_score = %s, topic_breakdown = %s where id = %s",
        (score, max_score, json.dumps(topics), attempt["id"]),
    )
