# Quizzly — Functional Requirements Document (FRD)

| | |
|---|---|
| **Status** | Draft v0.2 |
| **Date** | 2026-10-26 |
| **Related** | [PRD](PRD.md) · [Architecture](ARCHITECTURE.md) · [Data models](DATA_MODELS.md) · [Data flows](DATA_FLOWS.md) · [Design](DESIGN.md) · [Build plan](BUILD_PLAN.md) |

This document says **what the system must do**, precisely enough to build and test against. Each requirement has an ID (`FR-<AREA>-NN`), a priority (P0 = MVP, P1, P2) and acceptance criteria. User stories (`US-xx`) refer to the [PRD](PRD.md#5-user-stories).

**v0.2 changes:** new areas §2.14 Today (FR-HOME), §2.15 Habits and personalisation (FR-HAB), §2.16 Security hardening (FR-SEC), §2.17 Course sharing (FR-SHARE), §2.18 Invites (FR-INV); §2.13 Notifications rewritten and promoted to P0; FR-AUTH-01/05/06, FR-CRS-04/05, FR-DOC-06/09/12, FR-MOD-04/05 changed or added. Changed rows are marked **(v0.2)**.

---

## 1. Actors

| Actor | Description |
|---|---|
| **Student** | Authenticated end user of the mobile app |
| **Guest** | Unauthenticated visitor (can see the sign-in welcome, the invite/share web landing page and the iPhone waitlist) |
| **Admin** | Team member using the Supabase dashboard / admin scripts to moderate reports and adjust limits |
| **Worker** | Background process that runs ingestion and generation jobs |
| **LLM provider** | External inference API (Groq, OpenRouter, Cloudflare Workers AI) |
| **Supabase** | Auth, Postgres (+pgvector), Storage and Realtime |
| **Expo Push** | Delivers push notifications to Android/iOS devices |
| **Link service** | Small web route on `INVITE_DOMAIN` that serves `/i/{code}`, `/c/{code}`, `/.well-known/assetlinks.json` and the landing page |
| **Play Store** | Installs the app and passes the install referrer |

## 2. Functional requirements

### 2.1 Authentication and account (FR-AUTH)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-AUTH-01 | P0 | Students can sign up and sign in with an **email one-time code** or **Google**. **(v0.2)** The first screen is a welcome step that shows what Quizzly does (upload, explanations, exam-style questions, chat with citations) with "Get started", "Continue with Google" and "I have an account"; email and code are the next steps. | Code is 6 digits, expires in 10 min, max 5 attempts, resend after 60 s; Google sign-in works on Android. |
| FR-AUTH-02 | P0 | The session persists across app restarts and refreshes silently. | Student stays signed in for 30 days of inactivity; token refresh happens without a prompt. |
| FR-AUTH-03 | P0 | The student must accept the Terms and Privacy Policy before using the app. | Consent timestamp and policy version are stored on the profile. |
| FR-AUTH-04 | P0 | The student can sign out on the device. | Local cache is cleared on sign-out. |
| FR-AUTH-05 | P0 | The student can delete their account. | All documents, derived user data and storage objects owned only by them are deleted within 24 h (NDPA). A confirmation screen is required (type DELETE). **(v0.2)** Courses they shared stop being shared (members are notified, FR-SHARE-07); their memberships, notifications, invite code and referral records are deleted; shared source files used by others stay under `shared/` (FR-SEC-07). |
| FR-AUTH-06 | P0 | **(v0.2)** Session tokens are stored in the device's secure storage (`expo-secure-store`, chunked if large), never in plain local storage, on native platforms. | A token is not readable from the SQLite cache or AsyncStorage. |
| FR-AUTH-07 | P0 | **(v0.2)** A pending invite or share code (from a link or the install referrer) survives sign-up and onboarding and is applied right after. | Opening `/c/{code}` while signed out ends on the Join screen (20) after onboarding. |

> SMS/phone OTP is excluded because SMS costs money per message.

### 2.2 Profile and onboarding (FR-PROF)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-PROF-01 | P0 | *(updated, PROFILE_V2)* Onboarding is a 4-step flow: photo + name, school, how you practise, all set. | Can't reach Today until name, institution and level are set and terms are accepted. Steps 1 and 3 have **Skip**. Back keeps entered values. Progress shows "Step n of 4 · name". Values are editable later. |
| FR-PROF-02 | P0 | The institution list is seeded with Nigerian universities, polytechnics and colleges of education. | Search matches name and short name ("UNILAG", "University of Lagos"). "My school isn't listed" stores free text. |
| FR-PROF-03 | P1 | *(moved into onboarding)* Explanation style Standard / Simple / Exam with a one-line description of each. | It becomes the default in FR-EXPL-02. |
| FR-PROF-04 | P1 | **Profile photo.** Take a photo (front camera) or pick one from the gallery, move and zoom it inside a circle crop; change or remove it later. | 512×512 WebP (quality 0.8, ≤ 150 KB) made on the phone; EXIF/GPS stripped. Uploaded through the API (`PUT /me/avatar`), never straight to storage. Removing deletes the file. Initials while loading, on error and without a photo. Works offline (queued in the outbox, shown locally at once). |
| FR-PROF-05 | P1 | **Photo visibility.** "Show my photo to classmates" (default **off**). | Off: other students see initials only. On: members of courses the student shares or joins see the photo next to "Tolu A.". Admins never see photos (except a reported one). Blocked users never see it. Takes effect on next load. |
| FR-PROF-06 | P1 | **When you practise.** Multi-select: On my commute · Between lectures · Evenings · Late night. | Sets the Daily 5 reminder time: commute 06:45, lectures 11:50, evenings 17:45, late night 21:45, none 19:30; the earliest chosen wins, moved to the end of quiet hours if it falls inside them. A time chosen in Reminders (21) wins over it. |
| FR-PROF-07 | P1 | **Weekly goal** in onboarding: 3 / 4 / 6 study days (Light / Steady / Serious). | Writes `profiles.weekly_goal_days` (default 4). |

### 2.3 Courses (FR-CRS)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-CRS-01 | P0 | The student can create, rename and delete courses with a code (e.g. "CSC 225") and an optional title. | Code is 2–12 characters; duplicate codes for the same student are rejected. |
| FR-CRS-02 | P0 | Documents can be uploaded into a course or left unfiled. | An "Unfiled" view lists documents without a course. |
| FR-CRS-03 | P0 | Deleting a course asks whether to delete its documents or move them to Unfiled. | Both options work. If the course is shared, the dialog says members will lose access. |
| FR-CRS-04 | P0 | **(v0.2)** A course can have an optional **exam date**, asked when the course is created and editable later. | Date must be today or later; past dates are cleared automatically the day after the exam. Drives the countdown on Today (FR-HOME-02). |
| FR-CRS-05 | P0 | **(v0.2)** Each course gets an **accent colour** (Lagoon, Ankara, Palm, Lavender, rotating) used only for its rings and dots. | Student can change it on the course options sheet. |

### 2.4 Document upload and processing (FR-DOC)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-DOC-01 | P0 | The student can upload **PDF**, **PPTX**, or **1–30 images (JPG/PNG)** captured with the camera or picked from the gallery. | Images are combined into one document in the order chosen. |
| FR-DOC-02 | P0 | Upload limits: 25 MB and 150 pages per document; 5 uploads per day (configurable). | Over-limit files are rejected **before** upload with a clear message. |
| FR-DOC-03 | P0 | Files upload **directly to object storage** through a short-lived signed URL; the API only registers the upload. | The API server never receives file bytes. A signed URL expires after 10 minutes. |
| FR-DOC-04 | P0 | Uploads can resume or retry after a network drop. | A failed upload can be retried from the document list without picking the file again (while the app is open). |
| FR-DOC-05 | P0 | After upload, the system processes the document in the background: extract text → OCR where needed → clean → split into chunks → embed → build topic outline. | Status moves `uploaded → processing → ready` or `failed` (with a readable reason). Progress percentage is shown. |
| FR-DOC-06 | P0 | **Deduplication:** if a file with the same SHA-256 hash has already been processed, its derived data is reused and the document is ready almost immediately. | A second upload of an identical file reaches `ready` in under 5 s and costs no LLM calls. The student never learns that someone else uploaded it: **(v0.2)** the API responses and status sequence are identical for hits and misses, and a hit is reported `ready` no sooner than 3 s after upload (FR-SEC-11). |
| FR-DOC-07 | P0 | Scanned pages and images are OCR'd. If OCR confidence is low, the document is still processed but flagged. | A banner says "Some pages were hard to read"; the affected pages are listed. |
| FR-DOC-08 | P0 | Password-protected, corrupt or text-less files fail gracefully. | Status `failed` with reason `encrypted`, `corrupt`, `no_text` or `too_large`. |
| FR-DOC-09 | P0 | The student can rename, move and delete documents. | Deleting removes the student's document and everything tied to it (quizzes, attempts, chats). Shared derived data is removed only when no document references it. **(v0.2)** The daily upload is refunded only if the document never started processing (FR-SEC-05). In a shared course, members see the document disappear. |
| FR-DOC-10 | P0 | The student can view the original file inside the app. | PDF renders in an in-app viewer; citations deep-link to the page. |
| FR-DOC-11 | P0 | **(v0.2, was P1)** Notification when processing finishes: in-app toast + inbox row in real time, push if the app is in the background (FR-NOTIF). | Arrives within 30 s of the status changing to `ready`/`failed`. |
| FR-DOC-12 | P0 | **(v0.2)** Documents in a course the student joined through sharing are read-only for them: they can study, quiz and chat, but not rename, move, delete or upload into that course. | Edit controls are hidden; the API returns 403 on writes. |

### 2.5 Topic outline (FR-TOP)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-TOP-01 | P0 | Each ready document has an outline of 3–25 topics (optionally nested one level), each with a title, a one-sentence summary and a page range. | Every chunk belongs to exactly one topic; topics follow document order. |
| FR-TOP-02 | P0 | The outline uses the document's own headings where they exist, otherwise an LLM groups chunks into topics. | On decks with clear headings, ≥ 80% of topic titles match a heading. |
| FR-TOP-03 | P1 | The student can rename a topic or merge two adjacent topics. | The change applies only to their view (stored as an override). |

### 2.6 Explanations (FR-EXPL)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-EXPL-01 | P0 | For any topic, the student can open an explanation containing: an overview, a step-by-step explanation, key terms with definitions, at least one example or analogy, common mistakes, and a short "remember this" summary. | Every factual paragraph cites at least one source page. |
| FR-EXPL-02 | P0 | Three styles: **Standard**, **Simple** ("explain like I'm new"), **Exam-focused** (definitions, likely exam questions, how to structure answers). | Switching style loads a cached version if it exists; otherwise one is generated. |
| FR-EXPL-03 | P0 | Explanations are grounded: claims beyond the notes are labelled "Additional context (not in your notes)". | Eval set: ≥ 95% of unlabelled claims are supported by the cited pages. |
| FR-EXPL-04 | P0 | Explanations are cached per (source file, topic, style, prompt version) and shared by every student with an identical file. | A cache hit returns in < 1 s and doesn't count against the daily limit. |
| FR-EXPL-05 | P0 | Explanation text renders as Markdown, including formulas (LaTeX → rendered math) and code blocks. | CSC and MTH notes render correctly. |

### 2.7 Question generation (FR-QGEN)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-QGEN-01 | P0 | The student creates a quiz by choosing: scope (whole document or selected topics), question types, difficulty (easy/medium/hard/mixed) and count (5, 10, 20, 30). | Form defaults: whole document, MCQ, mixed, 10. |
| FR-QGEN-02 | P0 | Supported types: **MCQ** (4 options, one correct), **True/False**, **Fill-in-the-blank**, **Short answer** (1–3 sentences), **Theory** (essay with a marking rubric). | Each type has a JSON schema; invalid items are discarded and regenerated. |
| FR-QGEN-03 | P0 | Every question stores: the correct answer, an explanation of why it's correct (and why distractors are wrong, for MCQ), the source chunk IDs and page numbers, and a difficulty. | 100% of stored questions have at least one source page. |
| FR-QGEN-04 | P0 | Questions are spread across the selected topics in proportion to their length, not drawn only from the most similar chunks. | For whole-document quizzes, no topic gets more than 40% of the questions unless only one topic is selected. |
| FR-QGEN-05 | P0 | **Validation** before saving: schema check; remove near-duplicates (embedding similarity > 0.92); check the answer is supported by the source chunk; check MCQ distractors are distinct and plausible. | Questions that fail are dropped; the set is topped up up to 2 times; if still short, the set is saved with fewer questions and a notice. |
| FR-QGEN-06 | P0 | Theory questions follow Nigerian exam conventions ("Explain…", "Discuss…", "With the aid of a diagram…", "Distinguish between…") and include a points-based rubric (e.g. 10 marks split into criteria). | Rubric marks add up to the question's total. |
| FR-QGEN-07 | P0 | Generation is cached: the same (source file, topic set, types, difficulty, count, prompt version) returns the existing set. The student can press "New questions" to force a new set, which counts against the limit. | Cache hits are instant and free. |
| FR-QGEN-08 | P0 | Generation runs as a background job; the app shows progress and can be closed. | Typical 10-question set is ready in ≤ 30 s (p50). |
| FR-QGEN-09 | P1 | **Past-question mode:** the student uploads past questions; new questions copy their style and format but use content from the notes. | — |
| FR-QGEN-10 | P1 | **Flashcards:** front/back cards generated per topic. | — |

### 2.8 Quizzes and attempts (FR-QUIZ)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-QUIZ-01 | P0 | **Practice mode:** feedback after each question (correct/incorrect, explanation, source link). | — |
| FR-QUIZ-02 | P0 | **Exam mode:** optional timer, no feedback until submission, then a full review. | Unanswered questions score zero when the timer ends. |
| FR-QUIZ-03 | P0 | MCQ, True/False and fill-in-the-blank are marked on the device instantly. Fill-blank matching ignores case, extra spaces and punctuation, and accepts listed alternative answers. | Works offline. |
| FR-QUIZ-04 | P0 | Short-answer and theory answers are marked by the LLM against the stored answer and rubric, returning a score, per-criterion feedback and a model answer. | Marking returns in ≤ 15 s; offline answers are queued and marked when the device reconnects. |
| FR-QUIZ-05 | P0 | Attempts and answers are saved, and the student can resume an unfinished attempt. | Resuming restores the position and the answers given so far. |
| FR-QUIZ-06 | P0 | A results screen shows the score, time taken, and a breakdown by topic and question type. | — |
| FR-QUIZ-07 | P1 | **History and weak topics:** per-topic accuracy across attempts; the 3 weakest topics are suggested for revision. | — |
| FR-QUIZ-08 | P2 | **Spaced repetition** of missed questions (SM-2 style scheduling). | — |

### 2.9 Chat with notes (FR-CHAT)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-CHAT-01 | P0 | The student can open a chat scoped to one document (P1: to a whole course) and ask questions. | — |
| FR-CHAT-02 | P0 | Each answer is built from retrieved chunks and cites page numbers; tapping a citation opens that page. | — |
| FR-CHAT-03 | P0 | If the notes don't contain the answer, the assistant says so, and may add general knowledge only under a clear "Not from your notes" label. | Eval: ≥ 95% correct refusals on out-of-scope questions. |
| FR-CHAT-04 | P0 | Responses stream token by token. | First token in ≤ 2 s (p50). |
| FR-CHAT-05 | P0 | Each thread keeps its history; the last 6 turns are sent as context. | — |
| FR-CHAT-06 | P0 | Quick actions: "Explain simpler", "Give me an example", "Quiz me on this". | "Quiz me on this" creates a 5-question quiz on the cited topic. |

### 2.10 Offline (FR-OFF)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-OFF-01 | P0 | Outlines, explanations and quizzes the student has opened are stored on the device. | Available in airplane mode. |
| FR-OFF-02 | P0 | Attempts made offline sync when the device reconnects. | No data loss or duplicate attempts (idempotency keys). |
| FR-OFF-03 | P1 | "Download course for offline" fetches every cached explanation and quiz for a course. | Shows the download size first. |

### 2.11 Limits and usage (FR-LIM)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-LIM-01 | P0 | Daily per-student limits are enforced on the server ([PRD §9](PRD.md#9-usage-limits-free-plan-initial-values-configurable)). | Over-limit requests return HTTP 429 with the reset time; the app shows remaining usage. |
| FR-LIM-02 | P0 | Every LLM call is logged with provider, model, tokens and estimated cost. | Admin can see daily cost per provider. |
| FR-LIM-03 | P0 | A global circuit breaker queues work (rather than failing) when all providers are rate-limited. | The student sees "High demand — your quiz is queued". |
| FR-LIM-04 | P1 | **Plans:** `free`, `student` ($6/month) and `premium` ($10/month) in `profiles.plan`, with `plan_expires_at` (a lapsed plan counts as free). **Free students' chat, explanations and questions run on cheaper models** (`free_tasks` in `config/models.yaml`, cheapest first); paid plans keep the stronger models. Outlines, past-paper styles and marking are the same for everyone. Daily limits are unchanged for now. Only verified payment webhooks set the plan (payments not built yet); the app can read it in `GET /v1/me` but never change it. | A call made without a plan uses the free routes, so a mistake costs less, not more. Cached explanations and question sets are shared whichever plan made them. |

### 2.12 Feedback and moderation (FR-MOD)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-MOD-01 | P0 | The student can report a question, explanation or chat answer as wrong, unclear or inappropriate, with an optional note. | A report is stored and visible to the admin. |
| FR-MOD-02 | P0 | A question reported by 3 different students is hidden from new quizzes until reviewed. | — |
| FR-MOD-03 | P0 | Thumbs up/down on explanations and chat answers. | Stored for quality analysis. |
| FR-MOD-04 | P0 | **(v0.2, was P1)** Copyright takedown: admin can block a file hash or take down a shared course, deleting derived data and preventing re-processing. | Members of an affected shared course lose access within 1 min and get a "no longer available" notification. |
| FR-MOD-05 | P0 | **(v0.2)** Any member can **report a shared course** (copyright, wrong content, spam). | A course reported by 5 different members is unshared pending review. |
| FR-MOD-06 | P1 | **Report a profile photo.** A photo shown in a shared course can be reported (`reports.target_type = 'avatar'`, target = the student). | 3 different reporters hide it (back to initials) until an admin reviews it in Reports. Admin "Remove photo" deletes the file and notifies the student kindly. |

### 2.13 Notifications (FR-NOTIF) — rewritten in v0.2

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-NOTIF-01 | P0 | Every user-facing event inserts one row in `notifications` (server side only). Types: `course_shared`, `shared_course_updated`, `share_revoked`, `share_member_joined` (to the owner, batched), `document_ready`, `document_failed`, `quiz_ready`, `recap_ready`, `reminder_exam`, `reminder_due`, `invite_joined`, `course_unavailable`. | Each row has a title, body, `target` (route + params), `actor_id` (nullable) and a `dedupe_key`. |
| FR-NOTIF-02 | P0 | **Real time while the app is open:** the app subscribes (Supabase Realtime, `postgres_changes` INSERT filtered to `user_id = me`) and shows a toast and the bell badge. | Insert → toast within 2 s (p95). Toast auto-hides after 6 s, can be swiped away, and tapping it opens the target and marks it read. |
| FR-NOTIF-03 | P0 | **Push when the app is in the background or closed** via Expo Push, respecting per-type settings (FR-HAB-08) and quiet hours. | Arrives within 30 s; tapping opens the target. Invalid tokens are removed after a `DeviceNotRegistered` receipt. |
| FR-NOTIF-04 | P0 | **Inbox** (screen 22): newest first, filters **All / Shared with me / Study**, unread dot, "N new" count, **Mark all read**, inline actions ("Add to library" for a pending share, "View" for others). | Paginated 30 at a time; rows older than 90 days are deleted. Any user can open it from the bell on Today. |
| FR-NOTIF-05 | P0 | Users can read only their own notifications and can only set `read_at` (through the API). | RLS select `user_id = auth.uid()`; no client insert/delete. |
| FR-NOTIF-06 | P0 | Batching: the same `dedupe_key` within 1 h updates the existing row instead of adding one ("Kemi added 3 notes to MTH 201"). | No more than one push per shared course per hour. |
| FR-NOTIF-07 | P0 | Catch-up: on app start, on foreground and after reconnecting, the app fetches unread rows newer than the last one it has, because Realtime can miss events while disconnected. | Killing the network for 5 min and reconnecting shows every missed notification. |

### 2.14 Today home (FR-HOME) — new in v0.2

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-HOME-01 | P0 | **Today** is the first tab and the screen after sign-in (tabs: Today, Library, Practice, Account). Header: avatar, date, notification bell with unread badge; greeting by time of day and first name. | Library keeps its content but is no longer the home. |
| FR-HOME-02 | P0 | **Exam countdown + readiness card** for the course with the nearest exam date (or the most studied course if none has a date): "CSC 225 exam in 12 days", readiness ring and "Up 18% this week". | With no exam dates, the card asks "When is your first exam?" and opens the course's date picker. |
| FR-HOME-03 | P0 | **Readiness** = average of topic mastery across the course's topics, weighted by topic length. **Topic mastery** = weighted accuracy of the student's last 10 answers on that topic (newer answers count more), 0 when unanswered. A topic is **mastered** at ≥ 80% over at least 5 answers. Computed on the server; cached per user and course. | "Up X% this week" compares with the value 7 days ago; hidden when there was no value then. Unit-tested with fixed fixtures. |
| FR-HOME-04 | P0 | **This week** strip: the 7 days (Mon–Sun) with studied days filled and "3 of 4 study days". | Uses the profile time zone (default Africa/Lagos). |
| FR-HOME-05 | P0 | **Today's plan** (about 15 min), up to 3 rows: **Daily 5** (if due), **Fix a weak topic** (lowest mastery topic with ≥ 3 answers and < 60%), **Learn something new** (first topic not yet opened, with reading time). Each row opens the right screen. | When nothing is due, the plan shows "Learn something new" and "Practise any course". New users see "Upload your first notes" and "Join a shared course". |
| FR-HOME-06 | P0 | Live notification toast on Today (FR-NOTIF-02) for shares, with "View". | — |

### 2.15 Habits and personalisation (FR-HAB) — new in v0.2

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-HAB-01 | P0 | **Daily 5:** a 5-question practice-mode set picked by the server: questions due for review first (Leitner boxes with gaps of 1, 3, 7 and 14 days; a wrong answer goes back to box 1), then questions from weak topics, then new questions. Objective types only, so it works offline once fetched. | Takes ~3 min. Doesn't count against the quiz generation limit. Finishing shows screen 15. |
| FR-HAB-02 | P0 | **Study day:** a day counts when the student answers at least 5 questions, finishes the Daily 5, or reads explanations for at least 2 minutes. | Offline activity counts when synced (by the local timestamp). |
| FR-HAB-03 | P0 | **Weekly goal:** 1–7 study days per week (default 4, set on Account or screen 15). "Weeks in a row" counts consecutive weeks where the goal was met; the current week never breaks it until it ends, and **one missed day never resets anything**. | Copy never uses guilt ("You lost your streak"). |
| FR-HAB-04 | P0 | **Study days grid** (screen 15): last 5 weeks, 4 intensity levels by questions answered (0, 1–9, 10–29, 30+), today outlined. | Accessible: each cell has a label ("Tue 20 Oct, 12 questions"). |
| FR-HAB-05 | P1 | **Celebrations** (screen 16) for: first time a topic is mastered, personal best on a quiz, readiness up 10 points, weekly goal met. At most one full-screen celebration per session; the rest are toasts. | Turned off under reduce motion (static version shown). |
| FR-HAB-06 | P1 | **Weekly recap** (screen 17), ready Sunday 6 PM local: questions answered, topics mastered, study days, readiness for the nearest exam. Rendered on the device as an image (no server rendering) and shared through the system share sheet (WhatsApp, Status, Save). The footer carries the student's invite link (FR-INV). | A toggle hides the name and institution on the image. Sends a `recap_ready` notification. |
| FR-HAB-07 | P1 | **Themes and study modes** (screen 18): accent colour Ink (default), Lagoon (unlock: first mastered topic), Ankara (10 topics mastered), Palm (weekly goal met 4 weeks in a row), Lavender (3 friends joined through your invite, FR-INV-05). **Night study mode:** dark theme from 9 PM to 6 AM, calmer animations. **Low-data mode:** prefetch only on Wi-Fi, no page images in citations, shows MB used this week. | Accent changes only rings, highlights and badges; contrast stays ≥ 4.5:1. Unlocks are computed on the server. Whether themes are part of a paid plan is undecided (PRD Q3). |
| FR-HAB-08 | P1 | **Reminders** (screen 21): one daily study reminder at a chosen time (default 7:30 PM), sent **only if the student hasn't studied that day**; toggles for Exam countdown, Questions due for review, Weekly recap on Sunday, Coursemate joins and challenges (off by default), Notes ready. Quiet hours (default 11 PM – 7 AM). | Never more than 2 reminder pushes a day; none in quiet hours. A scheduler in the worker runs every 15 min and uses the profile time zone. |

### 2.16 Security hardening (FR-SEC) — new in v0.2, from the v0.1 code review

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-SEC-01 | P0 | **Clients are read-only on the database.** Revoke `insert, update, delete` on every `public` table from `anon` and `authenticated`; replace `for all` policies with `for select` policies. All writes go through the API (service role) after ownership checks. | A test using the anon key + a user JWT gets `permission denied` on insert/update/delete for every table. |
| FR-SEC-02 | P0 | **The server owns storage paths.** Upload paths are generated as `uploads/{user_id}/{document_id}/{n}.{ext}`; client-supplied paths are never accepted. `upload_finished` checks the object exists, its size, and its type by magic bytes. | A document row pointing outside the user's prefix cannot be created. |
| FR-SEC-03 | P0 | **Bounded retries.** A job whose lease expired is reclaimed only while `attempts < max_attempts`; otherwise it is marked `failed` with reason `crashed`. | A file that crashes the worker every time fails after `max_attempts` and stops being retried. |
| FR-SEC-04 | P0 | **Resource caps in ingestion:** max 40 megapixels per rendered page or image; PPTX/ZIP uncompressed size ≤ 200 MB and compression ratio ≤ 100; sizes read from storage metadata before downloading; per-job timeout of 10 min. | Zip bombs and huge images fail with `too_large` without exhausting the worker. |
| FR-SEC-05 | P0 | **No refund after processing.** Deleting a document refunds the daily upload only if it never left `awaiting_upload`/`uploaded`. | Upload → ready → delete → upload again counts 2 uploads. |
| FR-SEC-06 | P0 | **Transient errors don't poison shared files.** Only permanent reasons (`encrypted`, `corrupt`, `no_text`, `too_large`) mark a `source_files` row failed; provider/network errors retry the job. | One provider outage doesn't fail later uploads of the same file. |
| FR-SEC-07 | P0 | **Shared copies.** When a source file reaches `ready`, it is copied to `shared/{sha256}` (service-owned) and documents reference that copy, so deleting the first uploader doesn't break others. Failed storage deletes are retried by a cleanup job. | Delete uploader A; uploader B's document still opens its pages. |
| FR-SEC-08 | P0 | **Global budget and sign-up throttling:** a daily LLM token/cost budget in config trips the circuit breaker (FR-LIM-03) when reached; sign-ups and OTP requests are rate-limited per IP and device. | Exceeding the budget queues work with the "High demand" message instead of spending more. |
| FR-SEC-09 | P0 | Session tokens in secure storage (FR-AUTH-06). | — |
| FR-SEC-10 | P0 | **Input caps:** written answers ≤ 5,000 characters, chat messages ≤ 2,000, report notes ≤ 500, course codes 2–12, titles ≤ 80. | Longer input returns 422 with a readable message. |
| FR-SEC-11 | P0 | **No dedupe side channel:** identical responses and timing floor for dedupe hits (FR-DOC-06). | — |
| FR-SEC-12 | P0 | **Exam mode doesn't leak answers:** correct answers and explanations are returned only after submission (exam) or after each answer (practice). | `GET /quizzes/{id}` in exam mode has no `answer` fields. |
| FR-SEC-13 | P0 | **Prompt hygiene:** document text is escaped so it can't close the prompt's delimiter tags; outputs stay schema-validated. | A document containing `</document>` doesn't change the prompt structure. |
| FR-SEC-14 | P0 | **Chat streaming hides raw markers:** the stream holds back partial citation markers until they're complete and cleaned. | The user never sees `[[chunk:…` fragments. |
| FR-SEC-15 | P0 | **Production config:** `ENV` must be set explicitly (the API refuses to start in production without it); OpenAPI `/docs` disabled in production; CORS allowlist only. | — |
| FR-SEC-16 | P0 | **Math rendering is local:** KaTeX assets are bundled with the app; the WebView only loads local content (`originWhitelist` restricted). | Works offline; no CDN requests. |
| FR-SEC-17 | P0 | **Short signed URLs:** upload URLs expire in 10 min, page view URLs in 5 min. | — |
| FR-SEC-18 | P0 | **Idempotent IDs:** client-generated attempt/answer UUIDs that already exist return 409 (or the existing record), never 500. | — |
| FR-SEC-19 | P0 | **Sharing and invite abuse controls:** see FR-SHARE-09/10 and FR-INV-03. | — |
| FR-SEC-20 | P0 | **Request rate limit:** every signed-in API request is counted per student per minute in Postgres (shared by all API instances); above `REQUESTS_PER_MINUTE` (120) the API returns 429 with `Retry-After: 60`. The counter commits even when the request then fails. | The 121st request in a minute gets 429; the next minute works again. |
| FR-SEC-21 | P0 | **Paused accounts:** an admin can set `profiles.suspended_at`; every API request from that student then gets 403 with the paused message (§4), except `DELETE /v1/me` (FR-AUTH-05). | The app shows the message; nothing else works until it's cleared. |
| FR-SEC-22 | P1 | **Profile photo cap:** at most `DAILY_AVATAR_UPLOADS` (10) photo changes a day, counted before the image work, so refused photos count too. | The 11th change in a day gets 429 with the message in §4. |

### 2.17 Course sharing (FR-SHARE) — new in v0.2

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-SHARE-01 | P0 | The owner of a course can share it (screen 19) **in Quizzly** with chosen people and/or with a **share link** `https://{INVITE_DOMAIN}/c/{code}`. People shown as quick picks are "coursemates": users who already share a course with you either way. Others are added by their Quizzly code (their invite code). There is no public user search. | Share codes are random, ≥ 8 characters (Crockford base32), one active code per course; "Copy" and "Share to WhatsApp" work. |
| FR-SHARE-02 | P0 | **What is shared:** the course's ready documents' outlines, explanations, question sets and the short quoted passages citations show. **Never shared:** original files and page images, the owner's scores, attempts, chats, topic overrides and progress. | The member API never returns a storage URL for a shared document. Citations in shared courses open a text-only quote view. |
| FR-SHARE-03 | P0 | In-app recipients get a `course_shared` notification in real time; the share is **pending** until they tap **Add to library** or **Not now** (decline). | Declined shares disappear for the recipient; the sender isn't told who declined. |
| FR-SHARE-04 | P0 | **Join preview** (screen 20) before adding: sharer's first name + last initial, course code and title, institution and level, counts of notes, topics and questions, member count (shown only when ≥ 3), and the promises "Ready now", "Your scores stay private", "New notes appear for you too". | Opening a share link while signed out goes through sign-in and onboarding, then lands here (FR-AUTH-07). |
| FR-SHARE-05 | P0 | A joined course appears in the member's Library with a "Shared by Ada" tag and is read-only (FR-DOC-12). Members can open explanations, generate quizzes (counted against **their** limits, cache shared), chat and track their own readiness. | Member activity is never visible to the owner beyond the member count and names. |
| FR-SHARE-06 | P0 | When the owner adds a document to a shared course, members get it automatically once it's `ready`, plus one batched `shared_course_updated` notification. | — |
| FR-SHARE-07 | P0 | The owner can see members (first name + last initial), remove a member, regenerate the link (old link stops working) and **Stop sharing** (everyone loses access; `share_revoked` notification). Members can **Leave**. | After revoke or removal, a member's past attempts on that course remain visible in their history as scores only. |
| FR-SHARE-08 | P0 | Only `ready` documents are shared; processing or failed documents are skipped until ready. | — |
| FR-SHARE-09 | P0 | **Receiving controls:** Account → Privacy setting "Who can send me courses": Coursemates only / Anyone with my code (default) / No one. Any user can **block** another from a share or notification (they can no longer send shares or appear as a coursemate). | Blocked users' shares are dropped silently. |
| FR-SHARE-10 | P0 | **Limits:** 20 direct recipients per day per sender; 300 members per course; share link resolve rate-limited to 30 per minute per IP. | Over-limit returns 429 with the FRD §4 copy. |
| FR-SHARE-11 | P0 | Shared courses can be reported and taken down (FR-MOD-04/05). | — |

### 2.18 Invites (FR-INV) — new in v0.2

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-INV-01 | P0 | Every user has an **invite code** (first name + digits, e.g. `TOLU7`; 5–10 characters, unique, case-insensitive) and link `https://{INVITE_DOMAIN}/i/{code}`. Screen 23 shows the link, Copy, a QR code (generated on the device), WhatsApp, Status/Story and the system share sheet. | — |
| FR-INV-02 | P0 | **Link routing** on the link service: Android with the app → Android App Link opens the app (verified with `/.well-known/assetlinks.json`); Android without the app → Play Store URL with `&referrer=invite%3D{code}` (or `share%3D{code}` for `/c/`); iPhone → landing page with the iPhone waitlist; desktop → landing page (screen 24) with a QR code. The landing shows the inviter's first name, institution and level (the inviter can hide these). | Works in WhatsApp's in-app browser. |
| FR-INV-03 | P0 | On first launch the app reads the **Play Install Referrer** once and stores the pending code (FR-AUTH-07). The inviter is **credited** only after the new user verifies their email, finishes onboarding and answers their first 5 questions. One credit per new account; no credit when the device has been credited before or the code is the user's own; at most 50 credits per inviter. | The inviter gets an `invite_joined` notification on credit. |
| FR-INV-04 | P0 | Screen 23 lists credited friends (first name + last initial) and progress to the next reward. | — |
| FR-INV-05 | P1 | **Reward:** 3 credited friends unlock the Lavender theme (FR-HAB-07). Other rewards wait for the plans decision (PRD Q3). | — |
| FR-INV-06 | P1 | **iPhone waitlist:** the landing page collects an email with consent and stores it in `waitlist` for launch. | Double opt-in email before storing as confirmed. |

## 3. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Performance | API p95 latency ≤ 300 ms for non-LLM endpoints; app cold start ≤ 3 s on a 2 GB RAM Android phone. |
| NFR-02 | Bandwidth | Home screen payload ≤ 50 KB; quiz payload ≤ 30 KB per 10 questions; images are never re-downloaded unnecessarily. |
| NFR-03 | Cost | ≤ $0/month for beta; ≤ $0.05 per monthly active user at scale ([Architecture §6](ARCHITECTURE.md#6-cost-strategy)). |
| NFR-04 | Availability | 99% monthly for the API in beta. If LLM providers fail, cached content stays usable. |
| NFR-05 | Security | Row-level security on every user table **with clients limited to `select` (FR-SEC-01)**; JWT check on every API call; signed, expiring storage URLs; secrets only in server environment variables; HTTPS only. |
| NFR-06 | Privacy | NDPA 2023: explicit consent, privacy policy, deletion on request, data minimisation, no sale of data, no training on user files. |
| NFR-07 | AI safety | Document text is treated as untrusted data; outputs are schema-validated; no model has tools that change data. |
| NFR-08 | Accessibility | Dynamic font size, minimum 4.5:1 contrast, screen-reader labels on interactive elements. |
| NFR-09 | Observability | Structured logs with request ID; error tracking (Sentry free tier); job metrics (queue depth, duration, failures). |
| NFR-10 | Maintainability | Prompts are versioned files with a `prompt_version` saved on every generated record; model names live in config. |
| NFR-11 | Quality | An evaluation set of ≥ 30 real course documents with expected outlines and checked questions, run in CI on prompt changes. |
| NFR-12 | Portability | No provider lock-in: every LLM provider sits behind one OpenAI-compatible interface. |
| NFR-13 | Real time | Realtime subscription only while the app is in the foreground; one channel per user; reconnect with backoff; catch-up fetch on reconnect (FR-NOTIF-07). Notification insert → toast ≤ 2 s p95. |
| NFR-14 | Engagement ethics | No guilt or fear copy, no fake urgency, no public rankings; every reminder type can be turned off; quiet hours respected (PRD R10). |
| NFR-15 | Brand type | Only two bundled font families: Bricolage Grotesque (headlines, big numbers) and Manrope (everything else). See DESIGN.md §4. |

## 4. Error states (user-facing)

| Situation | Message / behaviour |
|---|---|
| No internet | Offline banner; cached content still works; uploads and generations are queued |
| Daily limit reached | "You've used today's 15 quiz generations. Resets at 12:00 AM." |
| All LLM providers busy | Job stays queued; "High demand — we'll notify you when it's ready" |
| File unreadable | "We couldn't read this file (password-protected / damaged). Try exporting it again as PDF." |
| No text found | "This looks like images without readable text. Try clearer photos with good lighting." |
| Generation produced too few valid questions | "We made 7 good questions out of 10 — your notes on this topic are short." |
| Share link no longer works | "This course isn't shared any more. Ask Ada for a new link." |
| Share limit reached | "You've shared with 20 people today. You can share again tomorrow." |
| Too many requests (FR-SEC-20) | "Too many requests. Wait a minute and try again." |
| Account paused (FR-SEC-21) | "Your account is paused while we look into unusual activity. If you think this is a mistake, contact Quizzly support." |
| Photo changes limit (FR-SEC-22) | "You've changed your photo 10 times today. You can change it again tomorrow." |
| Shared course full | "This shared course is full. Ask Ada to make a new one, or upload the notes yourself." |
| Sharing blocked by recipient setting | Shown to the sender as sent; nothing is delivered (no leak of settings). |
| Course taken down | "This course is no longer available." |
| Invite code invalid | Landing page opens normally without the inviter card. |
| Realtime disconnected | Nothing shown; inbox catches up on reconnect. |

## 5. Traceability

| PRD story | FRD requirements |
|---|---|
| US-01, US-16 | FR-AUTH-01..05 |
| US-02 | FR-PROF-01..03 |
| US-03 | FR-CRS-01..03, FR-DOC-01..04 |
| US-04 | FR-DOC-05..08, FR-DOC-11 |
| US-05 | FR-TOP-01..03 |
| US-06, US-07 | FR-EXPL-01..05 |
| US-08 | FR-QGEN-01..08 |
| US-09, US-10, US-11 | FR-QUIZ-01..06 |
| US-12 | FR-CHAT-01..06 |
| US-13 | FR-OFF-01..03 |
| US-14 | FR-QUIZ-06..07 |
| US-15 | FR-MOD-01..05 |
| US-16 | FR-AUTH-05, FR-DOC-09 |
| US-17 | FR-HOME-01..06, FR-CRS-04 |
| US-18 | FR-HAB-01 |
| US-19 | FR-HAB-02..04 |
| US-20 | FR-HAB-05 |
| US-21 | FR-HAB-06 |
| US-22 | FR-HAB-07 |
| US-23 | FR-HAB-08, FR-NOTIF-03 |
| US-24 | FR-SHARE-01, 02, 06, 07, 08, 10 |
| US-25 | FR-SHARE-03..05, FR-AUTH-07 |
| US-26 | FR-NOTIF-01..07 |
| US-27 | FR-INV-01..06 |
| US-28 | FR-SHARE-09 |
| (all) | FR-SEC-01..19 |
