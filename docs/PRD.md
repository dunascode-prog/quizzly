# Quizzly — Product Requirements Document (PRD)

| | |
|---|---|
| **Status** | Draft v0.1 |
| **Date** | 2026-10-17 |
| **Owner** | Seyitan (product + engineering) |
| **Related** | [FRD](FRD.md) · [Architecture](ARCHITECTURE.md) · [Data models](DATA_MODELS.md) · [Data flows](DATA_FLOWS.md) |

---

## 1. Summary

Quizzly is an Android-first mobile app (iOS later) for Nigerian university students. A student uploads lecture notes or slides (PDF, PPTX, or photos of handwritten/printed notes), and Quizzly:

1. **Explains** the material more clearly, topic by topic, in plain language with examples.
2. **Generates practice questions** from it (multiple choice, true/false, fill-in-the-blank, short answer, and theory/essay questions in the style of Nigerian university exams), with answers and explanations.
3. **Answers questions** about the notes in a chat, always citing the slide or page the answer came from.

Everything is grounded in the student's own material through retrieval-augmented generation (RAG) on open-source models. The system is built to run at close to $0/month during beta and stay cheap as it grows.

## 2. Problem

- Lecture slides at Nigerian universities are often bullet-point summaries that make little sense without the lecture, and many students miss lectures or can't follow them because of large classes, strikes, or timetable clashes.
- Students study from past questions, but past questions don't exist for every course, are often unavailable for new curricula, and come without worked answers.
- General chatbots (ChatGPT etc.) aren't grounded in *this lecturer's* notes, invent facts, cost money or data, and don't produce structured practice sessions.
- Mobile data is expensive and connectivity is unreliable, so heavy apps and constant streaming are a real barrier.

## 3. Goals and non-goals

### Goals (MVP)
- G1. A student can go from "upload PDF" to "first practice quiz" in under **3 minutes** for a typical 40-slide deck.
- G2. At least **90%** of generated questions are answerable from the uploaded material (measured on an internal evaluation set).
- G3. Monthly infrastructure cost stays at **$0** for the closed beta (≤ 200 active students) and **under $100** at 2,000 monthly active users.
- G4. The app works on low-end Android phones (2 GB RAM, Android 9+) and on slow 3G connections.
- G5. Generated quizzes and explanations stay available **offline** once downloaded.

### Non-goals (MVP)
- Not a general-purpose chatbot: answers outside the uploaded material are refused or clearly labelled.
- No lecturer/institution dashboard (a possible v2 B2B product).
- No sharing of documents between students (copyright exposure; see §10).
- No full handwriting recognition for messy handwriting (best-effort OCR only).
- No payments at launch (designed for, not built).

## 4. Target users and personas

| Persona | Description | Key need |
|---|---|---|
| **Tolu, 200L Computer Science, UNILAG** | Has 30–60 slide PDFs per course from the class WhatsApp group. Studies the week before exams. | "Turn these slides into questions like the ones the lecturer will set." |
| **Chidi, 100L Medicine** | Huge volume of content, memorisation-heavy. | Flashcard-style drilling, spaced repetition, quick recall. |
| **Aisha, 300L Accounting, ABU** | Notes are photos of a classmate's handwritten notebook. Patchy data. | Upload images, get worked examples, use the app offline. |
| **Emeka, final year, part-time job** | Missed many lectures. | "Explain this topic like I've never seen it before." |

Primary market: undergraduates at Nigerian federal and state universities and polytechnics, starting with UNILAG as the launch campus. Secondary: JAMB/WAEC candidates and postgraduates (later).

## 5. User stories (MVP)

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

### Later (v1.1+)
- Spaced-repetition flashcards built from weak questions.
- "Past-question mode": upload past questions, and the app generates similar questions from the notes.
- Study streaks, reminders and push notifications for scheduled revision.
- Combined quizzes across several documents in a course.
- Optional Nigerian Pidgin / Yoruba / Hausa / Igbo explanation styles.
- Premium tier paid through Paystack (higher limits, priority processing).
- Group study rooms (shared quizzes among friends, without sharing source files).

## 6. Features and priority

| Priority | Feature |
|---|---|
| **P0 (MVP)** | Auth; profile with school/department/level; courses; upload PDF/PPTX/images; background processing with status; topic outline; explanations (3 styles); question generation (MCQ, T/F, fill-blank, short answer, theory); practice and exam modes; answer explanations with citations; theory marking; chat with citations; offline cache; daily usage limits; report question; delete document/account |
| **P1** | Push notifications when processing finishes; score history and weak topics; flashcards; multi-document quizzes |
| **P2** | Spaced repetition; past-question mode; streaks; payments; local-language explanations; study groups |

## 7. Success metrics

| Metric | Target (first 3 months after beta) |
|---|---|
| Activation: signups who complete one quiz within 24 h | ≥ 50% |
| Time from upload to "ready" (p50 / p95, 40-slide PDF) | ≤ 60 s / ≤ 3 min |
| Questions reported as wrong | ≤ 3% of questions answered |
| Week-4 retention | ≥ 25% |
| Grounding rate on eval set (question answerable from source) | ≥ 90% |
| Infra + LLM cost per monthly active user | ≤ $0.05 |
| Crash-free sessions | ≥ 99.5% |

## 8. Constraints and assumptions

- **Cost first.** Open-source models only (Llama, Qwen, Gemma, Mistral families), served through free tiers of hosted inference providers (Groq, OpenRouter, Cloudflare Workers AI), with no self-hosted GPU. Embeddings run on CPU inside our own worker.
- **Free-tier rate limits are the main bottleneck**, so work is queued, cached and deduplicated aggressively (see [Architecture §6](ARCHITECTURE.md#6-cost-strategy)).
- **Bandwidth.** Files upload directly to object storage (not through our API server), API responses are small JSON, and generated content is cached on the device.
- **Language.** Course material is assumed to be in English.
- **Devices.** Android 9+ and 2 GB RAM minimum; iOS supported by the same codebase but tested later.
- **Regulation.** Must comply with the Nigeria Data Protection Act (NDPA) 2023: consent, a privacy policy, data deletion, and minimal data collection.

## 9. Usage limits (free plan, initial values; configurable)

| Resource | Limit |
|---|---|
| Uploads | 5 documents/day, 25 MB and 150 pages per document |
| Question sets | 15 generations/day (cached repeats don't count) |
| Explanations | 30/day |
| Chat messages | 40/day |
| Theory answers marked | 20/day |

Limits protect the shared free-tier quotas and can be raised once a paid plan exists.

## 10. Risks and open questions

| # | Risk / question | Mitigation / decision needed |
|---|---|---|
| R1 | Free-tier providers change limits or remove models | Provider abstraction with ordered fallbacks; model names in config, not code; budget for paid Groq usage (cents per 1,000 questions) |
| R2 | Hallucinated or wrong questions damage trust | Strict grounding prompts, JSON schema validation, answer-in-source check, citations on every question, report button, eval set |
| R3 | Copyright of lecturers' slides | Documents are private to the uploader; no sharing between users; takedown process in Terms. **Decision needed:** may we reuse *derived* content (chunks, questions) between users who upload byte-identical files? Recommended: yes for embeddings/questions (never exposing the file or who uploaded it), since this is the biggest cost saver |
| R4 | Scanned or photo notes with poor OCR | Show an OCR quality warning; let the user retake photos; vision-model OCR as a P1 fallback |
| R5 | Supabase free projects pause after a week of inactivity | Keep-alive ping from the worker; move to Pro ($25/mo) at public launch |
| R6 | Prompt injection embedded in uploaded documents | Treat document text as data, delimit it in prompts, validate output against a schema, never give the model tools that act on accounts |
| R7 | Students use it to cheat in CBT exams | Product is for revision; no live-exam features |
| Q1 | Monetisation model (freemium vs. campus ambassador vs. B2B)? | Decide before v1.1 |
| Q2 | Launch campus beyond UNILAG? | Suggest UNILAG + one more (e.g. UI or OAU) for the beta |

## 11. Release plan

| Phase | Scope | Exit criteria |
|---|---|---|
| **M0: Foundations** (this repo) | Docs, schema, repository, CI skeleton | Docs reviewed; Supabase project created |
| **M1: Ingestion** | Upload → extract → chunk → embed → outline | 20 real UNILAG decks process correctly |
| **M2: Learn** | Explanations + chat with citations | Eval grounding ≥ 90% |
| **M3: Practise** | Question generation, quiz modes, grading, offline cache | Internal dogfooding with 10 students |
| **M4: Closed beta** | Limits, reporting, analytics, Play Store internal testing | 100–200 students, cost $0 |
| **M5: Public launch** | Play Store production, push notifications, P1 features | Success metrics in §7 |
