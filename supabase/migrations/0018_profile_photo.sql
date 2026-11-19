-- Profile setup v2 and profile photos (FR-PROF-04..07, FR-MOD-06; docs/PROFILE_V2.md).

alter table profiles
  add column avatar_path text,                 -- {user_id}/{uuid}.webp in the avatars bucket; set by the API
  add column avatar_visible boolean not null default false,  -- "Show my photo to classmates"
  add column avatar_updated_at timestamptz,
  add column avatar_hidden boolean not null default false,   -- set by reports (3) or an admin
  add column practice_times text[] not null default '{}'
    check (practice_times <@ array['commute', 'lectures', 'evening', 'night']);

-- Practice times set the Daily 5 reminder time (FR-PROF-06) until the student picks one in
-- Reminders (21); after that their own choice wins.
alter table notification_settings
  add column daily_reminder_custom boolean not null default false;

-- A visible profile photo can be reported from a shared course's members (FR-MOD-06).
alter type report_target add value if not exists 'avatar';

-- Private bucket; only the API writes to it (service role), and the app reads through short-lived
-- signed URLs. No client policies (CLAUDE.md security rules).
insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', false, 307200)
on conflict (id) do nothing;
