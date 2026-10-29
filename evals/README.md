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

A case is `cases/<course>-<topic>.json`. **Real course documents** are copyrighted, so the file
itself goes in `evals/data/` (git-ignored) and only the case's expectations are committed:

```json
{
  "course": "CSC 225 Data Structures",
  "file": "csc225-week5-stacks.pdf",
  "expected": {
    "topics": [3, 6],
    "topic_keywords": ["stack", "queue"],
    "must_cover": [["LIFO", "last in first out"], "push"],
    "banned": []
  }
}
```

A case whose file isn't on the machine (as in CI) is skipped and listed in the report. A case can
instead carry its own sample `pages` (`[["Page heading", "A line of text"], ...]`, one PDF page
each); the six cases committed here are original sample notes written for this set, so CI always
has something to run. A `must_cover` entry can list alternative wordings.

**NFR-11 asks for at least 30 real course documents.** Add real lecture notes (PDF or PPTX) that
lecturers or students agreed to use for testing, with a case file each. To run them in CI too, the
files would need to come from private storage at run time; they must never be committed.
