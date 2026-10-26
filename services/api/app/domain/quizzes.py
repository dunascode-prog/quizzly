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
    conn: AsyncConnection,
    user_id: UUID,
    document_id: UUID,
    set_id: UUID,
    title: str,
    mode: str,
    time_limit_sec: int | None = None,
) -> UUID:
    row = await (
        await conn.execute(
            "insert into quizzes (user_id, document_id, question_set_id, title, mode_default, "
            "time_limit_sec) values (%s, %s, %s, %s, %s, %s) returning id",
            (user_id, document_id, set_id, title[:200], mode, time_limit_sec),
        )
    ).fetchone()
    return row["id"]


async def get_quiz(conn: AsyncConnection, user_id: UUID, quiz_id: UUID) -> dict | None:
    return await (
        await conn.execute(
            """
            select z.id, z.title, z.document_id, z.mode_default::text as mode, z.question_set_id,
                   z.time_limit_sec, s.status::text as status, s.requested_count, s.generated_count,
                   (select progress from jobs where dedupe_key = 'questions:' || s.id::text
                    order by created_at desc limit 1) as progress
            from quizzes z join question_sets s on s.id = z.question_set_id
            where z.id = %s and z.user_id = %s
            """,
            (quiz_id, user_id),
        )
    ).fetchone()


async def has_submitted(conn: AsyncConnection, user_id: UUID, quiz_id: UUID) -> bool:
    """Whether the student has handed in an attempt on this quiz (answers may be shown)."""
    row = await (
        await conn.execute(
            "select 1 from quiz_attempts where quiz_id = %s and user_id = %s "
            "and status <> 'in_progress' limit 1",
            (quiz_id, user_id),
        )
    ).fetchone()
    return row is not None


async def questions_for(conn: AsyncConnection, set_id: UUID) -> list[dict[str, Any]]:
    return await (
        await conn.execute(
            """
            select qn.id, qn.ordinal, qn.type::text as type, qn.difficulty::text as difficulty,
                   qn.stem, qn.options, qn.answer, qn.explanation, qn.source_pages, qn.marks,
                   qn.rubric, qn.topic_id, t.title as topic_title
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
                   z.question_set_id, z.title, z.document_id, z.time_limit_sec
            from quiz_attempts a join quizzes z on z.id = a.quiz_id
            where a.id = %s and a.user_id = %s
            """,
            (attempt_id, user_id),
        )
    ).fetchone()


async def save_answers(
    conn: AsyncConnection, attempt: dict, answers: list[dict], current_index: int | None
) -> dict[UUID, bool | None]:
    """Upserts answers. Objective ones are re-marked here so the score can't be tampered with;
    written ones keep their LLM marks unless the text changed (a resend mustn't re-mark)."""
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
                values (%s, %s, %s, %s, %s, %s, %s)
                on conflict (attempt_id, question_id) do update
                set response = excluded.response, answered_at = now(),
                    is_correct = case when {fresh} then excluded.is_correct
                                      else attempt_answers.is_correct end,
                    score = case when {fresh} then excluded.score else attempt_answers.score end,
                    feedback = case when {fresh} then null else attempt_answers.feedback end,
                    marked_by = case when {fresh} then excluded.marked_by
                                     else attempt_answers.marked_by end
                """.format(
                    fresh="excluded.marked_by = 'server' "
                    "or attempt_answers.response is distinct from excluded.response"
                ),
                (
                    a["id"],
                    attempt["id"],
                    a["question_id"],
                    json.dumps(a["response"]),
                    correct,
                    (question["marks"] if correct else 0) if correct is not None else None,
                    "server" if correct is not None else None,
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
            "select question_id, response, is_correct, score, feedback from attempt_answers "
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


async def pending_marking(conn: AsyncConnection, attempt_id: UUID) -> list[UUID]:
    """Written answers not yet marked."""
    rows = await (
        await conn.execute(
            "select aa.question_id from attempt_answers aa "
            "join questions qn on qn.id = aa.question_id "
            "where aa.attempt_id = %s and qn.type in ('short_answer', 'theory') "
            "and aa.score is null",
            (attempt_id,),
        )
    ).fetchall()
    return [r["question_id"] for r in rows]


async def marking_inputs(conn: AsyncConnection, attempt_id: UUID, question_id: UUID) -> dict | None:
    """The question, its rubric, the student's answer and the cited pages' text, for the marker."""
    row = await (
        await conn.execute(
            """
            select qn.id, qn.stem, qn.answer, qn.rubric, qn.marks, qn.source_pages, aa.response,
                   aa.score, s.source_file_id
            from attempt_answers aa
            join questions qn on qn.id = aa.question_id
            join question_sets s on s.id = qn.question_set_id
            where aa.attempt_id = %s and aa.question_id = %s
            """,
            (attempt_id, question_id),
        )
    ).fetchone()
    if row is None:
        return None
    pages = await (
        await conn.execute(
            "select page_number, text from pages "
            "where source_file_id = %s and page_number = any(%s) order by page_number",
            (row["source_file_id"], row["source_pages"]),
        )
    ).fetchall()
    return {**row, "notes": "\n\n".join(f"[p. {p['page_number']}]\n{p['text']}" for p in pages)}


async def record_marking(
    conn: AsyncConnection,
    attempt_id: UUID,
    question_id: UUID,
    score: float,
    correct: bool | None,
    feedback: dict,
) -> None:
    await conn.execute(
        "update attempt_answers set score = %s, is_correct = %s, feedback = %s, marked_by = 'llm' "
        "where attempt_id = %s and question_id = %s",
        (score, correct, json.dumps(feedback), attempt_id, question_id),
    )


async def _score(conn: AsyncConnection, attempt: dict) -> tuple[float, float, list[dict]]:
    questions = await questions_for(conn, attempt["question_set_id"])
    return breakdown(questions, await answers_for(conn, attempt["id"]))


async def submit(conn: AsyncConnection, attempt: dict) -> str:
    """Scores the attempt now, or leaves it 'marking' until the LLM has marked written answers."""
    status = "marking" if await pending_marking(conn, attempt["id"]) else "completed"
    score, max_score, topics = await _score(conn, attempt)
    await conn.execute(
        "update quiz_attempts set status = %s, "
        "submitted_at = coalesce(submitted_at, now()), "
        "score = %s, max_score = %s, topic_breakdown = %s where id = %s",
        (status, score, max_score, json.dumps(topics), attempt["id"]),
    )
    return status


async def finish_if_marked(conn: AsyncConnection, attempt_id: UUID) -> None:
    """Called after each marking: completes a submitted attempt once nothing is left to mark."""
    attempt = await (
        await conn.execute(
            "select a.id, a.status::text as status, z.question_set_id from quiz_attempts a "
            "join quizzes z on z.id = a.quiz_id where a.id = %s",
            (attempt_id,),
        )
    ).fetchone()
    if attempt is None or attempt["status"] != "marking" or await pending_marking(conn, attempt_id):
        return
    score, max_score, topics = await _score(conn, attempt)
    await conn.execute(
        "update quiz_attempts set status = 'completed', score = %s, max_score = %s, "
        "topic_breakdown = %s where id = %s and status = 'marking'",
        (score, max_score, json.dumps(topics), attempt_id),
    )


async def list_attempts(conn: AsyncConnection, user_id: UUID, limit: int = 30) -> list[dict]:
    """Recent attempts for the Practice tab, newest first (FR-QUIZ-05)."""
    return await (
        await conn.execute(
            """
            select a.id, a.quiz_id, z.title, z.document_id, a.mode::text as mode,
                   a.status::text as status, a.started_at, a.submitted_at, a.current_index,
                   a.score, a.max_score, s.generated_count as question_count
            from quiz_attempts a
            join quizzes z on z.id = a.quiz_id
            join question_sets s on s.id = z.question_set_id
            where a.user_id = %s
            order by a.started_at desc
            limit %s
            """,
            (user_id, limit),
        )
    ).fetchall()


async def weak_topics(conn: AsyncConnection, user_id: UUID, attempts: int = 20) -> list[dict]:
    """Per-topic accuracy across the last completed attempts; weakest first (FR-QUIZ-07)."""
    return await (
        await conn.execute(
            """
            with recent as (
                select a.topic_breakdown, z.document_id from quiz_attempts a
                join quizzes z on z.id = a.quiz_id
                where a.user_id = %s and a.status = 'completed' and a.topic_breakdown is not null
                order by a.submitted_at desc limit %s
            )
            select t->>'topic_id' as topic_id, max(t->>'title') as title,
                   (array_agg(recent.document_id))[1] as document_id,
                   sum((t->>'score')::numeric) as score, sum((t->>'max')::numeric) as max
            from recent, jsonb_array_elements(recent.topic_breakdown) t
            group by t->>'topic_id'
            having sum((t->>'max')::numeric) > 0
               and sum((t->>'score')::numeric) < sum((t->>'max')::numeric)
            order by sum((t->>'score')::numeric) / sum((t->>'max')::numeric), max(t->>'title')
            limit 3
            """,
            (user_id, attempts),
        )
    ).fetchall()
