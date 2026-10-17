-- Quizzly initial schema. See docs/DATA_MODELS.md for the meaning of each table.

create extension if not exists vector;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type explanation_style as enum ('standard', 'simple', 'exam');
create type plan as enum ('free', 'premium');
create type institution_type as enum ('university', 'polytechnic', 'college_of_education', 'other');
create type institution_ownership as enum ('federal', 'state', 'private');
create type processing_status as enum ('pending', 'processing', 'ready', 'failed');
create type failure_reason as enum ('encrypted', 'corrupt', 'no_text', 'too_large', 'blocked', 'internal');
create type document_status as enum ('awaiting_upload', 'uploaded', 'processing', 'ready', 'failed');
create type extraction_method as enum ('text', 'ocr');
create type generation_status as enum ('pending', 'generating', 'ready', 'failed');
create type question_type as enum ('mcq', 'true_false', 'fill_blank', 'short_answer', 'theory');
create type difficulty as enum ('easy', 'medium', 'hard', 'mixed');
create type quiz_mode as enum ('practice', 'exam');
create type attempt_status as enum ('in_progress', 'submitted', 'marking', 'completed');
create type marked_by as enum ('device', 'server', 'llm');
create type chat_role as enum ('user', 'assistant');
create type report_target as enum ('question', 'explanation', 'chat_message');
create type report_reason as enum ('wrong', 'unclear', 'inappropriate', 'other');
create type report_status as enum ('open', 'resolved', 'dismissed');
create type job_type as enum (
  'ingest_document', 'build_outline', 'generate_explanation', 'generate_questions',
  'mark_answers', 'delete_account', 'purge_source_file'
);
create type job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type usage_resource as enum ('upload', 'question_set', 'explanation', 'chat_message', 'marking');

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
create table institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text,
  type institution_type not null,
  ownership institution_ownership,
  state text,
  created_at timestamptz not null default now()
);
create index institutions_name_trgm on institutions using gin (name gin_trgm_ops);
create index institutions_short_trgm on institutions using gin (short_name gin_trgm_ops);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  institution_id uuid references institutions (id),
  institution_other text,
  department text,
  level text check (level in ('100L','200L','300L','400L','500L','600L','700L','other')),
  explanation_style explanation_style not null default 'standard',
  plan plan not null default 'free',
  terms_version text,
  terms_accepted_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Organisation
-- ---------------------------------------------------------------------------
create table courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  code text not null check (char_length(code) between 2 and 12),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index courses_user_code on courses (user_id, upper(code));
create trigger courses_updated before update on courses for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Shared content (keyed by file hash)
-- ---------------------------------------------------------------------------
create table source_files (
  id uuid primary key default gen_random_uuid(),
  sha256 text not null unique,
  mime_type text not null,
  size_bytes bigint not null,
  page_count int,
  storage_path text not null,
  status processing_status not null default 'pending',
  failure_reason failure_reason,
  low_ocr_pages int[] not null default '{}',
  embedding_model text,
  pipeline_version int not null default 1,
  blocked boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger source_files_updated before update on source_files for each row execute function set_updated_at();

create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  course_id uuid references courses (id) on delete set null,
  source_file_id uuid references source_files (id) on delete set null,
  title text not null,
  original_filename text not null,
  upload_path text not null,
  status document_status not null default 'awaiting_upload',
  failure_reason text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_user on documents (user_id, created_at desc);
create index documents_source on documents (source_file_id);
create trigger documents_updated before update on documents for each row execute function set_updated_at();

create table pages (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid not null references source_files (id) on delete cascade,
  page_number int not null,
  text text not null default '',
  extraction_method extraction_method not null,
  ocr_confidence real,
  created_at timestamptz not null default now(),
  unique (source_file_id, page_number)
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid not null references source_files (id) on delete cascade,
  parent_id uuid references topics (id) on delete cascade,
  ordinal int not null,
  title text not null,
  summary text,
  page_start int,
  page_end int,
  token_count int not null default 0,
  from_heading boolean not null default false,
  created_at timestamptz not null default now()
);
create index topics_source on topics (source_file_id, ordinal);

create table chunks (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid not null references source_files (id) on delete cascade,
  topic_id uuid references topics (id) on delete set null,
  ordinal int not null,
  page_start int not null,
  page_end int not null,
  content text not null,
  token_count int not null,
  embedding vector(384),
  tsv tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now()
);
create index chunks_source on chunks (source_file_id, ordinal);
create index chunks_topic on chunks (topic_id);
create index chunks_embedding on chunks using hnsw (embedding vector_cosine_ops);
create index chunks_tsv on chunks using gin (tsv);

create table topic_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  topic_id uuid not null references topics (id) on delete cascade,
  title text,
  merged_into_topic_id uuid references topics (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, topic_id)
);

-- ---------------------------------------------------------------------------
-- Generated learning content (shared)
-- ---------------------------------------------------------------------------
create table explanations (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid not null references source_files (id) on delete cascade,
  topic_id uuid not null references topics (id) on delete cascade,
  style explanation_style not null,
  prompt_version int not null,
  content_md text,
  citations jsonb not null default '[]',
  model text,
  status generation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (topic_id, style, prompt_version)
);
create trigger explanations_updated before update on explanations for each row execute function set_updated_at();

create table question_sets (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid not null references source_files (id) on delete cascade,
  cache_key text not null unique,
  topic_ids uuid[] not null,
  question_types question_type[] not null,
  difficulty difficulty not null,
  requested_count int not null check (requested_count in (5, 10, 20, 30)),
  generated_count int not null default 0,
  variant int not null default 0,
  prompt_version int not null,
  status generation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger question_sets_updated before update on question_sets for each row execute function set_updated_at();

create table questions (
  id uuid primary key default gen_random_uuid(),
  question_set_id uuid not null references question_sets (id) on delete cascade,
  topic_id uuid references topics (id) on delete set null,
  ordinal int not null,
  type question_type not null,
  difficulty difficulty not null,
  stem text not null,
  options jsonb,
  answer jsonb not null,
  explanation text not null,
  rubric jsonb,
  marks int not null default 1,
  source_chunk_ids uuid[] not null,
  source_pages int[] not null check (cardinality(source_pages) >= 1),
  embedding vector(384),
  report_count int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index questions_set on questions (question_set_id, ordinal);

-- ---------------------------------------------------------------------------
-- Practice (user-owned)
-- ---------------------------------------------------------------------------
create table quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  question_set_id uuid not null references question_sets (id) on delete restrict,
  title text not null,
  mode_default quiz_mode not null default 'practice',
  time_limit_sec int,
  created_at timestamptz not null default now()
);
create index quizzes_user on quizzes (user_id, created_at desc);

create table quiz_attempts (
  id uuid primary key,  -- generated on the device for idempotent sync
  user_id uuid not null references profiles (id) on delete cascade,
  quiz_id uuid not null references quizzes (id) on delete cascade,
  mode quiz_mode not null,
  status attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  current_index int not null default 0,
  score numeric,
  max_score numeric,
  topic_breakdown jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quiz_attempts_user on quiz_attempts (user_id, started_at desc);
create trigger quiz_attempts_updated before update on quiz_attempts for each row execute function set_updated_at();

create table attempt_answers (
  id uuid primary key,  -- generated on the device
  attempt_id uuid not null references quiz_attempts (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  response jsonb not null,
  is_correct boolean,
  score numeric,
  feedback jsonb,
  marked_by marked_by,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- ---------------------------------------------------------------------------
-- Chat (user-owned)
-- ---------------------------------------------------------------------------
create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  document_id uuid not null references documents (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_threads_user on chat_threads (user_id, updated_at desc);
create trigger chat_threads_updated before update on chat_threads for each row execute function set_updated_at();

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads (id) on delete cascade,
  role chat_role not null,
  content text not null,
  citations jsonb not null default '[]',
  grounded boolean,
  model text,
  created_at timestamptz not null default now()
);
create index chat_messages_thread on chat_messages (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- Quality and moderation
-- ---------------------------------------------------------------------------
create table reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  target_type report_target not null,
  target_id uuid not null,
  reason report_reason not null,
  note text,
  status report_status not null default 'open',
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  target_type report_target not null check (target_type <> 'question'),
  target_id uuid not null,
  rating smallint not null check (rating in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------
create table jobs (
  id uuid primary key default gen_random_uuid(),
  type job_type not null,
  user_id uuid references profiles (id) on delete set null,
  payload jsonb not null default '{}',
  status job_status not null default 'queued',
  progress smallint not null default 0,
  attempts int not null default 0,
  max_attempts int not null default 5,
  run_after timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  dedupe_key text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_ready on jobs (status, run_after);
create unique index jobs_dedupe_active on jobs (dedupe_key) where status in ('queued', 'running');
create trigger jobs_updated before update on jobs for each row execute function set_updated_at();

create table llm_calls (
  id bigint generated always as identity primary key,
  job_id uuid references jobs (id) on delete set null,
  user_id uuid,
  task text not null,
  provider text not null,
  model text not null,
  prompt_tokens int,
  completion_tokens int,
  latency_ms int,
  cost_usd numeric(10, 6) not null default 0,
  status text not null,
  created_at timestamptz not null default now()
);
create index llm_calls_day on llm_calls (created_at);

create table usage_counters (
  user_id uuid not null references profiles (id) on delete cascade,
  day date not null,
  resource usage_resource not null,
  count int not null default 0,
  primary key (user_id, day, resource)
);

create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  expo_token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table provider_limits (
  provider_model text primary key,
  window_start timestamptz not null default now(),
  requests int not null default 0,
  tokens int not null default 0,
  circuit_open_until timestamptz
);

create table worker_heartbeats (
  worker_id text primary key,
  last_beat_at timestamptz not null default now()
);

create view daily_llm_cost as
select date_trunc('day', created_at) as day, provider, model,
       count(*) as calls,
       sum(coalesce(prompt_tokens, 0) + coalesce(completion_tokens, 0)) as tokens,
       sum(cost_usd) as cost_usd
from llm_calls
group by 1, 2, 3;

-- ---------------------------------------------------------------------------
-- Row-level security
-- The API uses the service role (bypasses RLS) and checks ownership in code.
-- These policies are the second line of defence for any direct client access.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table institutions enable row level security;
alter table courses enable row level security;
alter table documents enable row level security;
alter table topic_overrides enable row level security;
alter table quizzes enable row level security;
alter table quiz_attempts enable row level security;
alter table attempt_answers enable row level security;
alter table chat_threads enable row level security;
alter table chat_messages enable row level security;
alter table reports enable row level security;
alter table feedback enable row level security;
alter table push_tokens enable row level security;
alter table usage_counters enable row level security;

-- Shared and operational tables: no client access at all (RLS on, no policies).
alter table source_files enable row level security;
alter table pages enable row level security;
alter table chunks enable row level security;
alter table topics enable row level security;
alter table explanations enable row level security;
alter table question_sets enable row level security;
alter table questions enable row level security;
alter table jobs enable row level security;
alter table llm_calls enable row level security;
alter table provider_limits enable row level security;
alter table worker_heartbeats enable row level security;

create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "institutions readable" on institutions for select using (true);
create policy "own courses" on courses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own documents" on documents for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own topic overrides" on topic_overrides for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own quizzes" on quizzes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own attempts" on quiz_attempts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own answers" on attempt_answers for all
  using (exists (select 1 from quiz_attempts a where a.id = attempt_id and a.user_id = auth.uid()))
  with check (exists (select 1 from quiz_attempts a where a.id = attempt_id and a.user_id = auth.uid()));
create policy "own threads" on chat_threads for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own messages" on chat_messages for select
  using (exists (select 1 from chat_threads t where t.id = thread_id and t.user_id = auth.uid()));
create policy "own reports" on reports for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own feedback" on feedback for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own push tokens" on push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own usage" on usage_counters for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage bucket (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 26214400)
on conflict (id) do nothing;
