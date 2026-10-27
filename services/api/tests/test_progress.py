"""Progress rules with fixed fixtures (FR-HOME-03, FR-HAB-01..03, FR-HAB-07)."""

from datetime import date, timedelta

import pytest

from app.domain import progress

MON = date(2026, 10, 26)  # a Monday


# --- topic mastery: recency-weighted accuracy of the last 10 answers -----------------------------


def test_unanswered_topics_have_zero_mastery():
    assert progress.topic_mastery([]) == 0.0


def test_newer_answers_count_more():
    # Same 2 right / 2 wrong, but getting the recent ones right scores higher.
    improving = progress.topic_mastery([0, 0, 1, 1])  # weights 1,2,3,4 → (3+4)/10
    slipping = progress.topic_mastery([1, 1, 0, 0])  # → (1+2)/10
    assert (improving, slipping) == (0.7, 0.3)


def test_only_the_last_ten_answers_count():
    old_mistakes = [0.0] * 20 + [1.0] * 10
    assert progress.topic_mastery(old_mistakes) == 1.0


def test_partial_marks_count_as_fractions():
    assert progress.answer_fraction(3, None, 5) == 0.6
    assert progress.answer_fraction(None, True, 1) == 1.0
    assert progress.answer_fraction(None, False, 1) == 0.0
    assert progress.answer_fraction(None, None, 5) is None  # still being marked
    assert progress.answer_fraction(7, None, 5) == 1.0  # never above full marks


@pytest.mark.parametrize(
    ("mastery", "answered", "mastered"),
    [(0.8, 5, True), (0.79, 10, False), (1.0, 4, False), (0.95, 12, True)],
)
def test_a_topic_is_mastered_at_80_percent_over_5_answers(mastery, answered, mastered):
    assert progress.is_mastered(mastery, answered) is mastered


# --- readiness: mastery weighted by topic length -------------------------------------------------


def test_readiness_weights_long_topics_more():
    # A long topic at 100% and a short one at 0%: 3000 / (3000 + 1000).
    assert progress.readiness([(3000, 1.0), (1000, 0.0)]) == 0.75


def test_unanswered_topics_pull_readiness_down_and_empty_courses_are_zero():
    assert progress.readiness([(500, 0.9), (500, 0.0)]) == 0.45
    assert progress.readiness([]) == 0.0
    assert progress.readiness([(0, 1.0), (0, 0.0)]) == 0.5  # no length known: equal weights


# --- Leitner boxes (Daily 5) ---------------------------------------------------------------------


def test_right_answers_move_up_a_box_with_longer_gaps():
    assert progress.leitner([(MON, True)]) == (2, MON + timedelta(days=3), True)
    history = [(MON, True), (MON + timedelta(3), True), (MON + timedelta(10), True)]
    assert progress.leitner(history) == (4, MON + timedelta(days=24), True)
    history.append((MON + timedelta(24), True))  # box 4 is the top
    assert progress.leitner(history)[0] == 4


def test_a_wrong_answer_goes_back_to_box_one():
    history = [(MON, True), (MON + timedelta(3), True), (MON + timedelta(10), False)]
    assert progress.leitner(history) == (1, MON + timedelta(days=11), False)


def test_replaying_the_same_history_gives_the_same_state():
    history = [(MON, False), (MON + timedelta(1), True)]
    assert progress.leitner(history) == progress.leitner(list(history))


# --- study days and the weekly goal --------------------------------------------------------------


@pytest.mark.parametrize(
    ("questions", "daily5", "reading", "counts"),
    [(5, False, 0, True), (4, False, 119, False), (0, True, 0, True), (0, False, 120, True)],
)
def test_a_study_day_needs_5_questions_the_daily_5_or_2_minutes_reading(
    questions, daily5, reading, counts
):
    assert progress.counts_as_study_day(questions, daily5, reading) is counts


def test_weeks_start_on_monday():
    assert progress.week_start(date(2026, 11, 1)) == MON  # Sunday
    assert progress.week_start(MON) == MON


def test_days_this_week_ignores_last_week():
    days = [MON - timedelta(1), MON, MON + timedelta(2)]
    assert progress.days_this_week(days, MON + timedelta(3)) == 2


def test_weeks_in_a_row_never_breaks_on_the_current_week():
    def week(start: date, n: int) -> list[date]:
        return [start + timedelta(i) for i in range(n)]

    last_three = (
        week(MON - timedelta(21), 4) + week(MON - timedelta(14), 4) + week(MON - timedelta(7), 5)
    )
    today = MON + timedelta(1)  # this week: 0 days so far, still counts as 3 in a row
    assert progress.weeks_in_a_row(last_three, 4, today) == 3
    assert progress.weeks_in_a_row(last_three + week(MON, 4), 4, MON + timedelta(4)) == 4


def test_one_short_week_ends_the_run_but_nothing_else_resets():
    days = [MON - timedelta(14) + timedelta(i) for i in range(4)]  # two weeks ago: met
    days += [MON - timedelta(7)]  # last week: 1 of 4
    assert progress.weeks_in_a_row(days, 4, MON) == 0


# --- theme unlocks -------------------------------------------------------------------------------


def test_theme_unlocks():
    assert progress.theme_unlocks(0, 0, 0) == []
    assert progress.theme_unlocks(1, 0, 0) == ["lagoon"]
    assert progress.theme_unlocks(10, 4, 3) == ["lagoon", "ankara", "palm", "lavender"]
