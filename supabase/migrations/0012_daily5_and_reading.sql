-- C4: Daily 5 as a quiz, and which topics a student has read (FR-HAB-01/02, FR-HOME-05).

-- A Daily 5 is a quiz over 5 hand-picked questions from any of the student's documents, so it can
-- use the normal play, submit and progress code. `question_ids` lists them in order; ordinary
-- quizzes leave it null and use their whole question set.
alter table quizzes
  add column kind text not null default 'quiz' check (kind in ('quiz', 'daily5')),
  add column question_ids uuid[],
  add column daily5_day date,
  add constraint quizzes_daily5_shape check (
    (kind = 'quiz' and question_ids is null and daily5_day is null)
    or (kind = 'daily5' and question_ids is not null and daily5_day is not null)
  );
create unique index quizzes_one_daily5_a_day on quizzes (user_id, daily5_day) where kind = 'daily5';

-- Reading time per topic, from batched app events (POST /events/reading). "Learn something new"
-- suggests the first topic not opened yet; study_days.reading_seconds counts towards a study day.
create table topic_reads (
  user_id uuid not null references profiles (id) on delete cascade,
  topic_id uuid not null references topics (id) on delete cascade,
  seconds int not null default 0,
  last_read_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);
alter table topic_reads enable row level security;
create policy "own reads" on topic_reads for select using (user_id = auth.uid());
revoke insert, update, delete, truncate, references, trigger on topic_reads from anon, authenticated;
revoke select on topic_reads from anon;
