-- FR-SEC-01 / DATA_MODELS §5: the app is read-only on the database. Every insert, update and
-- delete goes through the API (service role), which checks ownership. Before this, the default
-- Supabase grants plus `for all` policies let a signed-in user write their own rows directly
-- with the public key (e.g. edit quiz answers or a document's source file), skipping the API.

-- 1. No client writes on any table. TRUNCATE ignores row-level security, so it goes too.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from anon, authenticated;

-- 2. Signed-out clients may only read the school list (onboarding search).
revoke select on all tables in schema public from anon;
grant select on institutions to anon;

-- 3. Tables created by later migrations start read-only for clients too.
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public revoke select on tables from anon;

-- 4. Policies: select only, own rows only.
drop policy "own profile" on profiles;
create policy "own profile" on profiles for select using (id = auth.uid());

drop policy "own courses" on courses;
create policy "own courses" on courses for select using (user_id = auth.uid());

drop policy "own documents" on documents;
create policy "own documents" on documents for select using (user_id = auth.uid());

drop policy "own topic overrides" on topic_overrides;
create policy "own topic overrides" on topic_overrides for select using (user_id = auth.uid());

drop policy "own quizzes" on quizzes;
create policy "own quizzes" on quizzes for select using (user_id = auth.uid());

drop policy "own attempts" on quiz_attempts;
create policy "own attempts" on quiz_attempts for select using (user_id = auth.uid());

drop policy "own answers" on attempt_answers;
create policy "own answers" on attempt_answers for select
  using (exists (select 1 from quiz_attempts a where a.id = attempt_id and a.user_id = auth.uid()));

drop policy "own threads" on chat_threads;
create policy "own threads" on chat_threads for select using (user_id = auth.uid());

drop policy "own reports" on reports;
create policy "own reports" on reports for select using (user_id = auth.uid());

drop policy "own feedback" on feedback;
create policy "own feedback" on feedback for select using (user_id = auth.uid());

drop policy "own push tokens" on push_tokens;
create policy "own push tokens" on push_tokens for select using (user_id = auth.uid());

-- Unchanged and already select-only: "institutions readable", "own messages", "own usage".
-- Shared and operational tables (source_files, pages, chunks, topics, explanations,
-- question_sets, questions, jobs, llm_calls, provider_limits, worker_heartbeats) keep RLS on
-- with no policies: no client access at all.
