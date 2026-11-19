-- E4 Reports and Takedowns (WEB.md §3 30c/30d, FR-MOD-01/02/04).

-- The takedown log: what was taken down, why, for whom, by which admin, and whether it was reversed.
create table takedowns (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('file', 'course')),
  target text not null,           -- a file's SHA-256, or a share code
  reason text not null check (reason in ('copyright', 'inappropriate', 'other')),
  requested_by text,              -- who asked (a lecturer, a school), as the admin typed it
  note text,                      -- internal, never shown to students
  students_affected int not null default 0,
  admin_id uuid not null,
  status text not null default 'active' check (status in ('active', 'reversed')),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid
);
create index takedowns_recent on takedowns (created_at desc);
alter table takedowns enable row level security;  -- API only (FR-SEC-01)
revoke all on takedowns from anon, authenticated, public;

-- "Thanks for your report: we fixed it" for students whose report led to a fix.
alter type notification_type add value if not exists 'report_resolved';
