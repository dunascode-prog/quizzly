# Evaluation set (NFR-11)

Checks that outlines, questions and flashcards stay good when prompts, the RAG pipeline or model
routing change. Each case runs through the real pipeline (PDF → text → outline → questions and
flashcards) with the real prompts, validators and LLM routing. No database is needed.

## Run it

```sh
cd services/api
uv run python ../../evals/run.py                 # every case
uv run python ../../evals/run.py bio101-cell     # one case
```

It needs the LLM keys from `services/api/.env` (or the environment). It writes `report.md` and
`report.json` here, and exits 1 when a metric falls below `thresholds.json`.

CI runs it on every pull request that changes `services/api/prompts/`, `services/api/app/rag/`,
`services/api/config/models.yaml` or `evals/`. The repository needs the LLM keys as secrets
(`GROQ_API_KEY`, `OPENROUTER_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`); without
them the job warns and skips.

## What's measured

| Metric | Meaning |
|---|---|
| `outline_in_range` | Share of cases whose topic count is inside the expected range |
| `outline_recall` | Share of expected topic keywords found in the topic titles |
| `question_valid_rate` | Questions that passed validation (grounding, format, citations) out of those asked |
| `question_coverage` | Share of each case's key facts that some question tests |
| `flashcard_valid_rate` | The same as the question valid rate, for flashcards |
| `leaks` | Banned phrases (e.g. a past paper's exact wording) found in the output; must be 0 |

## Add a case

Add `cases/<course>-<topic>.json`:

```json
{
  "course": "CSC 225 Data Structures",
  "pages": [["Page heading", "A line of text", "..."], ["Next page heading", "..."]],
  "expected": {
    "topics": [3, 6],
    "topic_keywords": ["stack", "queue"],
    "must_cover": [["LIFO", "last in first out"], "push"],
    "banned": []
  }
}
```

Each `pages` item becomes one PDF page. A `must_cover` entry can list alternative wordings.

**NFR-11 asks for at least 30 real course documents.** The six cases here are original sample notes
written for this set; replace and extend them with real lecture notes that lecturers or students have
agreed to share. Keep them in plain text as above, never the original files, and never add anything
the uploader didn't agree to share.
