-- v0.2 engagement and sharing (BUILD_PLAN C1; DATA_MODELS §2.9–2.12, §5). Progress, sharing,
-- notifications and invites. Like every table since 0005, the app may only read its own rows;
-- all writes go through the API or worker (service role).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type accent as enum ('ink', 'lagoon', 'ankara', 'palm', 'lavender');
create type share_permission as enum ('coursemates', 'code', 'nobody');
create type achievement_kind as enum (
  'topic_mastered', 'personal_best', 'readiness_up', 'weekly_goal', 'theme_unlocked'
);
create type share_status as enum ('active', 'revoked', 'taken_down');
create type member_source as enum ('in_app', 'link');
create type member_status as enum ('pending', 'active', 'declined', 'left', 'removed');
-- FR-NOTIF-01, exactly.
create type notification_type as enum (
  'course_shared', 'shared_course_updated', 'share_revoked', 'share_member_joined',
  'document_ready', 'document_failed', 'quiz_ready', 'recap_ready',
  'reminder_exam', 'reminder_due', 'invite_joined', 'course_unavailable'
);
create type referral_channel as enum ('link', 'play_referrer', 'share_link');
create type referral_status as enum ('pending', 'credited', 'rejected');

-- New jobs and daily limits (DATA_MODELS §2.8). Not used below: Postgres can't use an enum value
-- in the transaction that adds it.
alter type job_type add value if not exists 'send_push';
alter type job_type add value if not exists 'schedule_reminders';
alter type job_type add value if not exists 'weekly_recap';
alter type job_type add value if not exists 'update_mastery';
alter type job_type add value if not exists 'fan_out_share_update';
alter type job_type add value if not exists 'credit_referral';
alter type usage_resource add value if not exists 'share_recipient';
alter type usage_resource add value if not exists 'reminder_push';

-- ---------------------------------------------------------------------------
-- Profile and course columns
-- ---------------------------------------------------------------------------
alter table profiles
  add column display_name text,
  add column timezone text not null default 'Africa/Lagos',
  add column weekly_goal_days smallint not null default 4 check (weekly_goal_days between 1 and 7),
  add column accent accent not null default 'ink',
  add column night_mode boolean not null default true,
  add column low_data_mode boolean not null default false,
  add column share_permission share_permission not null default 'code',
  add column show_identity_on_links boolean not null default true,
  add column invite_code text;
create unique index profiles_invite_code_key on profiles (upper(invite_code));

alter table courses
  add column exam_date date,
  add column accent accent;

-- "Ada O.": the only name other students ever see (CLAUDE.md, FR-SHARE).
create or replace function display_name_for(full_name text) returns text
language plpgsql immutable as $$
declare
  parts text[] := regexp_split_to_array(trim(coalesce(full_name, '')), '\s+');
  n int := coalesce(array_length(parts, 1), 0);
begin
  if n = 0 or parts[1] = '' then return null; end if;
  parts[1] := upper(left(parts[1], 1)) || substr(parts[1], 2);
  if n = 1 then return parts[1]; end if;
  return parts[1] || ' ' || upper(left(parts[n], 1)) || '.';
end $$;

-- "TOLU7": up to 4 letters of the first name plus digits, unique ignoring case.
create or replace function new_invite_code(full_name text) returns text
language plpgsql volatile as $$
declare
  stem text := left(upper(regexp_replace(split_part(trim(coalesce(full_name, '')), ' ', 1),
                                         '[^A-Za-z]', '', 'g')), 4);
  candidate text;
  digits int := 1;
begin
  if length(stem) < 2 then stem := 'QZ'; end if;
  for attempt in 1..40 loop
    if attempt > 10 then digits := 2; end if;
    if attempt > 25 then digits := 3; end if;
    candidate := stem || lpad((floor(random() * power(10, digits)))::int::text, digits, '0');
    if not exists (select 1 from profiles where upper(invite_code) = candidate) then
      return candidate;
    end if;
  end loop;
  return stem || upper(substr(md5(gen_random_uuid()::text), 1, 6));
end $$;

create or replace function profiles_identity() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.full_name is distinct from old.full_name then
    new.display_name := display_name_for(new.full_name);
  end if;
  if new.invite_code is null then
    new.invite_code := new_invite_code(new.full_name);
  end if;
  return new;
end $$;
create trigger profiles_identity before insert or update on profiles
  for each row execute function profiles_identity();

-- New courses rotate through the four accents (FR-CRS-05).
create or replace function courses_default_accent() returns trigger
language plpgsql as $$
declare
  order_ accent[] := array['lagoon', 'ankara', 'palm', 'lavender']::accent[];
begin
  if new.accent is null then
    new.accent := order_[1 + (select count(*) from courses where user_id = new.user_id) % 4];
  end if;
  return new;
end $$;
create trigger courses_default_accent before insert on courses
  for each row execute function courses_default_accent();

-- Backfill (the profiles trigger fills display_name and invite_code on this update).
update profiles set display_name = display_name_for(full_name);
update courses c set accent = (array['lagoon', 'ankara', 'palm', 'lavender']::accent[])[1 + (r.n - 1) % 4]
from (select id, row_number() over (partition by user_id order by created_at, id) as n from courses) r
where r.id = c.id and c.accent is null;
alter table courses alter column accent set not null;

-- ---------------------------------------------------------------------------
-- Progress (§2.9)
-- ---------------------------------------------------------------------------
create table topic_mastery (
  user_id uuid not null references profiles (id) on delete cascade,
  topic_id uuid not null references topics (id) on delete cascade,
  course_id uuid references courses (id) on delete cascade,
  answered int not null default 0,
  mastery numeric(4,3) not null default 0 check (mastery between 0 and 1),
  mastered_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);
create index topic_mastery_course on topic_mastery (user_id, course_id);

create table readiness_snapshots (
  user_id uuid not null references profiles (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  day date not null,
  readiness numeric(4,3) not null check (readiness between 0 and 1),
  primary key (user_id, course_id, day)
);

create table study_days (
  user_id uuid not null references profiles (id) on delete cascade,
  day date not null,
  questions_answered int not null default 0,
  reading_seconds int not null default 0,
  daily5_done boolean not null default false,
  counted boolean not null default false,
  primary key (user_id, day)
);

create table review_queue (
  user_id uuid not null references profiles (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  box smallint not null default 1 check (box between 1 and 4),
  due_on date not null,
  last_result boolean,
  primary key (user_id, question_id)
);
create index review_queue_due on review_queue (user_id, due_on);

create table achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  kind achievement_kind not null,
  ref jsonb not null default '{}',
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);

-- ---------------------------------------------------------------------------
-- Sharing (§2.10)
-- ---------------------------------------------------------------------------
create table course_shares (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  owner_id uuid not null references profiles (id) on delete cascade,
  code text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{8,}$'),  -- Crockford base32
  status share_status not null default 'active',
  member_count int not null default 0 check (member_count between 0 and 300),
  report_count int not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index course_shares_one_active on course_shares (course_id) where status = 'active';

create table course_members (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references course_shares (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  invited_by uuid references profiles (id) on delete set null,
  source member_source not null,
  status member_status not null default 'pending',
  joined_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (share_id, user_id)
);
create index course_members_user on course_members (user_id) where status = 'active';

-- member_count counts active members (the 300 cap is checked on the column).
create or replace function course_members_count() returns trigger
language plpgsql as $$
declare
  ids uuid[] := array_remove(array[
    case when tg_op <> 'INSERT' then old.share_id end,
    case when tg_op <> 'DELETE' then new.share_id end], null);
begin
  update course_shares s set member_count =
    (select count(*) from course_members m where m.share_id = s.id and m.status = 'active')
  where s.id = any(ids);
  return null;
end $$;
create trigger course_members_count after insert or update of status or delete on course_members
  for each row execute function course_members_count();

create table user_blocks (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- True when the signed-in student is an active member of an active share of this course. For
-- policies and the API; security definer so it can look past RLS on the share tables.
create or replace function is_course_member(course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from course_members m
    join course_shares s on s.id = m.share_id
    where s.course_id = course and s.status = 'active'
      and m.user_id = auth.uid() and m.status = 'active'
  )
$$;
revoke execute on function is_course_member(uuid) from public, anon;
grant execute on function is_course_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications (§2.11)
-- ---------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  type notification_type not null,
  actor_id uuid references profiles (id) on delete set null,
  title text not null,
  body text,
  target jsonb not null default '{}',
  dedupe_key text,
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on notifications (user_id, created_at desc);
create index notifications_unread on notifications (user_id) where read_at is null;
create unique index notifications_dedupe on notifications (user_id, dedupe_key)
  where read_at is null and dedupe_key is not null;

create table notification_settings (
  user_id uuid primary key references profiles (id) on delete cascade,
  daily_reminder boolean not null default true,
  daily_reminder_time time not null default '19:30',
  quiet_start time not null default '23:00',
  quiet_end time not null default '07:00',
  types jsonb not null default
    '{"exam": true, "due": true, "recap": true, "mates": false, "ready": true}',
  updated_at timestamptz not null default now()
);

-- Every profile has settings: new ones by trigger, existing ones here.
create or replace function profiles_notification_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notification_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger profiles_notification_settings after insert on profiles
  for each row execute function profiles_notification_settings();
insert into notification_settings (user_id) select id from profiles on conflict do nothing;

-- Live inbox and toasts (FR-NOTIF-02): Realtime delivers only rows RLS lets the user read.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Invites (§2.12)
-- ---------------------------------------------------------------------------
create table referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references profiles (id) on delete cascade,
  invitee_id uuid not null unique references profiles (id) on delete cascade,
  code text not null,
  channel referral_channel not null,
  device_hash text,
  status referral_status not null default 'pending',
  reject_reason text check (reject_reason in ('self', 'device_seen', 'cap_reached')),
  credited_at timestamptz,
  created_at timestamptz not null default now()
);
create index referrals_inviter on referrals (inviter_id, status);
create index referrals_device on referrals (device_hash) where device_hash is not null;

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  platform text not null default 'ios' check (platform in ('ios')),
  invite_code text,
  confirm_token text unique,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index waitlist_email on waitlist (lower(email));

-- ---------------------------------------------------------------------------
-- Access (§5): RLS on, select-only policies on the student's own rows, no client writes.
-- ---------------------------------------------------------------------------
alter table topic_mastery enable row level security;
alter table readiness_snapshots enable row level security;
alter table study_days enable row level security;
alter table review_queue enable row level security;
alter table achievements enable row level security;
alter table course_shares enable row level security;
alter table course_members enable row level security;
alter table user_blocks enable row level security;
alter table notifications enable row level security;
alter table notification_settings enable row level security;
alter table referrals enable row level security;
alter table waitlist enable row level security;  -- no policy: server only

create policy "own mastery" on topic_mastery for select using (user_id = auth.uid());
create policy "own readiness" on readiness_snapshots for select using (user_id = auth.uid());
create policy "own study days" on study_days for select using (user_id = auth.uid());
create policy "own review queue" on review_queue for select using (user_id = auth.uid());
create policy "own achievements" on achievements for select using (user_id = auth.uid());
create policy "own or joined shares" on course_shares for select
  using (owner_id = auth.uid() or is_course_member(course_id));
create policy "own memberships" on course_members for select using (user_id = auth.uid());
create policy "own blocks" on user_blocks for select using (blocker_id = auth.uid());
create policy "own notifications" on notifications for select using (user_id = auth.uid());
create policy "own notification settings" on notification_settings for select
  using (user_id = auth.uid());
create policy "own invites" on referrals for select using (inviter_id = auth.uid());

-- 0005's default privileges already keep these read-only; say it explicitly too.
revoke insert, update, delete, truncate, references, trigger on
  topic_mastery, readiness_snapshots, study_days, review_queue, achievements, course_shares,
  course_members, user_blocks, notifications, notification_settings, referrals, waitlist
  from anon, authenticated;
revoke select on
  topic_mastery, readiness_snapshots, study_days, review_queue, achievements, course_shares,
  course_members, user_blocks, notifications, notification_settings, referrals, waitlist
  from anon;
revoke select on waitlist from authenticated;
