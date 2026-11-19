-- E4 (WEB.md §3, admin security): every admin write and every view of student data is logged.
-- Written by the API only, with the admin's user id from their verified token. Rows are never
-- updated or deleted by the app, so the log can be trusted after the fact.
create table admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid not null,  -- auth.users id; no foreign key, so the log outlives a removed admin
  action text not null,    -- e.g. 'students.list', 'reports.dismiss', 'config.update'
  target text,             -- what it acted on: an id, a code or a search
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index admin_audit_log_recent on admin_audit_log (created_at desc);

-- Read and written by the API only (FR-SEC-01): RLS on, no client policies.
alter table admin_audit_log enable row level security;
revoke all on admin_audit_log from anon, authenticated, public;
