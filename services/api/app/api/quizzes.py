from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import AppSettings, Conn, User
from app.domain import quizzes, study, usage
from app.rag import questions as q
from app.worker import queue

router = APIRouter(tags=["quizzes"])

QuestionType = Literal["mcq", "true_false", "fill_blank"]


class QuizCreate(BaseModel):
    # Whole document when empty (FR-QGEN-01 defaults: whole document, MCQ, mixed, 10).
    topic_ids: list[UUID] = []
    types: list[QuestionType] = Field(default=["mcq"], min_length=1)
    difficulty: Literal["easy", "medium", "hard", "mixed"] = "mixed"
    count: Literal[5, 10, 20, 30] = 10
    mode: Literal["practice", "exam"] = "practice"
    # A fresh set instead of the cached one; uses a question set from the allowance.
    new_questions: bool = False


class QuestionOut(BaseModel):
    id: UUID
    ordinal: int
    type: str
    difficulty: str
    stem: str
    options: list[str] | None
    # Sent with the question so the app can mark instantly and offline (FR-QUIZ-03).
    answer: object
    explanation: str
    source_pages: list[int]
    topic_id: UUID | None
    topic_title: str | None
    marks: int


class QuizOut(BaseModel):
    id: UUID
    title: str
    document_id: UUID
    mode: str
    # pending/generating while the worker writes questions; ready or failed after.
    status: str
    progress: int | None
    requested_count: int
    generated_count: int
    notice: str | None
    questions: list[QuestionOut]


class AttemptStart(BaseModel):
    id: UUID  # chosen by the app, so a retried request can't create a second attempt
    mode: Literal["practice", "exam"] = "practice"


class AnswerIn(BaseModel):
    id: UUID
    question_id: UUID
    response: int | bool | str


class AnswersIn(BaseModel):
    answers: list[AnswerIn] = Field(max_length=30)
    current_index: int | None = Field(default=None, ge=0)


class TopicResult(BaseModel):
    topic_id: str
    title: str | None
    score: float
    max: float


class AnswerOut(BaseModel):
    question_id: UUID
    response: object
    is_correct: bool | None


class AttemptOut(BaseModel):
    id: UUID
    quiz_id: UUID
    title: str
    mode: str
    status: str
    started_at: datetime
    submitted_at: datetime | None
    current_index: int
    score: float | None
    max_score: float | None
    topics: list[TopicResult]
    # Up to three topics below 100%, weakest first: "Revise next" (FR-QUIZ-06/07).
    weakest: list[TopicResult]
    answers: list[AnswerOut]


def _notice(row: dict) -> str | None:
    if row["status"] == "ready" and row["generated_count"] < row["requested_count"]:
        return (
            f"We made {row['generated_count']} good questions out of {row['requested_count']} "
            "— your notes on this topic are short."
        )
    return None


async def _quiz_out(conn, row: dict) -> QuizOut:
    qs = (
        await quizzes.questions_for(conn, row["question_set_id"])
        if row["status"] == "ready"
        else []
    )
    return QuizOut(
        **{k: row[k] for k in ("id", "title", "document_id", "mode", "status", "progress")},
        requested_count=row["requested_count"],
        generated_count=row["generated_count"],
        notice=_notice(row),
        questions=[QuestionOut(**x) for x in qs],
    )


async def _attempt_out(conn, row: dict) -> AttemptOut:
    topics = [TopicResult(**t) for t in row["topic_breakdown"] or []]
    weakest = sorted(
        (t for t in topics if t.max and t.score < t.max), key=lambda t: t.score / t.max
    )[:3]
    answers = await quizzes.answers_for(conn, row["id"])
    return AttemptOut(
        **{
            k: row[k]
            for k in (
                "id",
                "quiz_id",
                "title",
                "mode",
                "status",
                "started_at",
                "submitted_at",
                "current_index",
            )
        },
        score=float(row["score"]) if row["score"] is not None else None,
        max_score=float(row["max_score"]) if row["max_score"] is not None else None,
        topics=topics,
        weakest=weakest,
        answers=[AnswerOut(**a) for a in answers],
    )


@router.post("/v1/documents/{document_id}/quizzes", status_code=status.HTTP_201_CREATED)
async def create_quiz(
    document_id: UUID, body: QuizCreate, user: User, conn: Conn, settings: AppSettings
) -> QuizOut:
    doc = await study.ready_document(conn, user.id, document_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found or not ready yet")
    all_topics = await study.topics(conn, doc["source_file_id"])
    known = {t["id"]: t for t in all_topics}
    chosen = [known[t] for t in dict.fromkeys(body.topic_ids) if t in known] or all_topics
    if body.topic_ids and len(chosen) != len(set(body.topic_ids)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown topic")
    topic_ids = sorted(t["id"] for t in chosen)
    types = sorted(set(body.types))
    sf = str(doc["source_file_id"])

    def key(variant: int) -> str:
        return q.cache_key(
            sf, [str(t) for t in topic_ids], types, body.difficulty, body.count, variant
        )

    variant = 0
    existing = await quizzes.find_set(conn, key(0))
    if body.new_questions:
        while existing is not None:  # the next unused variant is a brand-new set
            variant += 1
            existing = await quizzes.find_set(conn, key(variant))
    if existing is None:
        limit = settings.daily_question_sets
        if await usage.take(conn, user.id, "question_set", limit, settings.timezone) is None:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"You've used today's {limit} quiz generations. Resets at 12:00 AM.",
            )
        existing = await quizzes.create_set(
            conn,
            doc["source_file_id"],
            key(variant),
            topic_ids,
            types,
            body.difficulty,
            body.count,
            variant,
        )
    elif existing["status"] == "failed":
        await quizzes.retry_set(conn, existing["id"])  # our failure: retry without using another
        existing = {**existing, "status": "pending"}
    if existing["status"] == "pending":
        await queue.enqueue(
            conn,
            "generate_questions",
            {"question_set_id": str(existing["id"])},
            user_id=user.id,
            dedupe_key=f"questions:{existing['id']}",
        )
    title = chosen[0]["title"] if len(chosen) == 1 and len(all_topics) > 1 else doc["title"]
    quiz_id = await quizzes.create_quiz(
        conn, user.id, document_id, existing["id"], title, body.mode
    )
    return await _quiz_out(conn, await quizzes.get_quiz(conn, user.id, quiz_id))


@router.get("/v1/quizzes/{quiz_id}")
async def get_quiz(quiz_id: UUID, user: User, conn: Conn) -> QuizOut:
    """Poll while questions are being written; includes them once ready."""
    row = await quizzes.get_quiz(conn, user.id, quiz_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz not found")
    return await _quiz_out(conn, row)


@router.post("/v1/quizzes/{quiz_id}/attempts", status_code=status.HTTP_201_CREATED)
async def start_attempt(quiz_id: UUID, body: AttemptStart, user: User, conn: Conn) -> AttemptOut:
    quiz = await quizzes.get_quiz(conn, user.id, quiz_id)
    if quiz is None or quiz["status"] != "ready":
        raise HTTPException(status.HTTP_409_CONFLICT, "This quiz isn't ready yet")
    existing = await quizzes.get_attempt(conn, user.id, body.id)
    if existing is not None and existing["quiz_id"] != quiz_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "That attempt belongs to another quiz")
    return await _attempt_out(
        conn, await quizzes.start_attempt(conn, user.id, quiz_id, body.id, body.mode)
    )


async def _attempt(conn, user_id: UUID, attempt_id: UUID) -> dict:
    row = await quizzes.get_attempt(conn, user_id, attempt_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attempt not found")
    return row


@router.put("/v1/attempts/{attempt_id}/answers")
async def save_answers(attempt_id: UUID, body: AnswersIn, user: User, conn: Conn) -> AttemptOut:
    """Saves answers as the student goes (idempotent; safe to resend after a dropped request)."""
    attempt = await _attempt(conn, user.id, attempt_id)
    if attempt["status"] == "completed":
        raise HTTPException(status.HTTP_409_CONFLICT, "This attempt is already submitted")
    await quizzes.save_answers(
        conn, attempt, [a.model_dump() for a in body.answers], body.current_index
    )
    return await _attempt_out(conn, await _attempt(conn, user.id, attempt_id))


@router.post("/v1/attempts/{attempt_id}/submit")
async def submit(attempt_id: UUID, body: AnswersIn, user: User, conn: Conn) -> AttemptOut:
    """Saves any last answers, then scores the attempt; unanswered questions score zero."""
    attempt = await _attempt(conn, user.id, attempt_id)
    if attempt["status"] != "completed":
        if body.answers:
            await quizzes.save_answers(conn, attempt, [a.model_dump() for a in body.answers], None)
        await quizzes.submit(conn, attempt)
    return await _attempt_out(conn, await _attempt(conn, user.id, attempt_id))


@router.get("/v1/attempts/{attempt_id}")
async def get_attempt(attempt_id: UUID, user: User, conn: Conn) -> AttemptOut:
    return await _attempt_out(conn, await _attempt(conn, user.id, attempt_id))
