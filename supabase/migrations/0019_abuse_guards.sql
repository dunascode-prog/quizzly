-- Abuse guards (FR-SEC-20..22): requests per student per minute, pausing an account, and a daily
-- cap on profile photo changes.

alter type usage_resource add value if not exists 'avatar_upload';

-- A paused account can sign in but the API refuses its requests (FR-SEC-21). Set by an admin.
alter table profiles
  add column suspended_at timestamptz,
  add column suspended_reason text;

-- One row per student per minute, counted by the API (FR-SEC-20); old rows are deleted hourly.
create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (key, window_start)
);
-- Read and written by the API only (FR-SEC-01): RLS on, no client policies.
alter table rate_limits enable row level security;
