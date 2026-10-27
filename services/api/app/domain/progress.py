"""Progress rules (FR-HOME-03, FR-HAB-01..03, FR-HAB-07): pure functions, so they can be tested
with fixed fixtures. The `update_mastery` job (app/worker/progress.py) feeds them from the
database and stores the results.
"""

from collections.abc import Iterable, Sequence
from datetime import date, timedelta

LAST_ANSWERS = 10  # topic mastery looks at the last 10 answers
MASTERED_AT = 0.8
MASTERED_MIN_ANSWERS = 5
LEITNER_GAPS = {1: 1, 2: 3, 3: 7, 4: 14}  # days until a question is due again, per box
STUDY_DAY_QUESTIONS = 5
STUDY_DAY_READING_SECONDS = 120
OBJECTIVE_TYPES = ("mcq", "true_false", "fill_blank")  # what the Daily 5 can ask
READINESS_UP = 0.10  # "readiness up 10 points" celebration (FR-HAB-05)


def answer_fraction(score: float | None, is_correct: bool | None, marks: int) -> float | None:
    """How right one answer was, 0–1. None while a written answer is still being marked."""
    if score is not None:
        return max(0.0, min(1.0, float(score) / max(marks, 1)))
    if is_correct is not None:
        return 1.0 if is_correct else 0.0
    return None


def topic_mastery(fractions: Sequence[float]) -> float:
    """Recency-weighted accuracy of the last 10 answers, oldest first: the newest answer weighs
    10, the one before 9, and so on. 0 when the topic hasn't been answered (FR-HOME-03)."""
    recent = list(fractions)[-LAST_ANSWERS:]
    if not recent:
        return 0.0
    weights = range(1, len(recent) + 1)
    return round(sum(w * f for w, f in zip(weights, recent, strict=True)) / sum(weights), 3)


def is_mastered(mastery: float, answered: int) -> bool:
    return mastery >= MASTERED_AT and answered >= MASTERED_MIN_ANSWERS


def readiness(topics: Iterable[tuple[int, float]]) -> float:
    """Mastery averaged over a course's topics, weighted by topic length (token count).
    Unanswered topics count as 0, so readiness grows as more of the course is covered."""
    total = weighted = 0.0
    for tokens, mastery in topics:
        w = max(tokens, 1)
        total += w
        weighted += w * mastery
    return round(weighted / total, 3) if total else 0.0


def leitner(history: Sequence[tuple[date, bool]]) -> tuple[int, date, bool]:
    """Replays a question's answers (oldest first) through the Leitner boxes: right moves up a
    box, wrong goes back to box 1 (FR-HAB-01). Returns (box, due_on, last_result). Replaying the
    whole history keeps the job idempotent: running it twice gives the same state."""
    if not history:
        raise ValueError("no answers to schedule")
    box = 1
    for _, correct in history:
        box = min(box + 1, 4) if correct else 1
    day, last = history[-1]
    return box, day + timedelta(days=LEITNER_GAPS[box]), last


def counts_as_study_day(questions: int, daily5_done: bool, reading_seconds: int) -> bool:
    """FR-HAB-02: at least 5 questions, the Daily 5, or 2 minutes of reading."""
    return (
        questions >= STUDY_DAY_QUESTIONS
        or daily5_done
        or reading_seconds >= STUDY_DAY_READING_SECONDS
    )


def week_start(day: date) -> date:
    """Monday of the week (FR-HOME-04 shows Mon–Sun)."""
    return day - timedelta(days=day.weekday())


def days_this_week(counted: Iterable[date], today: date) -> int:
    start = week_start(today)
    return sum(1 for d in set(counted) if start <= d <= today)


def weeks_in_a_row(counted: Iterable[date], goal: int, today: date) -> int:
    """Consecutive weeks that met the goal, ending last week, plus this week once it has met it.
    This week never breaks the run before it ends, and missing a day never resets anything
    (FR-HAB-03)."""
    per_week: dict[date, int] = {}
    for d in set(counted):
        per_week[week_start(d)] = per_week.get(week_start(d), 0) + 1
    this_week = week_start(today)
    run = 1 if per_week.get(this_week, 0) >= goal else 0
    week = this_week - timedelta(days=7)
    while per_week.get(week, 0) >= goal:
        run += 1
        week -= timedelta(days=7)
    return run


def theme_unlocks(mastered_topics: int, weeks_in_row: int, credited_invites: int) -> list[str]:
    """FR-HAB-07: Lagoon (first mastered topic), Ankara (10 mastered), Palm (weekly goal met
    4 weeks running), Lavender (3 friends joined through the student's invite)."""
    themes = []
    if mastered_topics >= 1:
        themes.append("lagoon")
    if mastered_topics >= 10:
        themes.append("ankara")
    if weeks_in_row >= 4:
        themes.append("palm")
    if credited_invites >= 3:
        themes.append("lavender")
    return themes
