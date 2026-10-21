# Quizzly API and worker

One Python codebase, two processes: the FastAPI **api** and the background **worker**.

## Run it

```bash
pip install uv                 # once
uv sync
cp .env.example .env           # then fill in the values
uv run uvicorn app.main:app --reload      # API on http://localhost:8000 (docs at /docs)
uv run python -m app.worker.main          # worker (needs DATABASE_URL)
```

The API starts without a database (it logs a warning), so `/healthz` works before Supabase is set up.

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
| `app/api/routes.py` | HTTP routes: `/healthz`, `/v1/me` |
| `app/core/auth.py` | Verifies Supabase access tokens (JWKS, or a legacy HS256 secret) |
| `app/core/config.py` | Settings from environment variables / `.env` |
| `app/core/db.py` | Async Postgres connection pool |
| `app/llm/gateway.py` | LLM calls with ordered fallback across providers |
| `app/llm/config.py` | Loads and validates `config/models.yaml` |
| `app/worker/queue.py` | Postgres job queue (enqueue, claim with `SKIP LOCKED`, retry, backoff) |
| `app/worker/main.py` | Worker loop, job handler registry, heartbeat |
| `app/domain/`, `app/rag/` | Business logic and the ingestion pipeline (M1 onwards) |
| `prompts/` | Versioned prompt files |

See [ARCHITECTURE](../../docs/ARCHITECTURE.md) for the design.
