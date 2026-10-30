-- Plans (FR-LIM-04): free, student ($6/month) and premium ($10/month). `profiles.plan` exists
-- since 0001 (free, premium); this adds student and an expiry. Free students' chat, explanations
-- and questions run on cheaper models. Payments aren't built yet; when they are, only verified
-- payment webhooks set these (never the app).
alter type plan add value if not exists 'student' before 'premium';

-- A paid plan lapses back to free after this; null means it doesn't lapse (free, or granted).
alter table profiles add column plan_expires_at timestamptz;
