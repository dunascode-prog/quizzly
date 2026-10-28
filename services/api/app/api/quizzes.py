from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, StrictBool, StrictInt

from app.api.deps import AppSettings, Conn, User
from app.domain import quizzes, study, usage
from app.rag import questions as q
from app.worker import marking as marking_worker
from app.worker import queue

router = APIRouter(tags=["quizzes"])

ID_IN_USE = "That ID is already used by something else. Start again."

QuestionType = Literal["mcq", "true_false", "fill_blank", "short_answer", "theory"]


class QuizCreate(BaseModel):
    # Whole document when empty (FR-QGEN-01 defaults: whole document, MCQ, mixed, 10).
    topic_ids: list[UUID] = []
    types: list[QuestionType] = Field(default=["mcq"], min_length=1)
    difficulty: Literal["easy", "medium", "hard", "mixed"] = "mixed"
    count: Literal[5, 10, 20, 30] = 10
    mode: Literal["practice", "exam"] = "practice"
    # A fresh set instead of the cached one; uses a question set from the allowance.
    new_questions: bool = False
    # Exam mode only: unanswered questions score zero when time runs out (FR-QUIZ-02).
    time_limit_min: int | None = Field(default=None, ge=1, le=180)


class QuestionOut(BaseModel):
    id: UUID
    ordinal: int
    type: str
    difficulty: str
    stem: str
    options: list[str] | None
    # Sent with the question so the app can mark instantly and offline (FR-QUIZ-03). Exam quizzes
    # leave these (and the rubric) out until the student has submitted an attempt (FR-SEC-12).
    answer: object | None
    explanation: str | None
    source_pages: list[int]
    topic_id: UUID | None
    topic_title: str | None
    marks: int
    # Short answer and theory: {"criteria": [{"criterion", "marks"}]} (FR-QGEN-06).
    rubric: dict | None = None


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
    # Waiting because every AI provider is busy or the day's budget is spent (FR-LIM-03).
    busy: bool = False
    time_limit_sec: int | None
    questions: list[QuestionOut]
    # "daily5" for the Daily 5 (FR-HAB-01): the app shows screen 15 when it's done.
    kind: str = "quiz"


class AttemptStart(BaseModel):
    id: UUID  # chosen by the app, so a retried request can't create a second attempt
    mode: Literal["practice", "exam"] = "practice"


class AnswerIn(BaseModel):
    id: UUID
    question_id: UUID
    # Written answers up to 5,000 characters (FR-SEC-10).
    # Strict types: a true/false answer must stay a bool and an option index an int; a lax
    # union turned `true` into 1, which never matches a true/false key.
    response: StrictBool | StrictInt | Annotated[str, Field(max_length=5000)] = Field(
        union_mode="left_to_right"
    )


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
    # Null while a written answer waits for marking.
    score: float | None
    # Written answers: per-criterion marks, a summary and the model answer (FR-QUIZ-04).
    feedback: dict | None


class AttemptSummary(BaseModel):
    id: UUID
    quiz_id: UUID
    title: str
    document_id: UUID
    mode: str
    status: str
    started_at: datetime
    submitted_at: datetime | None
    current_index: int
    question_count: int
    score: float | None
    max_score: float | None
    kind: str = "quiz"  # "flashcards" rounds open screen 25, not the quiz player


class WeakTopic(BaseModel):
    topic_id: str
    title: str | None
    document_id: UUID
    score: float
    max: float


class PracticeOut(BaseModel):
    attempts: list[AttemptSummary]
    # The three weakest topics across recent quizzes (FR-QUIZ-07).
    weak_topics: list[WeakTopic]


class AttemptOut(BaseModel):
    id: UUID
    quiz_id: UUID
    title: str
    mode: str
    status: str
    started_at: datetime
    submitted_at: datetime | None
    current_index: int
    document_id: UUID
    time_limit_sec: int | None
    score: float | None
    max_score: float | None
    topics: list[TopicResult]
    # Up to three topics below 100%, weakest first: "Revise next" (FR-QUIZ-06/07).
    weakest: list[TopicResult]
    answers: list[AnswerOut]


def _notice(row: dict) -> str | None:
    if row["status"] == "ready" and row["generated_count"] < row["requested_count"]:
        what = "cards" if row.get("kind") == "flashcards" else "questions"
        return (
            f"We made {row['generated_count']} good {what} out of {row['requested_count']} "
            "— your notes on this topic are short."
        )
    return None


async def _quiz_out(conn, row: dict, user_id: UUID) -> QuizOut:
    qs = (
        await quizzes.questions_for(conn, row["question_set_id"], row.get("question_ids"))
        if row["status"] == "ready"
        else []
    )
    hidden = row["mode"] == "exam" and not await quizzes.has_submitted(conn, user_id, row["id"])
    if hidden:
        qs = [x | {"answer": None, "explanation": None, "rubric": None} for x in qs]
    return QuizOut(
        **{k: row[k] for k in ("id", "title", "document_id", "mode", "status", "progress")},
        requested_count=row["requested_count"],
        generated_count=row["generated_count"],
        notice=_notice(row),
        busy=bool(row.get("busy")),
        time_limit_sec=row["time_limit_sec"],
        questions=[QuestionOut(**x) for x in qs],
        kind=row.get("kind") or "quiz",
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
                "document_id",
                "time_limit_sec",
            )
        },
        score=float(row["score"]) if row["score"] is not None else None,
        max_score=float(row["max_score"]) if row["max_score"] is not None else None,
        topics=topics,
        weakest=weakest,
        answers=[AnswerOut(**a) for a in answers],
    )


async def _question_set(
    conn,
    user_id: UUID,
    settings,
    source_file_id: UUID,
    topic_ids: list[UUID],
    types: list[str],
    difficulty: str,
    count: int,
    new_questions: bool = False,
) -> dict:
    """The cached set for these choices (FR-QGEN-07), or a new one from today's allowance; queues
    generation when it isn't written yet."""
    sf = str(source_file_id)

    def key(variant: int) -> str:
        return q.cache_key(sf, [str(t) for t in topic_ids], types, difficulty, count, variant)

    variant = 0
    existing = await quizzes.find_set(conn, key(0))
    if new_questions:
        while existing is not None:  # the next unused variant is a brand-new set
            variant += 1
            existing = await quizzes.find_set(conn, key(variant))
    if existing is None:
        limit = settings.daily_question_sets
        if await usage.take(conn, user_id, "question_set", limit, settings.timezone) is None:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"You've used today's {limit} quiz generations. Resets at 12:00 AM.",
            )
        existing = await quizzes.create_set(
            conn, source_file_id, key(variant), topic_ids, types, difficulty, count, variant
        )
    elif existing["status"] == "failed":
        await quizzes.retry_set(conn, existing["id"])  # our failure: retry without using another
        existing = {**existing, "status": "pending"}
    if existing["status"] == "pending":
        await queue.enqueue(
            conn,
            "generate_questions",
            {"question_set_id": str(existing["id"])},
            user_id=user_id,
            dedupe_key=f"questions:{existing['id']}",
        )
    return existing


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
    existing = await _question_set(
        conn,
        user.id,
        settings,
        doc["source_file_id"],
        topic_ids,
        sorted(set(body.types)),
        body.difficulty,
        body.count,
        body.new_questions,
    )
    title = chosen[0]["title"] if len(chosen) == 1 and len(all_topics) > 1 else doc["title"]
    limit_sec = body.time_limit_min * 60 if body.mode == "exam" and body.time_limit_min else None
    quiz_id = await quizzes.create_quiz(
        conn, user.id, document_id, existing["id"], title, body.mode, limit_sec
    )
    return await _quiz_out(conn, await quizzes.get_quiz(conn, user.id, quiz_id), user.id)


FLASHCARDS_PER_TOPIC = 20


class FlashcardsCreate(BaseModel):
    topic_id: UUID


@router.post("/v1/documents/{document_id}/flashcards", status_code=status.HTTP_201_CREATED)
async def create_flashcards(
    document_id: UUID, body: FlashcardsCreate, user: User, conn: Conn, settings: AppSettings
) -> QuizOut:
    """A round of flashcards for one topic (FR-QGEN-10, screen 25): a cached set of front/back
    cards, played as a practice-only quiz of kind "flashcards". Rating a card is its answer."""
    doc = await study.ready_document(conn, user.id, document_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found or not ready yet")
    topic = next(
        (t for t in await study.topics(conn, doc["source_file_id"]) if t["id"] == body.topic_id),
        None,
    )
    if topic is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown topic")
    existing = await _question_set(
        conn,
        user.id,
        settings,
        doc["source_file_id"],
        [topic["id"]],
        [q.FLASHCARD],
        "mixed",
        FLASHCARDS_PER_TOPIC,
    )
    quiz_id = await quizzes.create_quiz(
        conn, user.id, document_id, existing["id"], topic["title"], "practice", kind="flashcards"
    )
    return await _quiz_out(conn, await quizzes.get_quiz(conn, user.id, quiz_id), user.id)


@router.get("/v1/quizzes/{quiz_id}")
async def get_quiz(quiz_id: UUID, user: User, conn: Conn) -> QuizOut:
    """Poll while questions are being written; includes them once ready."""
    row = await quizzes.get_quiz(conn, user.id, quiz_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz not found")
    return await _quiz_out(conn, row, user.id)


@router.post("/v1/quizzes/{quiz_id}/attempts", status_code=status.HTTP_201_CREATED)
async def start_attempt(quiz_id: UUID, body: AttemptStart, user: User, conn: Conn) -> AttemptOut:
    quiz = await quizzes.get_quiz(conn, user.id, quiz_id)
    if quiz is None or quiz["status"] != "ready":
        raise HTTPException(status.HTTP_409_CONFLICT, "This quiz isn't ready yet")
    existing = await quizzes.get_attempt(conn, user.id, body.id)
    if existing is not None and existing["quiz_id"] != quiz_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "That attempt belongs to another quiz")
    started = await quizzes.start_attempt(conn, user.id, quiz_id, body.id, body.mode)
    if started is None:  # the id is someone else's attempt (FR-SEC-18)
        raise HTTPException(status.HTTP_409_CONFLICT, ID_IN_USE)
    return await _attempt_out(conn, started)


TIME_GRACE = timedelta(seconds=60)  # network delay after the app's timer hits zero


def _time_up(attempt: dict) -> bool:
    """A timed exam stops accepting answers shortly after its limit (FR-QUIZ-02)."""
    limit = attempt.get("time_limit_sec")
    if attempt["mode"] != "exam" or not limit:
        return False
    return datetime.now(UTC) > attempt["started_at"] + timedelta(seconds=limit) + TIME_GRACE


async def _queue_marking(conn, user_id: UUID, attempt_id: UUID, settings) -> None:
    """Queues LLM marking for written answers not yet marked. The daily allowance is used only
    when an answer is newly queued, so resending a save never counts twice (FR-LIM-01)."""
    for question_id in await quizzes.pending_marking(conn, attempt_id):
        job_id = await queue.enqueue(
            conn,
            "mark_answers",
            {"attempt_id": str(attempt_id), "question_id": str(question_id)},
            user_id=user_id,
            dedupe_key=f"mark:{attempt_id}:{question_id}",
        )
        if job_id is None:
            continue  # already queued or being marked
        limit = settings.daily_markings
        if await usage.take(conn, user_id, "marking", limit, settings.timezone) is None:
            await conn.execute("update jobs set status = 'cancelled' where id = %s", (job_id,))
            await quizzes.record_marking(
                conn,
                attempt_id,
                question_id,
                0,
                None,
                marking_worker.not_marked(
                    "limit",
                    f"You've used today's {limit} answer markings. Resets at 12:00 AM. "
                    "Compare your answer with the model answer.",
                ),
            )
    await quizzes.finish_if_marked(conn, attempt_id)


async def _attempt(conn, user_id: UUID, attempt_id: UUID) -> dict:
    row = await quizzes.get_attempt(conn, user_id, attempt_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attempt not found")
    return row


@router.put("/v1/attempts/{attempt_id}/answers")
async def save_answers(
    attempt_id: UUID, body: AnswersIn, user: User, conn: Conn, settings: AppSettings
) -> AttemptOut:
    """Saves answers as the student goes (idempotent; safe to resend after a dropped request).
    In practice mode written answers are marked straight away; in exam mode after submitting."""
    attempt = await _attempt(conn, user.id, attempt_id)
    if attempt["status"] != "in_progress":
        raise HTTPException(status.HTTP_409_CONFLICT, "This attempt is already submitted")
    if _time_up(attempt):
        raise HTTPException(status.HTTP_409_CONFLICT, "Time is up for this exam")
    try:
        await quizzes.save_answers(
            conn, attempt, [a.model_dump() for a in body.answers], body.current_index
        )
    except quizzes.IdInUse as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, ID_IN_USE) from exc
    if attempt["mode"] == "practice":
        await _queue_marking(conn, user.id, attempt_id, settings)
    return await _attempt_out(conn, await _attempt(conn, user.id, attempt_id))


@router.post("/v1/attempts/{attempt_id}/submit")
async def submit(
    attempt_id: UUID, body: AnswersIn, user: User, conn: Conn, settings: AppSettings
) -> AttemptOut:
    """Saves any last answers, then scores the attempt; unanswered questions score zero. With
    written answers still to mark it stays 'marking' until the worker has marked them."""
    attempt = await _attempt(conn, user.id, attempt_id)
    if attempt["status"] == "in_progress":
        if body.answers and not _time_up(attempt):  # late answers score zero
            try:
                await quizzes.save_answers(
                    conn, attempt, [a.model_dump() for a in body.answers], None
                )
            except quizzes.IdInUse as exc:
                raise HTTPException(status.HTTP_409_CONFLICT, ID_IN_USE) from exc
        await quizzes.submit(conn, attempt)
        await _queue_marking(conn, user.id, attempt_id, settings)
    return await _attempt_out(conn, await _attempt(conn, user.id, attempt_id))


@router.get("/v1/practice")
async def practice(user: User, conn: Conn) -> PracticeOut:
    """The Practice tab: recent attempts (in-progress ones can be resumed) and weak topics."""
    attempts = await quizzes.list_attempts(conn, user.id)
    return PracticeOut(
        attempts=[
            AttemptSummary(
                **{k: v for k, v in a.items() if k not in ("score", "max_score")},
                score=float(a["score"]) if a["score"] is not None else None,
                max_score=float(a["max_score"]) if a["max_score"] is not None else None,
            )
            for a in attempts
        ],
        weak_topics=[
            WeakTopic(**{**t, "score": float(t["score"]), "max": float(t["max"])})
            for t in await quizzes.weak_topics(conn, user.id)
        ],
    )


@router.get("/v1/attempts/{attempt_id}")
async def get_attempt(attempt_id: UUID, user: User, conn: Conn) -> AttemptOut:
    return await _attempt_out(conn, await _attempt(conn, user.id, attempt_id))
