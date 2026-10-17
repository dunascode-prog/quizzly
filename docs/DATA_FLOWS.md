# NoteGenie — Data Flow Diagrams

| | |
|---|---|
| **Status** | Draft v0.1 |
| **Date** | 2026-10-17 |
| **Related** | [Architecture](ARCHITECTURE.md) · [Data models](DATA_MODELS.md) |

**Notation used in every diagram:**

- `[Rectangle]` is an external entity (Student, Admin, LLM provider…).
- `(Rounded)` is a process.
- `[(Cylinder)]` is a data store (a table or a bucket).
- Arrow labels name the data that moves.

Process numbers match the level-1 diagram.

---

## 1. Level 0: context diagram

```mermaid
flowchart LR
    S[Student] -- "credentials, files, quiz answers, chat questions" --> P0((0. NoteGenie))
    P0 -- "outlines, explanations, quizzes, scores, chat answers" --> S
    A[Admin] -- "moderation decisions, limits, takedowns" --> P0
    P0 -- "reports, cost and usage figures" --> A
    P0 -- "prompts with note excerpts" --> L[LLM providers]
    L -- "generated text / JSON" --> P0
    P0 -- "push messages" --> E[Expo Push]
    E -- "notifications" --> S
```

## 2. Level 1: main processes

```mermaid
flowchart TB
    S[Student]
    L[LLM providers]
    A[Admin]

    P1(1. Manage account<br/>and profile)
    P2(2. Manage courses<br/>and documents)
    P3(3. Ingest document)
    P4(4. Explain topics)
    P5(5. Generate questions)
    P6(6. Run quiz and mark)
    P7(7. Chat with notes)
    P8(8. Moderate and<br/>give feedback)
    P9(9. Meter usage<br/>and cost)

    D1[(profiles, institutions)]
    D2[(courses, documents)]
    D3[(source_files, pages,<br/>chunks, topics)]
    D4[(explanations)]
    D5[(question_sets, questions)]
    D6[(quizzes, attempts, answers)]
    D7[(chat_threads, chat_messages)]
    D8[(reports, feedback)]
    D9[(jobs, llm_calls,<br/>usage_counters)]
    ST[(Storage bucket)]

    S -- profile data --> P1 <--> D1
    S -- file + metadata --> P2 --> D2
    S -- file bytes via signed URL --> ST
    P2 -- ingest job --> D9
    D9 -- job --> P3
    ST -- file --> P3 --> D3
    S -- topic + style --> P4
    D3 -- chunks --> P4 <--> L
    P4 --> D4 -- explanation --> S
    S -- quiz options --> P5
    D3 -- chunks by topic --> P5 <--> L
    P5 --> D5
    S -- answers --> P6
    D5 -- questions --> P6 <--> L
    P6 <--> D6
    P6 -- score, feedback --> S
    S -- question --> P7
    D3 -- retrieved chunks --> P7 <--> L
    P7 <--> D7
    P7 -- streamed answer --> S
    S -- report / rating --> P8 --> D8
    P8 -- hide question --> D5
    A <--> P8
    P4 & P5 & P6 & P7 --> P9 --> D9
    A <-- costs --> P9
```

---

## 3. Per-entity data flows

Each entity gets a diagram showing where its data comes from, which processes change it, and who reads it, followed by notes on create (C), read (R), update (U) and delete (D).

### 3.1 `profiles`

```mermaid
flowchart LR
    S[Student] -- sign up --> Auth[Supabase Auth]
    Auth -- "new auth user (trigger)" --> C(Create profile)
    C --> DP[(profiles)]
    S -- "name, institution, dept, level, consent" --> U(Onboarding / edit profile)
    DI[(institutions)] -- school list --> U
    U --> DP
    DP -- "profile, level, style" --> R(Personalise prompts and UI)
    R --> S
    S -- delete account --> D(Delete account job)
    D -- "soft delete then purge" --> DP
```

- **C:** a database trigger on `auth.users` insert. **U:** onboarding and settings. **R:** the app header and prompt context (level, preferred style). **D:** the `delete_account` job (FR-AUTH-05).

### 3.2 `institutions`

```mermaid
flowchart LR
    Seed[Seed script / Admin] -- "school list (CSV)" --> I(Import institutions)
    I --> DI[(institutions)]
    S[Student] -- search text --> Q(Search schools)
    DI -- matches --> Q --> S
    Q -- chosen id --> DP[(profiles)]
```

- **C/U/D:** admin only, through migrations or a seed script. **R:** the onboarding search (trigram match).

### 3.3 `courses`

```mermaid
flowchart LR
    S[Student] -- "code, title" --> C(Create / rename course)
    C --> DC[(courses)]
    DC -- course list --> R(List courses) --> S
    S -- delete + choice --> D(Delete course)
    D --> DC
    D -- "cascade or unfile" --> DD[(documents)]
```

- **R:** the home screen. **D:** asks whether to delete documents or move them to Unfiled (FR-CRS-03).

### 3.4 `documents`

```mermaid
flowchart LR
    S[Student] -- "filename, size, pages, course" --> P1(Register upload)
    LIM[(usage_counters)] -- "uploads today" --> P1
    P1 -- "row: awaiting_upload" --> DD[(documents)]
    P1 -- signed upload URL --> S
    S -- file bytes --> ST[(Storage)]
    S -- "upload complete" --> P2(Confirm upload)
    P2 -- "status: uploaded" --> DD
    P2 -- ingest_document job --> DJ[(jobs)]
    W(Worker: ingest) -- "status, source_file_id" --> DD
    DD -- "list, status, progress" --> S
    S -- "rename / move / delete" --> P3(Edit document)
    P3 --> DD
    P3 -- "purge job if orphaned" --> DJ
```

- **C:** `POST /documents` checks the limits (FR-DOC-02). **U:** confirmation, the worker's status updates, and edits by the student. **D:** cascades to quizzes and chats; a purge job runs if the source file is orphaned.

### 3.5 `source_files`

```mermaid
flowchart LR
    DJ[(jobs)] -- ingest job --> W(Worker: ingest)
    ST[(Storage)] -- file bytes --> W
    W -- sha256 --> L{Lookup by hash}
    DS[(source_files)] -- existing row? --> L
    L -- "hit: reuse id" --> DD[(documents)]
    L -- "miss: insert pending" --> DS
    W -- "status, page_count, low_ocr_pages" --> DS
    A[Admin] -- takedown --> B(Block hash)
    B -- "blocked = true" --> DS
    P(Purge job) -- "delete when no documents reference it" --> DS
```

- **C:** the worker, on a hash miss. **R:** dedup lookups and the document screen. **U:** the processing pipeline and takedowns. **D:** the purge job, once the reference count reaches zero.

### 3.6 `pages`

```mermaid
flowchart LR
    ST[(Storage)] -- file --> X(Extract text per page)
    X -- "no text" --> O(OCR Tesseract)
    O -- "text + confidence" --> CL(Clean text)
    X -- text --> CL
    CL --> DPg[(pages)]
    DPg -- page text --> CH(Chunker)
    DPg -- "page text (viewer fallback)" --> S[Student]
```

- **C:** the ingest pipeline. **R:** the chunker, and the citation page view. **D:** purged with the source file.

### 3.7 `chunks`

```mermaid
flowchart LR
    DPg[(pages)] -- page text --> CH(Chunk ~400 tokens)
    CH -- text --> EM(Embed bge-small)
    EM -- "content, vector, pages" --> DCk[(chunks)]
    OUT(Build outline) -- topic_id --> DCk
    DCk -- "hybrid search hits" --> RET(Retrieve)
    RET --> P4(Explain) & P5(Generate questions) & P7(Chat)
```

- **C:** chunk and embed. **U:** `topic_id` is set when the outline is built. **R:** retrieval for explanations, questions and chat. **D:** purge.

### 3.8 `topics`

```mermaid
flowchart LR
    DCk[(chunks)] -- "chunk texts + headings" --> OUT(Build outline)
    OUT -- "if no headings: grouping prompt" --> L[LLM]
    L -- "topic JSON" --> OUT
    OUT --> DT[(topics)]
    DT -- outline --> S[Student]
    DTO[(topic_overrides)] -- renames / merges --> V(Apply overrides) --> S
    DT --> V
    DT -- "topic ids, token counts" --> P5(Generate questions)
```

- **C:** the outline step of ingestion. **R:** the outline screen and question allocation. **D:** purge.

### 3.9 `topic_overrides` (P1)

```mermaid
flowchart LR
    S[Student] -- "rename / merge" --> E(Edit outline)
    E --> DTO[(topic_overrides)]
    DTO --> V(Merge with shared topics) --> S
```

- Overrides are private. They never change the shared `topics` rows.

### 3.10 `explanations`

```mermaid
flowchart LR
    S[Student] -- "topic, style" --> R(Request explanation)
    R -- cache lookup --> DE[(explanations)]
    DE -- "hit: content" --> S
    R -- "miss: limit check" --> LIM[(usage_counters)]
    R -- generate_explanation job --> DJ[(jobs)]
    DJ --> W(Worker: explain)
    DCk[(chunks)] -- topic chunks --> W
    W -- prompt --> L[LLM] -- markdown --> W
    W -- "content, citations, prompt_version" --> DE
    S -- "report / rating" --> M(Moderation) --> DR[(reports, feedback)]
```

- **C:** the worker, on a cache miss. **R:** every student with the same file. **U:** none (a new prompt version creates a new row). **D:** purge.

### 3.11 `question_sets`

```mermaid
flowchart LR
    S[Student] -- "topics, types, difficulty, count" --> R(Create quiz)
    R -- cache_key lookup --> DQS[(question_sets)]
    DQS -- "hit: set id" --> Q(Create quiz row)
    R -- "miss: insert pending + job" --> DQS
    R --> DJ[(jobs)]
    DJ --> W(Worker: generate questions)
    W -- "status, generated_count" --> DQS
```

- **C:** a cache miss, or "New questions" (`variant + 1`). **R:** quiz creation. **U:** the worker sets the status. **D:** purge.

### 3.12 `questions`

```mermaid
flowchart LR
    DT[(topics)] -- allocation --> W(Worker: generate)
    DCk[(chunks)] -- sampled chunks --> W
    W -- prompt --> L[LLM] -- "question JSON" --> V(Validate: schema, dedup,<br/>grounding, distractors)
    V -- valid --> DQ[(questions)]
    V -- "too few: top up ≤ 2×" --> W
    DQ -- questions --> APP(Quiz screen) --> S[Student]
    S -- report --> REP(Report) -- "≥ 3 reporters → hidden" --> DQ
    A[Admin] -- "review: fix / unhide / delete" --> DQ
```

- **C:** the generation worker, after validation. **R:** quizzes, and marking (answer + rubric). **U:** `report_count`, `hidden`, admin fixes. **D:** purge or admin.

### 3.13 `quizzes`

```mermaid
flowchart LR
    S[Student] -- options --> C(Create quiz)
    DQS[(question_sets)] -- set id --> C
    C --> DZ[(quizzes)]
    DZ -- "quiz + questions" --> DL(Download for offline) --> Cache[(Device SQLite)]
    DZ --> L(List quizzes) --> S
    S -- delete --> D(Delete) --> DZ
```

- **R:** the quiz list and the offline cache. **D:** by the student, or when the document is deleted.

### 3.14 `quiz_attempts`

```mermaid
flowchart LR
    S[Student] -- "start (client uuid)" --> ST(Start attempt)
    ST --> Cache[(Device outbox)]
    Cache -- sync when online --> API(Upsert attempt)
    API --> DA[(quiz_attempts)]
    S -- submit --> SUB(Submit)
    SUB -- "objective only" --> SC(Score) --> DA
    SUB -- "has theory/short" --> MJ(mark_answers job) --> DA
    DA -- "score, breakdown" --> RES(Results / history) --> S
```

- **C:** a client-generated ID makes offline syncs idempotent (FR-OFF-02). **U:** progress, submit, marking. **R:** results and weak topics.

### 3.15 `attempt_answers`

```mermaid
flowchart LR
    S[Student] -- answer --> DEV(Mark on device<br/>MCQ, T/F, fill-blank)
    DEV --> Cache[(Device outbox)]
    Cache -- sync --> API(Upsert answers)
    API -- "re-check objective answers" --> DAA[(attempt_answers)]
    DAA -- "short/theory answers" --> W(Worker: mark)
    DQ[(questions)] -- "model answer, rubric" --> W
    W -- prompt --> L[LLM] -- "score + criteria feedback" --> W
    W --> DAA
    DAA -- feedback --> S
```

- The server re-scores objective answers so scores can't be faked on the device. The LLM marks only free-text answers.

### 3.16 `chat_threads`

```mermaid
flowchart LR
    S[Student] -- "first question on a document" --> C(Create thread)
    C --> DCT[(chat_threads)]
    DCT -- thread list --> S
    S -- delete --> D(Delete thread) --> DCT
```

### 3.17 `chat_messages`

```mermaid
flowchart LR
    S[Student] -- question --> P(Chat endpoint)
    LIM[(usage_counters)] -- limit check --> P
    DCM[(chat_messages)] -- last 6 turns --> P
    DCk[(chunks)] -- hybrid retrieval --> P
    P -- "prompt with excerpts" --> L[LLM]
    L -- token stream --> P
    P -- SSE stream --> S
    P -- "user + assistant messages, citations, grounded" --> DCM
```

- **C:** each turn stores the student's message and the assistant's reply. **R:** thread history. **D:** with the thread, the document or the account.

### 3.18 `reports`

```mermaid
flowchart LR
    S[Student] -- "target, reason, note" --> R(Report content)
    R --> DR[(reports)]
    R -- "count distinct reporters" --> DQ[(questions)]
    DR -- open reports --> A[Admin]
    A -- "resolve / dismiss" --> DR
```

### 3.19 `feedback`

```mermaid
flowchart LR
    S[Student] -- "thumbs up/down" --> F(Rate)
    F --> DF[(feedback)]
    DF -- "aggregates by prompt_version" --> AN(Quality analysis) --> A[Admin]
```

### 3.20 `jobs`

```mermaid
flowchart LR
    API(API endpoints) -- "enqueue (dedupe_key)" --> DJ[(jobs)]
    DJ -- "claim: FOR UPDATE SKIP LOCKED" --> W(Worker loop)
    W -- "progress %" --> DJ
    W -- "success / failure / retry with run_after" --> DJ
    DJ -- "status, progress" --> API --> S[Student]
    W -- "on finish" --> PU(Send push) --> E[Expo Push]
```

- Retries use exponential backoff. When an LLM rate limit is hit, the job is put back with `run_after`, so it waits instead of failing (FR-LIM-03).

### 3.21 `llm_calls`

```mermaid
flowchart LR
    GW(LLM gateway) -- "provider, model, tokens, latency, status" --> DLC[(llm_calls)]
    DLC -- "daily cost view" --> A[Admin]
    DLC -- error rates --> CB(Circuit breaker) --> DPL[(provider_limits)]
```

### 3.22 `usage_counters`

```mermaid
flowchart LR
    API(Metered endpoint) -- "check count < limit" --> DU[(usage_counters)]
    API -- "increment on success (not on cache hit)" --> DU
    DU -- "remaining today" --> S[Student]
    DU -- "over limit → 429 with reset time" --> S
```

### 3.23 `push_tokens`

```mermaid
flowchart LR
    S[Student device] -- "Expo push token" --> R(Register token) --> DPT[(push_tokens)]
    DPT -- tokens --> W(Worker: notify) --> E[Expo Push]
    E -- "invalid token receipt" --> CL(Clean up) --> DPT
```

### 3.24 `provider_limits`

```mermaid
flowchart LR
    GW(LLM gateway) -- "reserve request + tokens" --> DPL[(provider_limits)]
    DPL -- "allowed / wait time" --> GW
    GW -- "429 burst → open circuit" --> DPL
    CFG[models.yaml] -- "RPM / TPM limits" --> GW
```

### 3.25 `worker_heartbeats`

```mermaid
flowchart LR
    W(Worker) -- "every 60 s" --> DH[(worker_heartbeats)]
    DH -- "stale > 3 min" --> AL(Alert / restart) --> A[Admin]
    DH -. "keeps Supabase project active" .-> SB[Supabase]
```

---

## 4. End-to-end sequences

### 4.1 Upload to ready

```mermaid
sequenceDiagram
    autonumber
    participant App
    participant API
    participant DB as Postgres
    participant St as Storage
    participant W as Worker
    App->>API: POST /documents {filename, size, pages, course_id}
    API->>DB: check limits, insert document (awaiting_upload)
    API-->>App: {document_id, signed_upload_url}
    App->>St: PUT file
    App->>API: POST /documents/{id}/uploaded
    API->>DB: status=uploaded, enqueue ingest_document
    W->>DB: claim job
    W->>St: download, sha256
    alt hash already processed
        W->>DB: link source_file, status=ready
    else new file
        W->>W: extract → OCR → clean → chunk → embed
        W->>DB: pages, chunks
        W->>W: build outline (LLM if no headings)
        W->>DB: topics, status=ready
    end
    W-->>App: push "Your notes are ready"
    App->>API: GET /documents/{id}/outline
```

### 4.2 Generate a quiz

```mermaid
sequenceDiagram
    autonumber
    participant App
    participant API
    participant DB as Postgres
    participant W as Worker
    participant LLM
    App->>API: POST /quizzes {document_id, topic_ids, types, difficulty, count}
    API->>DB: lookup question_set by cache_key
    alt cache hit
        API->>DB: insert quiz
        API-->>App: quiz (ready)
    else miss
        API->>DB: check + increment usage, insert set (pending), enqueue job, insert quiz
        API-->>App: quiz (generating)
        W->>DB: claim job, load topics + chunks
        loop per topic batch
            W->>LLM: grounded question prompt (JSON)
            LLM-->>W: questions
            W->>W: validate (schema, dedup, grounding)
        end
        W->>DB: questions, set=ready
        App->>API: poll GET /quizzes/{id}
        API-->>App: questions
    end
```

### 4.3 Chat

```mermaid
sequenceDiagram
    autonumber
    participant App
    participant API
    participant DB as Postgres
    participant LLM
    App->>API: POST /chat/{thread_id}/messages {text}
    API->>DB: limit check, last 6 turns
    API->>API: embed question (bge-small)
    API->>DB: hybrid search chunks (source_file)
    API->>LLM: stream completion with excerpts
    LLM-->>API: tokens
    API-->>App: SSE tokens + final citations
    API->>DB: save both messages
```
