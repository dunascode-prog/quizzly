-- Plans v2 (FR-LIM-01/08, FR-PLAN-04..06): daily allowances roll over, the days a student runs out,
-- and plan reminders.

-- Each student's bank per resource: one day's allowance is added each day (their own midnight)
-- and unused allowance carries forward, up to a week's worth (FR-LIM-08). Written by the API only.
create table allowances (
  user_id uuid not null references profiles (id) on delete cascade,
  resource usage_resource not null,
  balance numeric(8, 2) not null,
  daily int not null,          -- the daily allowance when it was last topped up
  day date not null,           -- the student's day it was last topped up
  primary key (user_id, resource)
);
alter table allowances enable row level security;

-- Days a student ran out of something (for plan reminders, FR-PLAN-05).
create table limit_hits (
  user_id uuid not null references profiles (id) on delete cascade,
  day date not null,
  resource usage_resource not null,
  primary key (user_id, day, resource)
);
alter table limit_hits enable row level security;

alter type notification_type add value if not exists 'plan_reminder';
-- When the last plan reminder went out (at most one a week).
alter table profiles add column plan_reminded_at timestamptz;

-- Plan reminders can be turned off in Reminders (FR-PLAN-05); on by default.
alter table notification_settings alter column types set default
  '{"exam": true, "due": true, "recap": true, "mates": false, "ready": true, "plans": true}';
update notification_settings set types = types || '{"plans": true}' where not types ? 'plans';
