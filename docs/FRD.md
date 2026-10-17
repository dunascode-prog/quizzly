# NoteGenie — Functional Requirements Document (FRD)

| | |
|---|---|
| **Status** | Draft v0.1 |
| **Date** | 2026-10-17 |
| **Related** | [PRD](PRD.md) · [Architecture](ARCHITECTURE.md) · [Data models](DATA_MODELS.md) · [Data flows](DATA_FLOWS.md) |

This document says **what the system must do**, precisely enough to build and test against. Each requirement has an ID (`FR-<AREA>-NN`), a priority (P0 = MVP, P1, P2) and acceptance criteria. User stories (`US-xx`) refer to the [PRD](PRD.md#5-user-stories-mvp).

---

## 1. Actors

| Actor | Description |
|---|---|
| **Student** | Authenticated end user of the mobile app |
| **Guest** | Unauthenticated visitor (can only see onboarding and sign in) |
| **Admin** | Team member using the Supabase dashboard / admin scripts to moderate reports and adjust limits |
| **Worker** | Background process that runs ingestion and generation jobs |
| **LLM provider** | External inference API (Groq, OpenRouter, Cloudflare Workers AI) |
| **Supabase** | Auth, Postgres (+pgvector), and Storage |

## 2. Functional requirements

### 2.1 Authentication and account (FR-AUTH)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-AUTH-01 | P0 | Students can sign up and sign in with an **email one-time code** or **Google**. | Code is 6 digits, expires in 10 min, max 5 attempts; Google sign-in works on Android. |
| FR-AUTH-02 | P0 | The session persists across app restarts and refreshes silently. | Student stays signed in for 30 days of inactivity; token refresh happens without a prompt. |
| FR-AUTH-03 | P0 | The student must accept the Terms and Privacy Policy before using the app. | Consent timestamp and policy version are stored on the profile. |
| FR-AUTH-04 | P0 | The student can sign out on the device. | Local cache is cleared on sign-out. |
| FR-AUTH-05 | P0 | The student can delete their account. | All documents, derived user data and storage objects owned only by them are deleted within 24 h (NDPA). A confirmation screen is required. |

> SMS/phone OTP is excluded because SMS costs money per message.

### 2.2 Profile and onboarding (FR-PROF)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-PROF-01 | P0 | On first sign-in the student sets full name, institution (searchable list), department, and level (100L–700L, or "Other"). | Can't reach the home screen until institution and level are set; values are editable later. |
| FR-PROF-02 | P0 | The institution list is seeded with Nigerian universities, polytechnics and colleges of education. | Search matches name and short name ("UNILAG", "University of Lagos"). "My school isn't listed" stores free text. |
| FR-PROF-03 | P1 | The student can set a preferred explanation style (standard / simple / exam-focused). | It becomes the default in FR-EXPL-02. |

### 2.3 Courses (FR-CRS)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-CRS-01 | P0 | The student can create, rename and delete courses with a code (e.g. "CSC 225") and an optional title. | Code is 2–12 characters; duplicate codes for the same student are rejected. |
| FR-CRS-02 | P0 | Documents can be uploaded into a course or left unfiled. | An "Unfiled" view lists documents without a course. |
| FR-CRS-03 | P0 | Deleting a course asks whether to delete its documents or move them to Unfiled. | Both options work. |

### 2.4 Document upload and processing (FR-DOC)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-DOC-01 | P0 | The student can upload **PDF**, **PPTX**, or **1–30 images (JPG/PNG)** captured with the camera or picked from the gallery. | Images are combined into one document in the order chosen. |
| FR-DOC-02 | P0 | Upload limits: 25 MB and 150 pages per document; 5 uploads per day (configurable). | Over-limit files are rejected **before** upload with a clear message. |
| FR-DOC-03 | P0 | Files upload **directly to object storage** through a short-lived signed URL; the API only registers the upload. | The API server never receives file bytes. A signed URL expires after 10 minutes. |
| FR-DOC-04 | P0 | Uploads can resume or retry after a network drop. | A failed upload can be retried from the document list without picking the file again (while the app is open). |
| FR-DOC-05 | P0 | After upload, the system processes the document in the background: extract text → OCR where needed → clean → split into chunks → embed → build topic outline. | Status moves `uploaded → processing → ready` or `failed` (with a readable reason). Progress percentage is shown. |
| FR-DOC-06 | P0 | **Deduplication:** if a file with the same SHA-256 hash has already been processed, its derived data is reused and the document is ready almost immediately. | A second upload of an identical file reaches `ready` in under 5 s and costs no LLM calls. The student never learns that someone else uploaded it. |
| FR-DOC-07 | P0 | Scanned pages and images are OCR'd. If OCR confidence is low, the document is still processed but flagged. | A banner says "Some pages were hard to read"; the affected pages are listed. |
| FR-DOC-08 | P0 | Password-protected, corrupt or text-less files fail gracefully. | Status `failed` with reason `encrypted`, `corrupt`, `no_text` or `too_large`. |
| FR-DOC-09 | P0 | The student can rename, move and delete documents. | Deleting removes the student's document and everything tied to it (quizzes, attempts, chats). Shared derived data is removed only when no document references it. |
| FR-DOC-10 | P0 | The student can view the original file inside the app. | PDF renders in an in-app viewer; citations deep-link to the page. |
| FR-DOC-11 | P1 | Push notification when processing finishes, if the app is in the background. | Arrives within 30 s of the status changing to `ready`/`failed`. |

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

### 2.12 Feedback and moderation (FR-MOD)

| ID | Pri | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-MOD-01 | P0 | The student can report a question, explanation or chat answer as wrong, unclear or inappropriate, with an optional note. | A report is stored and visible to the admin. |
| FR-MOD-02 | P0 | A question reported by 3 different students is hidden from new quizzes until reviewed. | — |
| FR-MOD-03 | P0 | Thumbs up/down on explanations and chat answers. | Stored for quality analysis. |
| FR-MOD-04 | P1 | Copyright takedown: admin can block a file hash, deleting derived data and preventing re-processing. | — |

### 2.13 Notifications (FR-NOTIF)

| ID | Pri | Requirement |
|---|---|---|
| FR-NOTIF-01 | P1 | Push when a document or quiz finishes processing (Expo Push, free). |
| FR-NOTIF-02 | P2 | Revision reminders at a time the student chooses. |

## 3. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Performance | API p95 latency ≤ 300 ms for non-LLM endpoints; app cold start ≤ 3 s on a 2 GB RAM Android phone. |
| NFR-02 | Bandwidth | Home screen payload ≤ 50 KB; quiz payload ≤ 30 KB per 10 questions; images are never re-downloaded unnecessarily. |
| NFR-03 | Cost | ≤ $0/month for beta; ≤ $0.05 per monthly active user at scale ([Architecture §6](ARCHITECTURE.md#6-cost-strategy)). |
| NFR-04 | Availability | 99% monthly for the API in beta. If LLM providers fail, cached content stays usable. |
| NFR-05 | Security | Row-level security on every user table; JWT check on every API call; signed, expiring storage URLs; secrets only in server environment variables; HTTPS only. |
| NFR-06 | Privacy | NDPA 2023: explicit consent, privacy policy, deletion on request, data minimisation, no sale of data, no training on user files. |
| NFR-07 | AI safety | Document text is treated as untrusted data; outputs are schema-validated; no model has tools that change data. |
| NFR-08 | Accessibility | Dynamic font size, minimum 4.5:1 contrast, screen-reader labels on interactive elements. |
| NFR-09 | Observability | Structured logs with request ID; error tracking (Sentry free tier); job metrics (queue depth, duration, failures). |
| NFR-10 | Maintainability | Prompts are versioned files with a `prompt_version` saved on every generated record; model names live in config. |
| NFR-11 | Quality | An evaluation set of ≥ 30 real course documents with expected outlines and checked questions, run in CI on prompt changes. |
| NFR-12 | Portability | No provider lock-in: every LLM provider sits behind one OpenAI-compatible interface. |

## 4. Error states (user-facing)

| Situation | Message / behaviour |
|---|---|
| No internet | Offline banner; cached content still works; uploads and generations are queued |
| Daily limit reached | "You've used today's 15 quiz generations. Resets at 12:00 AM." |
| All LLM providers busy | Job stays queued; "High demand — we'll notify you when it's ready" |
| File unreadable | "We couldn't read this file (password-protected / damaged). Try exporting it again as PDF." |
| No text found | "This looks like images without readable text. Try clearer photos with good lighting." |
| Generation produced too few valid questions | "We made 7 good questions out of 10 — your notes on this topic are short." |

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
| US-15 | FR-MOD-01..03 |
