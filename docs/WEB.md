# Quizzly — Website and Admin (quizzly.app)

| | |
|---|---|
| **Status** | v0.1 |
| **Date** | 2026-10-27 |
| **Applies to** | `apps/web` (new): the public site, the invite/share link pages and the admin app, on one domain |
| **Related** | [DESIGN.md](DESIGN.md) (tokens, type, components) · [FRD](FRD.md) · [Architecture](ARCHITECTURE.md) · [Build plan](BUILD_PLAN.md) |
| **Images** | `docs/design/web/`: `31-landing-desktop.jpg`, `31-landing-mobile.jpg` (+ `-dark`), `30a`–`30h-admin-*.png` (+ `-dark`), `24-invite-landing.png`. Working HTML of each page: `docs/reference/*.html` |

The website and the admin share one codebase and one domain (placeholder `quizzly.app`, the same `INVITE_DOMAIN` used for `/i/` and `/c/` links). Same tokens and fonts as the app (DESIGN.md §3–4); Bricolage Grotesque and Manrope load from Google Fonts on the web.

## 1. Stack and routes

- **Framework:** Next.js (App Router) in `apps/web`, deployed to Cloudflare Pages. Marketing pages are static; `/admin` is client-rendered behind auth. Replaces the separate `apps/links` idea in BUILD_PLAN D6; the link routes live here.
- **Styling:** CSS variables generated from `apps/mobile/src/constants/theme.ts` (share one `tokens.json` if convenient). Light/dark from `prefers-color-scheme`, with a toggle stored in `localStorage`.

| Route | Page | Image | Notes |
|---|---|---|---|
| `/` | Landing page | 31-landing-* | Static. Screenshots are the real app screens from `docs/design/` exported as WebP (light set in light mode, dark set in dark mode). |
| `/i/[code]`, `/c/[code]` | Invite / share landing | 24-invite-landing | FR-INV-02 routing (App Link, Play Store referrer, iPhone waitlist, desktop QR). |
| `/.well-known/assetlinks.json` | Android App Links | — | Package name + release SHA-256. |
| `/privacy`, `/terms`, `/copyright` | Legal | — | NDPA wording; copyright requests feed the Takedowns page. |
| `/admin/sign-in` | Team sign-in | 30h | Email OTP + 2FA; only users with `role = admin` in `app_metadata`. |
| `/admin` | Overview | 30a | |
| `/admin/costs` | AI costs | 30b | |
| `/admin/reports` | Reports queue | 30c | |
| `/admin/takedowns` | Takedowns | 30d | |
| `/admin/limits` | Limits and plans | 30e | |
| `/admin/students` | Students | 30f | |
| `/admin/system` | System health | 30g | |

## 2. Landing page (31)

Desktop 1440 and mobile 390 are the same page (container/media queries: 2–4 columns → 1, side phones hidden on mobile). Sections in order:

1. **Header:** logo + "Quizzly"; links How it works · Features · Study together · FAQ; small "Team" link (→ `/admin/sign-in`); ink "Get the app" pill. Mobile: logo + "Get the app" only.

2. **Hero — the core promise: practise on the go, without waiting for past questions.** Eyebrow "Practise anywhere, anytime"; headline "Practise on the go⏎until it **clicks.**" (74/78 desktop, 46/48 mobile); pitch: "Don't wait for past questions. Upload your lecture notes and Quizzly writes fresh exam-style questions from them, round after round. Practise on the bus, in traffic or between lectures until you understand the principles, not just memorise answers."; "Get it on Google Play" ink pill ("Free during beta") + "iPhone: join the waitlist"; three facts with icons (New questions every round · Works offline on the road · Every answer explains why). Right: three phones — **Practice question** in the middle, Today (left, −7°) and Results (right, +7°) — with stickers "In traffic · 5 min", "Round 4 · new questions", "9 / 10 · you've got it". Mobile: the practice-question phone only.
2b. **Practice loop (ink band):** "Don't wait for **past questions.**" + why (past questions are hard to find, outdated, rarely answered; Quizzly makes as many rounds as you need, each with new questions on the same principles) + pill "Repeat until you score 80% on every topic" (the mastery bar from FR-HOME-03). Right: four numbered steps — Upload your notes · Get fresh questions · Practise anywhere · See why, then go again. Bottom row: "Practise wherever you are:" chips On the bus · In traffic · Between lectures · In the queue · Before bed.
3. **Schools strip:** "Launching at UNILAG · Coming next to UI, OAU, ABU, UNN and polytechnics · Any PDF, PPTX or photo of notes". No made-up logos or numbers.
4. **How it works (`#how`):** "From slides to **exam practice** in minutes": three cards (Upload / Understand / Practise, again and again), each with a cropped phone (upload sheet anchored to the bottom).
6. **Citations (ink band):** "Every answer shows its **page**" + three ticks; Chat and Page viewer phones.
7. **Features bento (`#features`):** "Everything you need for **exam week**": Theory answers marked · Flashcards · Past questions · Study offline · Topics, not 60 slides · Easy on your eyes (dark screenshot).
8. **Habits:** "A little, **every day**": Daily 5 · Weekly goal (no streak) · Exam countdown · Kind reminders; Daily 5 done and Celebration phones.
9. **Sharing (`#share`):** "One upload. **Whole class.**" with They get / Stays private cards and Share + Join phones.
10. **Built for our realities:** four fact cards: Light on your phone · Offline · Low-data mode · Your files stay yours (no AI training on notes, delete anytime).
10. **FAQ (`#faq`):** `<details>` accordion, first open: Do I need past questions? · free? · schools? · handwriting? · correctness? · cheating? · Can I practise without data?

11. **Final CTA (`#get`, ink):** "Start with this week's **slides.**" + Play/waitlist + **real** QR code to the Play listing (the canvas shows a placeholder pattern — generate the real one).
12. **Footer:** product/company/team links, "© 2026 Quizzly. Not affiliated with any university.", NDPA line.

Rules: no invented user counts, ratings or testimonials until they're real; copy stays kind (DESIGN §11); images have alt text; Lighthouse performance ≥ 90 on mobile (WebP, `loading="lazy"` below the fold, fonts `display=swap`).

## 3. Admin app (30a–30h)

Shell: left sidebar in `hdr` colour (logo → `/`, nav: Overview · AI costs · Reports (open count badge) · Takedowns · Limits and plans · Students · System; footer: beta status + signed-in admin with sign-out). Main: date/eyebrow, headline with one highlighted word, a page action on the right (range segmented pill, Export CSV, Refresh).

| Page | What it shows | Data / API |
|---|---|---|
| **30a Overview** | KPI tiles (active today/month, sign-ups with invite share, documents processed incl. duplicates, open reports); ink AI-cost card (today vs daily budget, breaker note, 7-day small multiples per provider); "Needs your attention" (4 newest reports → queue); System health list | `GET /admin/overview` |
| **30b AI costs** | Tiles: AI usage this month at list price and what was actually paid after free tiers, cost per active student, calls (+ cache-served), free-tier share. Ink card: 30-day daily cost bars with the daily-budget line, breaker state, alert threshold. Provider cards (status, fallback order, p50, free-tier used today). **Cost by task** table (task, model, calls, tokens in/out, served from cache, cost, share). Highest-cost students (IDs only) + CSV | `llm_calls` aggregated (FR-LIM-02), `provider_limits` |
| **30c Reports** | Filter pills; search; left list of reports (status Auto-hidden/Open); right **detail**: the question with options (stored answer vs what the notes say), cited source passage, grounding score, usage (quizzes, answers), every reporter's note (school + level + time, no names); actions **Fix answer** (re-marks past answers, thanks reporters), Regenerate, Keep hidden, Dismiss and restore | `reports`, `questions`, `attempt_answers` (FR-MOD-01/02) |
| **30d Takedowns** | Ink form: target type (File / Shared course / Question set), SHA-256 or share code, reason, requested by, internal note, notify students, red **Take down** with consequences spelled out. Takedown log (date, target, type, reason, students affected, by, status, Reverse). Shared courses close to auto-unshare (x/5 reports) | FR-MOD-04/05, `source_files.blocked`, `course_shares.status` |
| **30e Limits and plans** | Plan limits grid (Free live; Student/Premium drafts) with worst-case AI cost per plan from the cost model; safety limits (daily AI budget, alert %, OTP per IP, share-link rate, members per course, invite credits); feature flags (sharing, realtime, invite rewards, flashcards rollout, past-question mode, main-model switch); recent changes audit log; **Save changes** (applies within 1 min, logged) | new `app_config` + `config_audit` tables |
| **30f Students** | Tiles (MAU, active today, new this week, goal met, week-4 retention); schools and acquisition-source tables; searchable student table (display name + ID, school, plan, last active, quiz sets, AI cost, status incl. abuse flag and pending deletion) | `profiles`, `usage_counters`, `referrals` |
| **30g System** | Tiles (jobs waiting/running, failed 24 h, worker heartbeat, upload→ready p50/p95); jobs by type (done, failed, p50, p95); recent failures with reason pills and attempt count; Supabase usage bars (DB, storage, egress, realtime peak, realtime messages); AI provider breakers | `jobs`, `worker_heartbeats`, Supabase usage API |
| **30h Sign-in** | "Team **sign-in**", ink note (team only, 2FA, everything logged), email field, "Send my code", back to site | Supabase Auth OTP + TOTP |

**Admin security (required):** separate `role = admin` claim checked by the API on every `/admin/*` endpoint (service role stays server-side); TOTP 2FA; every write and every student-profile view goes to `admin_audit_log`; admins never see notes, chats, answers or progress content (only report snippets the reporter wrote and the reported item itself); CSV exports exclude names and emails.
