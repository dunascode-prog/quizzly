-- E4 Limits and plans (WEB.md §3 30e): values an admin changed while Quizzly runs. Only changed
-- keys have a row; everything else keeps the default from the environment. The API and worker
-- re-read it every minute (app/core/live_config.py), which checks each key and its bounds.
-- Changes are logged in admin_audit_log ('config.update', with the old and new value).
create table app_config (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table app_config enable row level security;  -- API only (FR-SEC-01)
revoke all on app_config from anon, authenticated, public;
