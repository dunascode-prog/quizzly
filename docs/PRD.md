# Quizzly — Product Requirements Document (PRD)

| | |
|---|---|
| **Status** | Draft v0.2 |
| **Date** | 2026-10-26 |
| **Owner** | Seyitan (product + engineering) |
| **Related** | [FRD](FRD.md) · [Architecture](ARCHITECTURE.md) · [Data models](DATA_MODELS.md) · [Data flows](DATA_FLOWS.md) · [Design](DESIGN.md) · [Build plan](BUILD_PLAN.md) |

### What changed in v0.2

- **New home: Today.** Students land on their progress (exam countdown, readiness, weekly goal, today's plan) instead of the library (§5 US-17..20).
- **Habits without guilt.** Daily 5 review, weekly goal of study days (a missed day never resets it), celebrations, a shareable weekly recap, unlockable accent themes, study reminders with quiet hours.
- **Course sharing between students.** A student can share a course's study content (outlines, explanations, questions) with coursemates, who use it without uploading. Original files, scores and chats are never shared. This replaces the v0.1 non-goal "no sharing between students" — see R3.
- **Real-time notifications inbox** for shares, new notes in shared courses, notes ready and recaps.
- **Invite links** that open the app, or the Play Store with the inviter credited.
- **New brand type:** Bricolage Grotesque (headlines) + Manrope (body). Sign-in screen redesigned to show what Quizzly does.
- **Security hardening** after the v0.1 code review (client writes, job retries, quota abuse) — see §10 R8–R10 and FRD §2.16.

---

## 1. Summary

Quizzly is an Android-first mobile app (iOS later) for Nigerian university students. A student uploads lecture notes or slides (PDF, PPTX, or photos of handwritten/printed notes), and Quizzly:

1. **Explains** the material more clearly, topic by topic, in plain language with examples.
2. **Generates practice questions** from it (multiple choice, true/false, fill-in-the-blank, short answer, and theory/essay questions in the style of Nigerian university exams), with answers and explanations.
3. **Answers questions** about the notes in a chat, always citing the slide or page the answer came from.
4. **Keeps students coming back** with a daily plan, exam readiness, gentle habits and progress they can share.
5. **Lets coursemates study together**: one student uploads, the class shares the study content.

Everything is grounded in the student's own material through retrieval-augmented generation (RAG) on open-source models. The system is built to run at close to $0/month during beta and stay cheap as it grows.

## 2. Problem

- Lecture slides at Nigerian universities are often bullet-point summaries that make little sense without the lecture, and many students miss lectures or can't follow them because of large classes, strikes, or timetable clashes.
- Students study from past questions, but past questions don't exist for every course, are often unavailable for new curricula, and come without worked answers.
- General chatbots (ChatGPT etc.) aren't grounded in *this lecturer's* notes, invent facts, cost money or data, and don't produce structured practice sessions.
- Mobile data is expensive and connectivity is unreliable, so heavy apps and constant streaming are a real barrier.
- Students revise in last-minute bursts. They lack a simple signal of "how ready am I?" and a small daily habit that fits around lectures and jobs.
- The same slides circulate in every class WhatsApp group. Making 300 students each upload and wait for the same deck wastes their data and our quota.

## 3. Goals and non-goals

### Goals (MVP)
- G1. A student can go from "upload PDF" to "first practice quiz" in under **3 minutes** for a typical 40-slide deck. A student who joins a **shared course** reaches their first question in under **30 seconds**.
- G2. At least **90%** of generated questions are answerable from the uploaded material (measured on an internal evaluation set).
- G3. Monthly infrastructure cost stays at **$0** for the closed beta (≤ 200 active students) and **under $100** at 2,000 monthly active users.
- G4. The app works on low-end Android phones (2 GB RAM, Android 9+) and on slow 3G connections.
- G5. Generated quizzes and explanations stay available **offline** once downloaded.
- G6. **Habit:** at least 35% of weekly active students meet their weekly study-day goal.
- G7. **Growth:** at least 30% of new sign-ups arrive through an invite link or a shared course.

### Non-goals (MVP)
- Not a general-purpose chatbot: answers outside the uploaded material are refused or clearly labelled.
- No lecturer/institution dashboard (a possible v2 B2B product).
- No sharing of **original files** between students, and no public course marketplace. Sharing is person-to-person or by link (see R3).
- No public leaderboards or rankings between students.
- No full handwriting recognition for messy handwriting (best-effort OCR only).
- No payments at launch (designed for, not built). Which features sit behind a paid plan is decided later (Q3).

## 4. Target users and personas

| Persona | Description | Key need |
|---|---|---|
| **Tolu, 200L Computer Science, UNILAG** | Has 30–60 slide PDFs per course from the class WhatsApp group. Studies the week before exams. | "Turn these slides into questions like the ones the lecturer will set." |
| **Chidi, 100L Medicine** | Huge volume of content, memorisation-heavy. | Flashcard-style drilling, spaced repetition, quick recall. |
| **Aisha, 300L Accounting, ABU** | Notes are photos of a classmate's handwritten notebook. Patchy data. | Upload images, get worked examples, use the app offline. |
| **Emeka, final year, part-time job** | Missed many lectures. | "Explain this topic like I've never seen it before." |
| **Ada, 200L CS, course rep** | Collects the slides for her class and posts them in the group. | "Share everything with my class once, so nobody has to upload it again." |

Primary market: undergraduates at Nigerian federal and state universities and polytechnics, starting with UNILAG as the launch campus. Secondary: JAMB/WAEC candidates and postgraduates (later).

## 5. User stories

### MVP (v0.1, unchanged)

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| US-01 | student | sign up with email or Google in under a minute | I can start without friction |
| US-02 | student | pick my school, department and level | content and question style fit my context |
| US-03 | student | create a course (e.g. "CSC 225") and upload PDFs/slides/photos into it | my materials stay organised |
| US-04 | student | see progress while my upload is processed and get notified when it's ready | I don't have to wait in the app |
| US-05 | student | see an auto-generated outline of topics in my notes | I can study one topic at a time |
| US-06 | student | read a clear explanation of a topic with examples and key terms | I understand what the slide meant |
| US-07 | student | choose "simpler" or "exam-focused" explanations | I can learn at my own level |
| US-08 | student | generate a quiz by topic, question type, difficulty and count | I can practise exactly what I need |
| US-09 | student | take the quiz in practice mode (instant feedback) or exam mode (timed, scored at the end) | I can both learn and test myself |
| US-10 | student | see the correct answer, explanation and source slide for every question | I can check the material and trust the answer |
| US-11 | student | write answers to theory questions and get them marked against a rubric | I can practise essay-style exams |
| US-12 | student | ask questions about my notes in chat, with page citations | I can clear up confusion quickly |
| US-13 | student | download quizzes and explanations for offline use | I can study without data |
| US-14 | student | see my score history and weak topics | I know what to revise |
| US-15 | student | report a wrong or bad question | the app gets better and I'm not misled |
| US-16 | student | delete my documents and my account | I control my data |

### MVP additions (v0.2)

| ID | As a… | I want to… | So that… |
|---|---|---|---|
| US-17 | student | open the app and see my exam countdown, how ready I am and today's short plan | I know exactly what to do in the next 15 minutes |
| US-18 | student | do a 5-question daily review of things I'm likely to forget | I keep knowledge fresh with little effort |
| US-19 | student | set a weekly goal of study days and see my study history | I build a habit without losing everything on one missed day |
| US-20 | student | get a small celebration when I master a topic or beat my best | progress feels rewarding |
| US-21 | student | share a weekly recap image to WhatsApp or my status | I can show my progress and bring friends along |
| US-22 | student | pick an accent colour, use night mode and a low-data mode | the app feels like mine and fits my phone and budget |
| US-23 | student | get one kind reminder at a time I choose, only if I haven't studied, never at night | I'm nudged without being nagged |
| US-24 | student (sharer) | share a course with coursemates in Quizzly or by link, and stop sharing later | my class studies without re-uploading, and I stay in control |
| US-25 | student (receiver) | preview a shared course and add it to my library in one tap | I can start studying in seconds |
| US-26 | student | see notifications appear instantly while the app is open, and read them all in one inbox | I never miss a share or a ready document |
| US-27 | student | invite friends with a link that opens the app or the Play Store | studying together is easy |
| US-28 | student | block someone or decline a share, and choose who can send me courses | I'm not spammed |

### Later (v1.1+)
- Spaced-repetition flashcards built from weak questions (the Daily 5 uses a simple version from day one).
- "Past-question mode": upload past questions, and the app generates similar questions from the notes.
- Combined quizzes across several documents in a course.
- Optional Nigerian Pidgin / Yoruba / Hausa / Igbo explanation styles.
- Premium tier paid through Paystack (higher limits, priority processing). Plan contents are decided later (Q3).
- Course challenges between friends (same 10 questions, compare privately).
- iOS app (iPhone users join a waitlist from invite links until then).

## 6. Features and priority

| Priority | Feature |
|---|---|
| **P0 (MVP)** | Auth; profile with school/department/level; courses with optional exam date; upload PDF/PPTX/images; background processing with status; topic outline; explanations (3 styles); question generation (MCQ, T/F, fill-blank, short answer, theory); practice and exam modes; answer explanations with citations; theory marking; chat with citations; offline cache; daily usage limits; report question; delete document/account; **Today home with readiness and today's plan; Daily 5; weekly goal and study days; course sharing (in-app and link) with revoke, leave, decline and block; real-time notifications inbox; push notifications; invite links with Play Store referral; security hardening (FRD §2.16)** |
| **P1** | Celebrations and theme unlocks; weekly recap image; themes, night mode and low-data mode; reminders with quiet hours; score history and weak topics; flashcards; multi-document quizzes |
| **P2** | Full spaced repetition; past-question mode; challenges; payments; local-language explanations |

## 7. Success metrics

| Metric | Target (first 3 months after beta) |
|---|---|
| Activation: signups who complete one quiz within 24 h | ≥ 50% |
| Time from upload to "ready" (p50 / p95, 40-slide PDF) | ≤ 60 s / ≤ 3 min |
| Time from opening a share link to first question (p50) | ≤ 30 s after sign-in |
| Questions reported as wrong | ≤ 3% of questions answered |
| Week-4 retention | ≥ 25% (stretch 35% with the v0.2 habit features) |
| Weekly goal met (share of weekly active students) | ≥ 35% |
| New sign-ups from invite or share links | ≥ 30% |
| Notification delivery while the app is open (insert → toast, p95) | ≤ 2 s |
| Grounding rate on eval set (question answerable from source) | ≥ 90% |
| Infra + LLM cost per monthly active user | ≤ $0.05 |
| Crash-free sessions | ≥ 99.5% |

## 8. Constraints and assumptions

- **Cost first.** Open-source models only (Llama, Qwen, Gemma, Mistral families), served through free tiers of hosted inference providers (Groq, OpenRouter, Cloudflare Workers AI), with no self-hosted GPU. Embeddings run on CPU inside our own worker.
- **Free-tier rate limits are the main bottleneck**, so work is queued, cached and deduplicated aggressively (see [Architecture §6](ARCHITECTURE.md#6-cost-strategy)). Course sharing adds to this: a shared course costs nothing extra to serve.
- **Bandwidth.** Files upload directly to object storage (not through our API server), API responses are small JSON, and generated content is cached on the device. Realtime uses one websocket only while the app is in the foreground.
- **Language.** Course material is assumed to be in English.
- **Devices.** Android 9+ and 2 GB RAM minimum; iOS supported by the same codebase but tested later.
- **Regulation.** Must comply with the Nigeria Data Protection Act (NDPA) 2023: consent, a privacy policy, data deletion, and minimal data collection. Sharing exposes only first name + last initial, institution and level to the people a student shares with.
- **Links.** Invite and share links need a short domain we own (placeholder `INVITE_DOMAIN`, decision Q4) and a Play Store listing.

## 9. Usage limits (free plan, initial values; configurable)

| Resource | Limit |
|---|---|
| Uploads | 5 documents/day, 25 MB and 150 pages per document |
| Question sets | 15 generations/day (cached repeats don't count) |
| Explanations | 30/day |
| Chat messages | 40/day |
| Theory answers marked | 20/day |
| Direct course shares | 20 recipients/day |
| Members per shared course | 300 |
| Reminders | at most 2 pushes/day, none in quiet hours |

Limits protect the shared free-tier quotas and can be raised once a paid plan exists. A document deleted **after** it was processed does not refund its upload.

## 10. Risks and open questions

| # | Risk / question | Mitigation / decision |
|---|---|---|
| R1 | Free-tier providers change limits or remove models | Provider abstraction with ordered fallbacks; model names in config, not code; budget for paid Groq usage (cents per 1,000 questions) |
| R2 | Hallucinated or wrong questions damage trust | Strict grounding prompts, JSON schema validation, answer-in-source check, citations on every question, report button, eval set |
| R3 | Copyright of lecturers' slides | **Decided (v0.2):** original files are never shared or downloadable by anyone but the uploader. Students may share *derived study content* (outlines, explanations, questions, and the short quoted passages that citations show) person-to-person or by link. Derived data is reused between byte-identical uploads without revealing who uploaded. Every shared course has Report; admins can take a course or file hash down (FR-MOD-04, now P0). Terms state that students only share material they're allowed to use for study. |
| R4 | Scanned or photo notes with poor OCR | Show an OCR quality warning; let the user retake photos; vision-model OCR as a P1 fallback |
| R5 | Supabase free projects pause after a week of inactivity | Keep-alive ping from the worker; move to Pro ($25/mo) at public launch |
| R6 | Prompt injection embedded in uploaded documents | Treat document text as data, delimit and escape it in prompts, validate output against a schema, never give the model tools that act on accounts |
| R7 | Students use it to cheat in CBT exams | Product is for revision; no live-exam features |
| R8 | Clients writing directly to tables could forge uploads, scores or consent and burn LLM quota | Client roles get read-only access; every write goes through the API, which validates storage paths and ownership (FRD §2.16) |
| R9 | Share and invite features used for spam or to farm rewards | Daily share limits, accept/decline, block, "who can send me courses" setting; referral credited only after the friend verifies email and finishes a quiz; one device credit per install |
| R10 | Engagement features feel manipulative | No guilt copy, weekly goals instead of fragile streaks, one reminder a day at most, quiet hours, everything can be switched off |
| Q1 | Monetisation model (freemium vs. campus ambassador vs. B2B)? | Decide before v1.1 |
| Q2 | Launch campus beyond UNILAG? | Suggest UNILAG + one more (e.g. UI or OAU) for the beta |
| Q3 | Which features (if any) sit behind a paid plan? | Deferred by the owner; build features without paywalls, keep limits configurable |
| Q4 | Domain for invite/share links | Needed before beta; links use `https://{INVITE_DOMAIN}/i/{code}` and `/c/{code}` |

## 11. Release plan

| Phase | Scope | Exit criteria |
|---|---|---|
| **M0: Foundations** | Docs, schema, repository, CI skeleton | Done |
| **M1: Ingestion** | Upload → extract → chunk → embed → outline | Done (20 real UNILAG decks process correctly) |
| **M2: Learn** | Explanations + chat with citations | Done; eval grounding ≥ 90% |
| **M3: Practise** | Question generation, quiz modes, grading, offline cache | Offline sync merged; internal dogfooding with 10 students |
| **M3.5: Harden** | FRD §2.16 security fixes, missing P0s (LLM call log, auto-hide, source viewer, circuit breaker) | All Critical/High items closed; tests added for each |
| **M4: Engage and share (v0.2)** | New type and sign-in, Today home, Daily 5, weekly goal, sharing, notifications inbox + push, invite links | Two classes share a course end to end; notifications ≤ 2 s |
| **M5: Closed beta** | Limits, reporting, analytics, Play Store internal testing, celebrations, recap, themes, reminders | 100–200 students, cost $0 |
| **M6: Public launch** | Play Store production, success metrics in §7 | — |
