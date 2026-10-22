# Quizzly API and worker

One Python codebase, two processes: the FastAPI **api** and the background **worker**.

## Run it

```bash
pip install uv                 # once
uv sync
cp .env.example .env           # then fill in the values
uv run uvicorn app.main:app --reload --host 0.0.0.0   # API on port 8000 (docs at /docs)
uv run python -m app.worker.main          # worker (needs DATABASE_URL)
```

**OCR (scanned PDFs and photos)** needs [Tesseract](https://github.com/tesseract-ocr/tesseract) where the
worker runs. Windows: install the 64-bit build from https://github.com/UB-Mannheim/tesseract/wiki to the default
folder (`C:\Program Files\Tesseract-OCR`), and the worker finds it. Elsewhere it must be on `PATH`, or set
`TESSERACT_CMD`. The Docker image installs it.

The API starts without a database (it logs a warning), so `/healthz` works before Supabase is set up.
`--host 0.0.0.0` lets a phone on the same Wi-Fi reach it (set `EXPO_PUBLIC_API_URL` to your PC's LAN IP).

On Windows, keep `--reload` or add `--loop asyncio:SelectorEventLoop`: without either, uvicorn uses the
Proactor event loop, which psycopg's async mode can't use, and every database call fails.

## Checks

```bash
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
```

## Structure

| Path | What it holds |
|---|---|
| `app/main.py` | App factory, request-ID middleware, DB pool lifecycle |
| `app/api/routes.py` | HTTP routes: `/healthz`, `/v1/me` (GET/PATCH), `/v1/institutions` |
| `app/api/courses.py`, `app/api/documents.py` | Courses, uploads (signed URLs), documents, `/v1/usage` |
| `app/api/study.py` | Outline, source pages, explanations, feedback and reports |
| `prompts/<task>/v<N>.md` | Versioned LLM prompts; the version is stored on each generated row |
| `app/domain/` | Queries: accounts, courses, documents, usage limits |
| `app/rag/` | Extract (PDF/PPTX/photos), OCR (Tesseract), clean, chunk, embed (bge-small), topic outline |
| `app/worker/ingest.py` | The `ingest_document` job: upload → pages → chunks → outline |
| `app/worker/explain.py` | The `generate_explanation` job: topic chunks → grounded Markdown with page citations |
| `app/core/auth.py` | Verifies Supabase access tokens (JWKS, or a legacy HS256 secret) |
| `app/core/config.py` | Settings from environment variables / `.env` |
| `app/core/db.py` | Async Postgres connection pool |
| `app/llm/gateway.py` | LLM calls with ordered fallback across providers |
| `app/llm/config.py` | Loads and validates `config/models.yaml` |
| `app/worker/queue.py` | Postgres job queue (enqueue, claim with `SKIP LOCKED`, retry, backoff) |
| `app/worker/main.py` | Worker loop, job handler registry, heartbeat |
| `prompts/` | Versioned prompt files |

See [ARCHITECTURE](../../docs/ARCHITECTURE.md) for the design.
