-- Quizzly credits and plans (FR-INV-03..05, FR-PLAN-01..03).
-- A friend counts as a credit after studying on 3 different days; 3 credits unlock Lavender and
-- 5 unlock 10% off Student or Premium. Paid plans are Google Play subscriptions verified by the API.

alter type notification_type add value if not exists 'invite_reward';

-- The friend's progress toward counting (0-3 study days), shown on screen 23.
alter table referrals add column study_days smallint not null default 0;

alter table profiles
  add column credits int not null default 0,          -- denormalised; the truth is `referrals`
  add column discount_unlocked_at timestamptz,         -- 5 credits: 10% off
  add column discount_seen_at timestamptz;             -- 23c shown once

-- One row per Google Play purchase token. The token is the key, so one purchase can never be
-- attached to two accounts. Written only by the API (FR-SEC-01): RLS on, no client policies.
create table subscriptions (
  purchase_token text primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  product_id text not null,
  plan plan not null,
  state text not null,           -- Play's subscriptionState, e.g. SUBSCRIPTION_STATE_ACTIVE
  offer_id text,                 -- the 10% invite offer when used
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user on subscriptions (user_id);
create trigger subscriptions_updated before update on subscriptions
  for each row execute function set_updated_at();
alter table subscriptions enable row level security;
