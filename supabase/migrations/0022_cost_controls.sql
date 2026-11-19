-- Cost controls (FR-LIM-05..07): what each student's AI use would cost on paid tiers, per month,
-- for the monthly ceilings; paid plans' jobs go first in the queue with fair turns per student.

create table ai_spend (
  user_id uuid not null references profiles (id) on delete cascade,
  month date not null,  -- first day of the month (UTC)
  micro_usd bigint not null default 0,
  primary key (user_id, month)
);
-- Read and written by the API and worker only (FR-SEC-01): RLS on, no client policies.
alter table ai_spend enable row level security;

-- The reference cost of each call (list price even while we run on free tiers).
alter table llm_calls add column ref_cost_usd numeric(10,6) not null default 0;

alter table jobs add column priority smallint not null default 0;  -- 1 = paid plan (FR-LIM-07)
create index jobs_user_status on jobs (user_id, status);
