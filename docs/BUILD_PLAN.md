# Quizzly — Build Plan (v0.2)

| | |
|---|---|
| **Date** | 2026-10-26 |
| **Baseline** | `main` at `b47bc3d` (Merge PR #19 `claude/account`): screens 01–13 built with Inter, API for documents, courses, study, quizzes and chat; 118 API tests passing; `tsc` clean |
| **Related** | [PRD](PRD.md) · [FRD](FRD.md) · [Design](DESIGN.md) · [Data models](DATA_MODELS.md) |

Work top to bottom. One PR per task (or a small group of tasks), on its own branch, with the FR IDs in the description. Tick the box in the PR that completes it. **Phase A must be finished before Phase C starts**, because sharing and notifications build on the read-only data model.

---

## Phase A — Harden what exists (M3.5)

From the v0.1 code review. Each task needs a regression test.

- [x] **A1. Client read-only database** (FR-SEC-01). Migration `0005_client_read_only.sql`: `revoke insert, update, delete on all tables in schema public from anon, authenticated;` drop every `for all` policy in `0001_init.sql` and recreate as `for select using (user_id = auth.uid())` (and the existing shared-content read rules). The app at `b47bc3d` makes no direct `.insert/.update/.upsert/.delete` calls (checked), so this only closes the hole; keep it that way. Test: with a user JWT, insert/update/delete on each table fails.
- [x] **A2. Server-owned storage paths** (FR-SEC-02, FR-SEC-17). `POST /documents` generates `uploads/{user_id}/{document_id}/{n}.{ext}`; `_upload_urls` and `upload_finished` reject any stored path outside that prefix; `upload_finished` checks object existence, size and magic bytes. Upload URL TTL 10 min, page view 5 min.
- [x] **A3. Bounded job retries** (FR-SEC-03). In `services/api/app/worker/queue.py` `claim()`, the expired-lease branch must require `attempts < max_attempts`; add a sweep that marks expired, exhausted jobs `failed` with `crashed` and fails their document. Test with a job that "crashes" repeatedly.
- [x] **A4. Ingestion resource caps** (FR-SEC-04). Pixel cap (40 MP) before rendering/OCR, PPTX zip uncompressed size and ratio checks, size check from storage metadata before download (photo sets too), 10-minute job timeout.
- [x] **A5. Refund only unprocessed uploads** (FR-SEC-05). Add `documents.processing_started_at`; refund in delete only when null. Test upload → ready → delete → upload counts 2.
- [x] **A6. Transient vs permanent failures** (FR-SEC-06). Only `encrypted|corrupt|no_text|too_large|blocked|crashed` mark `source_files` failed; provider/network errors retry.
- [x] **A7. Shared canonical copy** (FR-SEC-07). On ready, copy to `shared/{sha256}`, point `source_files.storage_path` there; `cleanup_storage` job retries failed removes. Test: delete uploader A, B's pages still load.
- [x] **A8. Budget and throttling** (FR-SEC-08, FR-LIM-02, FR-LIM-03). Write every LLM call to `llm_calls` (currently not written); daily budget in config trips the circuit breaker; "High demand" message; Supabase Auth rate limits configured for OTP.
- [x] **A9. Secure token storage** (FR-AUTH-06, FR-SEC-09). Supabase client storage adapter on `expo-secure-store` (chunk values > 2 KB); migrate existing sessions on first launch.
- [x] **A10. Input caps and idempotency** (FR-SEC-10, FR-SEC-18). Pydantic `max_length` on answer responses (5,000), chat (2,000), report notes (500), titles (80); duplicate attempt/answer IDs → 409 or existing record.
- [x] **A11. Dedupe side channel** (FR-SEC-11, FR-DOC-06). Same response shape; dedupe hits reported ready no sooner than 3 s.
- [x] **A12. Exam answers hidden** (FR-SEC-12). Exam-mode `GET /quizzes/{id}` omits answers and explanations until submit.
- [x] **A13. Prompt and stream hygiene** (FR-SEC-13, FR-SEC-14). Escape delimiter tags in document text; chat stream holds back partial citation markers.
- [x] **A14. Production config** (FR-SEC-15, FR-SEC-16). Explicit `ENV` required, `/docs` off in production, CORS allowlist; bundle KaTeX locally, restrict WebView origins.
- [x] **A15. Missing v0.1 P0s.** FR-MOD-02 (auto-hide a question after 3 distinct reporters), FR-DOC-10 (source page viewer route works end to end), FR-OFF-01/02 (review and merge branch `claude/offline-sync`, resolve conflicts with A1 — outbox posts to the API), FR-QUIZ-06 (topic and type breakdown on Results), FR-AUTH-05 (24 h deletion job covers storage and all tables). Review and merge or close `claude/faster-questions` and `claude/ui-foundation`.

## Phase B — New brand type and sign-in (M4, UI)

- [x] **B1. Fonts and tokens** (NFR-15, DESIGN §3–4). `npx expo install @expo-google-fonts/bricolage-grotesque @expo-google-fonts/manrope`; register in `app/_layout.tsx`; apply the provided `theme.ts` (`FontFamily`, `Type.number`, `Accent`, new `Radius`/`Size` keys). Update components that use `FontFamily.semibold` for bold text to `FontFamily.bold` where DESIGN says 700. Remove Inter and `assets/fonts/InterDisplay-SemiBold.ttf`. Check every screen against `docs/design/`.
- [x] **B2. Welcome sign-in** (FR-AUTH-01, DESIGN §7 01). Three steps (welcome → email → code), monochrome; `Sticker` and `FeatureList` components; illustration at ~320 wide with stickers; light `ActionPill`s; resend countdown.
- [x] **B3. Tabs** (FR-HOME-01). Today becomes `(tabs)/index.tsx`, Library moves to `(tabs)/library.tsx`; tab bar Today / Library / Practice / Account.

## Phase C — Engagement and sharing backend (M4)

- [x] **C1. Migration `0011_engagement_sharing.sql`** (0005–0010 were taken by Phase A) (DATA_MODELS §2.9–2.12): profile and course columns, `topic_mastery`, `readiness_snapshots`, `study_days`, `review_queue`, `achievements`, `course_shares`, `course_members`, `user_blocks`, `notifications`, `notification_settings`, `referrals`, `waitlist`; enums; `is_course_member()`; select-only RLS per §5; add `notifications` to the `supabase_realtime` publication; new `job_type` values; backfill `display_name`, `invite_code`, course accents.
- [x] **C2. Courses: exam date and accent** (FR-CRS-04/05). API + new/edit course sheet field.
- [x] **C3. Progress engine** (FR-HOME-03, FR-HAB-01..04, ARCHITECTURE §5.8). `update_mastery` job, nightly snapshot, Leitner review queue, study-day rules, achievements. Unit tests with fixed fixtures for mastery and readiness.
- [x] **C4. Endpoints** `GET /home`, `GET /daily5`, `POST /events/reading` (batched reading seconds), `GET /recap/{week}`, `PATCH /me/settings` (goal, accent, modes, share permission, identity toggle), `PATCH /me/notification-settings`.
- [x] **C5. Notifications service** (FR-NOTIF-01, 03, 05, 06). `notify(user, type, …)` helper with dedupe/batching; `send_push` job with Expo receipts; `POST /notifications/read`, `POST /notifications/read-all`, `GET /notifications?before=`; 90-day cleanup. Emit `document_ready/failed` from ingestion (FR-DOC-11).
- [x] **C6. Sharing API** (FR-SHARE-01..11). `POST /courses/{id}/share`, `GET/DELETE /courses/{id}/members/{member}`, `POST /courses/{id}/share/regenerate`, `POST /courses/{id}/share/stop`, `GET /shares/{member_id}`, `POST /shares/join {code}`, `POST /shares/{member_id}/accept|decline|leave`, `POST /blocks`, `POST /courses/{id}/report`. Limits, blocks, share permission, member cap, `fan_out_share_update`, read-only enforcement (FR-DOC-12), quote view endpoint (no storage URLs), takedown (FR-MOD-04/05).
- [x] **C7. Invites API** (FR-INV-01..06). `GET /me/invite`, `POST /referrals {code, channel, device_hash}`, `credit_referral` job (verified + onboarded + 5 answers; self/device/cap checks), `invite_joined` notification, Lavender unlock at 3.
- [x] **C8. Reminder scheduler** (FR-HAB-08). `schedule_reminders` every 15 min: local time window, not studied today, quiet hours, max 2/day; weekly recap Sunday 18:00 local.

## Phase D — Engagement and sharing UI (M4)

- [x] **D1. Today** (14) with `CountdownCard`, `WeekStrip`, `PlanRow`, new-user state.
- [x] **D2. Daily 5** play (reuses `play.tsx`) and **15** done screen with `StudyGrid`.
- [x] **D3. Realtime notifications** (FR-NOTIF-02, 04, 07): `useNotificationsChannel` (foreground only, `AppState`), global `Toast`, bell badge, **22** inbox with filters and inline actions, catch-up fetch, push registration and tap routing with `expo-notifications`.
- [x] **D4. Sharing UI**: **19** share sheet (`PrivacyList`, `MateChip`, `LinkCard`), members screen, **20** join screen, joined-course states in 03/05/07/08 (tag, read-only, quote view), leave/report, privacy and blocking settings.
- [x] **D5. Deep links and invites**: `app.json` Android `intentFilters` (`autoVerify`) for `INVITE_DOMAIN` paths `/i/*`, `/c/*`; routes `i/[code]`, `c/[code]`; pending code kept in secure storage through sign-up (FR-AUTH-07); Play Install Referrer on first launch (`react-native-device-info` `getInstallReferrer()`, development build); **23** invite screen with QR (`react-native-qrcode-svg`).
- [ ] **D6. Website + link routes** (`apps/web`, see [WEB.md](WEB.md)): Next.js on Cloudflare Pages at `INVITE_DOMAIN`. Landing page (31) from the real screenshots, `/i/{code}` and `/c/{code}` routing (FR-INV-02) with the landing page **24**, `/.well-known/assetlinks.json`, iPhone waitlist with double opt-in, privacy/terms/copyright pages.
- [x] **D7. Celebrations** (16), **Recap** (17, `react-native-view-shot` + `expo-sharing`), **Themes** (18, accent applied through a theme context), **Reminders** (21).
- [x] **D8a. Original page viewer** (screen 29, FR-DOC-10, P0 — done in A15, #41; check it against the new 29 image in D8).
- [x] **D8b. Flashcards** (screen 25, FR-QGEN-10, P1): generation job per topic (front/back/source pages, cached like question sets), self-rating feeds `review_queue`.
- [x] **D8c. Rename / merge topics** (screen 27, FR-TOP-03, P1): `topic_overrides` writes through the API (title override, merged_into, split), outline endpoint applies overrides for the requesting user only.
- [x] **D8d. Save course for offline** (screen 28, FR-OFF-03, P1): offline manifest endpoint (items + byte size), background download into the SQLite cache with per-part progress, "Saved for offline" state and auto-update while on.
- [x] **D8e. Past-question mode** (screen 26, FR-QGEN-09, P1): past-paper upload (same pipeline, `kind = past_paper`, never shared or used as answers), style extraction job (types, wording patterns, marks), `style` option on `POST /quizzes`.

- [x] **D8. Passes**: dark mode, 200% font scale, reduce motion, TalkBack labels on all new components, low-data mode behaviour, offline states for social screens. *(2026-10-31: every touchable on the new screens has a role and label; colours are tokens only; reduce motion is honoured by the crop zoom, rays and rings; social screens show offline states; low-data mode stops downloading other students' photos; numbers in fixed circles cap their font scale at 1.3. Check 200% on a device: web emulation is unreliable.)*


- [x] **D9. Profile setup v2 and profile photos** ([PROFILE_V2.md](PROFILE_V2.md), screens 02a–02i, FR-PROF-01/03..07, FR-MOD-06): API and migration 0018 (photo upload and delete, visibility, practice times → reminder, photo reports); app `Avatar` component, 4-step onboarding with photo sheet and crop, edit profile.

- [ ] **D10. Quizzly credits and plans** ([CREDITS_AND_PLANS.md](CREDITS_AND_PLANS.md), screens 13, 23, 23b, 23c, 32; FR-INV-03..05, FR-PLAN-01..03, FR-LIM-05..07): cost controls and priority (done), credits and plans API with Google Play verification (done), app screens 13 / 23 / 23b / 23c / 32 (done). **Left:** Play Console products and offer, the service account and notifications (owner), then the native billing library in a dev build to start checkout from screen 32.

## Phase E — Beta readiness (M5)

- [x] E1. Eval set and CI run on prompt changes (NFR-11). Harness, CI job and 6 sample cases; grow to 30 real documents (see evals/README.md).
- [x] E2. Sentry in app and API; job metrics (NFR-09).
- [ ] E3. Play Store internal testing track; store listing; privacy policy and terms updated for sharing, notifications and invites (NDPA). Repo side done (`eas.json`, [STORE_LISTING.md](STORE_LISTING.md)); account steps and policy pages remain.
- [ ] E4. **Admin app** at `/admin` in `apps/web` (screens 30a–30h, WEB.md §3): team sign-in with 2FA and `role = admin`, Overview, AI costs, Reports (fix answer / regenerate / keep hidden / dismiss), Takedowns, Limits and plans (`app_config` + audit log), Students, System. Admin API endpoints under `/admin/*` in FastAPI with role checks and `admin_audit_log`.

## Decisions still open (don't block on them)

| Question | Default to build with |
|---|---|
| Invite/share domain (PRD Q4) | `INVITE_DOMAIN` env var; placeholder `quizzly.app` (the app, the API and apps/web use the same default) |
| Paid plan contents (PRD Q3) | Build everything free; keep limits and unlocks in config |
| iOS timing | iPhone users see the waitlist on the landing page |
