-- D8e: past-question mode (FR-QGEN-09, DESIGN.md screens 26a/26b).
--
-- A past paper is uploaded and processed like notes, but it is never studied from, never shared
-- with coursemates and never used as answers. The `extract_style` job keeps only its style (question
-- types, marks, how questions are worded) in `paper_styles`; quizzes with that style write new
-- questions from the student's notes.
create type document_kind as enum ('notes', 'past_paper');

alter table documents
  add column kind document_kind not null default 'notes',
  add column paper_year text check (paper_year is null or char_length(paper_year) <= 10);

alter type job_type add value if not exists 'extract_style';

create table paper_styles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  course_id uuid references courses (id) on delete cascade,
  document_id uuid not null unique references documents (id) on delete cascade,
  year text,
  status generation_status not null default 'pending',
  -- {"types": {"theory": 0.7, ...}, "marks": {...}, "phrasing": [...], "instructions": "..."}
  style jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index paper_styles_course on paper_styles (user_id, course_id);
create trigger paper_styles_updated before update on paper_styles for each row execute function set_updated_at();
-- Read and written by the API only (FR-SEC-01): RLS on, no client policies.
alter table paper_styles enable row level security;

-- A question set written in a paper's style is its own cached set.
alter table question_sets add column style_id uuid references paper_styles (id) on delete set null;

-- Past papers stay with the student who uploaded them: shared courses never expose them.
create or replace function can_read_document(doc uuid, uid uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from documents d
    where d.id = doc and d.deleted_at is null
      and (
        d.user_id = uid
        or (
          d.status = 'ready' and d.course_id is not null and d.kind = 'notes'
          and exists (
            select 1 from course_shares s join course_members m on m.share_id = s.id
            where s.course_id = d.course_id and s.status = 'active'
              and m.user_id = uid and m.status = 'active'
          )
        )
      )
  )
$$;
revoke execute on function can_read_document(uuid, uuid) from public, anon, authenticated;

create or replace function readable_documents(uid uuid) returns setof uuid
language sql stable set search_path = public as $$
  select d.id from documents d where d.user_id = uid and d.deleted_at is null
  union
  select d.id
  from course_members m
  join course_shares s on s.id = m.share_id and s.status = 'active'
  join documents d on d.course_id = s.course_id and d.status = 'ready' and d.deleted_at is null
    and d.kind = 'notes'
  where m.user_id = uid and m.status = 'active'
$$;
revoke execute on function readable_documents(uuid) from public, anon, authenticated;
