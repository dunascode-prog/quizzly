-- Country-ready (FR-PROF-08): schools and students have a country (ISO 3166-1 alpha-2; Nigeria
-- by default), levels outside Nigeria are years, and daily limits roll over at each student's
-- own midnight. A time zone can change at most once a week, so changing it can't reset limits.

alter table institutions add column country char(2) not null default 'NG';
create index institutions_country on institutions (country);

alter table profiles
  add column country char(2) not null default 'NG' check (country ~ '^[A-Z]{2}$'),
  add column timezone_changed_at timestamptz;

-- Nigerian levels (100L–700L), years elsewhere (Y1–Y6), postgraduate, other.
alter table profiles drop constraint profiles_level_check;
alter table profiles add constraint profiles_level_check check (
  level in ('100L','200L','300L','400L','500L','600L','700L','Y1','Y2','Y3','Y4','Y5','Y6','PG','other')
);
