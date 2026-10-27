# Quizzly — Build Plan (v0.2)

| | |
|---|---|
| **Date** | 2026-10-26 |
| **Baseline** | `main` at `b47bc3d` (Merge PR #19 `claude/account`): screens 01–13 built with Inter, API for documents, courses, study, quizzes and chat; 118 API tests passing; `tsc` clean |
| **Related** | [PRD](PRD.md) · [FRD](FRD.md) · [Design](DESIGN.md) · [Data models](DATA_MODELS.md) |

### Status when this plan was added (2026-10-26)

Checked against the code, not just the baseline line above:

- **Open PRs that belong to A15:** #20 `claude/offline-sync` (FR-OFF-01/02: persisted cache, quiz outbox through the API, offline banner) and #21 `claude/faster-questions` (FR-QGEN-08: `questions` model profile, per-call progress; 30 questions in ~20 s). Review and merge them first; #20 will need a small rebase after A1/A9.
- **`claude/ui-foundation`** was merged long ago as PR #5; only the leftover branch needs deleting.
- **Already built:** FR-AUTH-05 deletion is synchronous with a `delete_account` job retrying storage removal (A15 still needs the "type DELETE" confirmation and the shared-course note from DESIGN 13); chat has its own "High demand" message; reports and thumbs are stored (no admin view yet).
- **Confirmed gaps:** `for all` write policies on user tables (A1), session in plain storage (A9), answers included in exam-mode quiz payloads (A12), nothing writes `llm_calls` (A8), nothing sets `questions.hidden` (A15 / FR-MOD-02), source viewer shows page text rather than the page image (A15 / FR-DOC-10).
- **Agreed (2026-10-26):** A5 replaces PR #14's rule: only uploads that were never processed are given back.
- **Fonts:** the v0.2 `theme.ts` isn't applied yet, because the app doesn't load Bricolage Grotesque or Manrope; B1 applies it together with the fonts.

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
- [ ] **A8. Budget and throttling** (FR-SEC-08, FR-LIM-02, FR-LIM-03). Write every LLM call to `llm_calls` (currently not written); daily budget in config trips the circuit breaker; "High demand" message; Supabase Auth rate limits configured for OTP.
- [ ] **A9. Secure token storage** (FR-AUTH-06, FR-SEC-09). Supabase client storage adapter on `expo-secure-store` (chunk values > 2 KB); migrate existing sessions on first launch.
- [ ] **A10. Input caps and idempotency** (FR-SEC-10, FR-SEC-18). Pydantic `max_length` on answer responses (5,000), chat (2,000), report notes (500), titles (80); duplicate attempt/answer IDs → 409 or existing record.
- [ ] **A11. Dedupe side channel** (FR-SEC-11, FR-DOC-06). Same response shape; dedupe hits reported ready no sooner than 3 s.
- [ ] **A12. Exam answers hidden** (FR-SEC-12). Exam-mode `GET /quizzes/{id}` omits answers and explanations until submit.
- [ ] **A13. Prompt and stream hygiene** (FR-SEC-13, FR-SEC-14). Escape delimiter tags in document text; chat stream holds back partial citation markers.
- [ ] **A14. Production config** (FR-SEC-15, FR-SEC-16). Explicit `ENV` required, `/docs` off in production, CORS allowlist; bundle KaTeX locally, restrict WebView origins.
- [ ] **A15. Missing v0.1 P0s.** FR-MOD-02 (auto-hide a question after 3 distinct reporters), FR-DOC-10 (source page viewer route works end to end), FR-OFF-01/02 (review and merge branch `claude/offline-sync`, resolve conflicts with A1 — outbox posts to the API), FR-QUIZ-06 (topic and type breakdown on Results), FR-AUTH-05 (24 h deletion job covers storage and all tables). Review and merge or close `claude/faster-questions` and `claude/ui-foundation`.

## Phase B — New brand type and sign-in (M4, UI)

- [ ] **B1. Fonts and tokens** (NFR-15, DESIGN §3–4). `npx expo install @expo-google-fonts/bricolage-grotesque @expo-google-fonts/manrope`; register in `app/_layout.tsx`; apply the provided `theme.ts` (`FontFamily`, `Type.number`, `Accent`, new `Radius`/`Size` keys). Update components that use `FontFamily.semibold` for bold text to `FontFamily.bold` where DESIGN says 700. Remove Inter and `assets/fonts/InterDisplay-SemiBold.ttf`. Check every screen against `docs/design/`.
- [ ] **B2. Welcome sign-in** (FR-AUTH-01, DESIGN §7 01). Three steps (welcome → email → code), monochrome; `Sticker` and `FeatureList` components; illustration at ~320 wide with stickers; light `ActionPill`s; resend countdown.
- [ ] **B3. Tabs** (FR-HOME-01). Today becomes `(tabs)/index.tsx`, Library moves to `(tabs)/library.tsx`; tab bar Today / Library / Practice / Account.

## Phase C — Engagement and sharing backend (M4)

- [ ] **C1. Migration `0007_engagement_sharing.sql`** (0005/0006 were taken by A1/A2) (DATA_MODELS §2.9–2.12): profile and course columns, `topic_mastery`, `readiness_snapshots`, `study_days`, `review_queue`, `achievements`, `course_shares`, `course_members`, `user_blocks`, `notifications`, `notification_settings`, `referrals`, `waitlist`; enums; `is_course_member()`; select-only RLS per §5; add `notifications` to the `supabase_realtime` publication; new `job_type` values; backfill `display_name`, `invite_code`, course accents.
- [ ] **C2. Courses: exam date and accent** (FR-CRS-04/05). API + new/edit course sheet field.
- [ ] **C3. Progress engine** (FR-HOME-03, FR-HAB-01..04, ARCHITECTURE §5.8). `update_mastery` job, nightly snapshot, Leitner review queue, study-day rules, achievements. Unit tests with fixed fixtures for mastery and readiness.
- [ ] **C4. Endpoints** `GET /home`, `GET /daily5`, `POST /events/reading` (batched reading seconds), `GET /recap/{week}`, `PATCH /me/settings` (goal, accent, modes, share permission, identity toggle), `PATCH /me/notification-settings`.
- [ ] **C5. Notifications service** (FR-NOTIF-01, 03, 05, 06). `notify(user, type, …)` helper with dedupe/batching; `send_push` job with Expo receipts; `POST /notifications/read`, `POST /notifications/read-all`, `GET /notifications?before=`; 90-day cleanup. Emit `document_ready/failed` from ingestion (FR-DOC-11).
- [ ] **C6. Sharing API** (FR-SHARE-01..11). `POST /courses/{id}/share`, `GET/DELETE /courses/{id}/members/{member}`, `POST /courses/{id}/share/regenerate`, `POST /courses/{id}/share/stop`, `GET /shares/{member_id}`, `POST /shares/join {code}`, `POST /shares/{member_id}/accept|decline|leave`, `POST /blocks`, `POST /courses/{id}/report`. Limits, blocks, share permission, member cap, `fan_out_share_update`, read-only enforcement (FR-DOC-12), quote view endpoint (no storage URLs), takedown (FR-MOD-04/05).
- [ ] **C7. Invites API** (FR-INV-01..06). `GET /me/invite`, `POST /referrals {code, channel, device_hash}`, `credit_referral` job (verified + onboarded + 5 answers; self/device/cap checks), `invite_joined` notification, Lavender unlock at 3.
- [ ] **C8. Reminder scheduler** (FR-HAB-08). `schedule_reminders` every 15 min: local time window, not studied today, quiet hours, max 2/day; weekly recap Sunday 18:00 local.

## Phase D — Engagement and sharing UI (M4)

- [ ] **D1. Today** (14) with `CountdownCard`, `WeekStrip`, `PlanRow`, new-user state.
- [ ] **D2. Daily 5** play (reuses `play.tsx`) and **15** done screen with `StudyGrid`.
- [ ] **D3. Realtime notifications** (FR-NOTIF-02, 04, 07): `useNotificationsChannel` (foreground only, `AppState`), global `Toast`, bell badge, **22** inbox with filters and inline actions, catch-up fetch, push registration and tap routing with `expo-notifications`.
- [ ] **D4. Sharing UI**: **19** share sheet (`PrivacyList`, `MateChip`, `LinkCard`), members screen, **20** join screen, joined-course states in 03/05/07/08 (tag, read-only, quote view), leave/report, privacy and blocking settings.
- [ ] **D5. Deep links and invites**: `app.json` Android `intentFilters` (`autoVerify`) for `INVITE_DOMAIN` paths `/i/*`, `/c/*`; routes `i/[code]`, `c/[code]`; pending code kept in secure storage through sign-up (FR-AUTH-07); Play Install Referrer on first launch (`react-native-device-info` `getInstallReferrer()`, development build); **23** invite screen with QR (`react-native-qrcode-svg`).
- [ ] **D6. Link service** (separate folder `apps/links`, Cloudflare Pages): `/i/{code}`, `/c/{code}` routing by user agent, `/.well-known/assetlinks.json` (package name + release SHA-256), landing page **24** using the same tokens and fonts, iPhone waitlist form with double opt-in, rate limiting. Domain from env `INVITE_DOMAIN` (PRD Q4).
- [ ] **D7. Celebrations** (16), **Recap** (17, `react-native-view-shot` + `expo-sharing`), **Themes** (18, accent applied through a theme context), **Reminders** (21).
- [ ] **D8. Passes**: dark mode, 200% font scale, reduce motion, TalkBack labels on all new components, low-data mode behaviour, offline states for social screens.

## Phase E — Beta readiness (M5)

- [ ] E1. Eval set and CI run on prompt changes (NFR-11).
- [ ] E2. Sentry in app and API; job metrics (NFR-09).
- [ ] E3. Play Store internal testing track; store listing; privacy policy and terms updated for sharing, notifications and invites (NDPA).
- [ ] E4. Admin views: reports queue, takedowns, daily LLM cost, notification volume.

## Decisions still open (don't block on them)

| Question | Default to build with |
|---|---|
| Invite/share domain (PRD Q4) | `INVITE_DOMAIN` env var; placeholder `quizzly.example` in dev |
| Paid plan contents (PRD Q3) | Build everything free; keep limits and unlocks in config |
| iOS timing | iPhone users see the waitlist on the landing page |
