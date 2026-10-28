-- D8b: flashcards (FR-QGEN-10, DESIGN.md screen 25).
--
-- A flashcard is a question of type 'flashcard' (stem = front, answer = {"text": back},
-- explanation = the one-line extra), generated and cached per topic like any question set. A
-- round is a quiz of kind 'flashcards' over that set, so the app reuses attempts, the offline
-- outbox and the progress job: "Didn't know" is a self-marked wrong answer, which puts the card in
-- review_queue box 1 and brings it back in the Daily 5. Self-ratings don't count towards topic
-- mastery or readiness (app/worker/progress.py).
alter type question_type add value if not exists 'flashcard';

alter table quizzes drop constraint if exists quizzes_kind_check;
alter table quizzes add constraint quizzes_kind_check check (kind in ('quiz', 'daily5', 'flashcards'));

alter table quizzes drop constraint quizzes_daily5_shape;
alter table quizzes add constraint quizzes_daily5_shape check (
  (kind in ('quiz', 'flashcards') and question_ids is null and daily5_day is null)
  or (kind = 'daily5' and question_ids is not null and daily5_day is not null)
);
