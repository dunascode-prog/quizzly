# Quizzly

AI study companion for Nigerian university students. Upload lecture notes or slides (PDF, PPTX, or photos), and Quizzly explains them topic by topic, generates exam-style practice questions with answers, and answers questions about the notes with page citations.

Built on open-source models through free hosted tiers, with a retrieval-augmented generation (RAG) pipeline designed to cost close to $0/month during beta.

## Status

**M1: Scaffolding.** The mobile app and the API/worker are scaffolded and tested: sign-in token checks, the LLM gateway with provider fallback, and the Postgres job queue. Document ingestion is next.

## Documentation

| Doc | What it covers |
|---|---|
| [PRD](docs/PRD.md) | Problem, users, goals, features, metrics, risks, release plan |
| [FRD](docs/FRD.md) | Functional and non-functional requirements with acceptance criteria |
| [Architecture](docs/ARCHITECTURE.md) | Stack, components, RAG pipeline, LLM gateway, cost strategy |
| [Data models](docs/DATA_MODELS.md) | ER diagram and every table |
| [Data flows](docs/DATA_FLOWS.md) | Context and level-1 DFDs, a DFD per entity, key sequences |
| [Design](docs/DESIGN.md) | Look, tokens, components, every MVP screen, logo; screen images in `docs/design/` |
| [Website and admin](docs/WEB.md) | `apps/web`: landing page, invite links, legal pages, admin app; approved HTML in `docs/reference/` |

## Stack

| Part | Technology |
|---|---|
| Mobile | React Native + Expo (TypeScript) |
| API + worker | FastAPI (Python 3.12), Postgres job queue |
| Data | Supabase: Postgres + pgvector, Auth, Storage |
| LLMs | Groq → OpenRouter → Cloudflare Workers AI (open models, free tiers) |
| Embeddings / OCR | bge-small-en-v1.5 (fastembed, CPU), Tesseract |
| Hosting | Oracle Cloud Always Free VM (Docker Compose) |

## Repository layout

```
apps/mobile/          Expo app
apps/web/             Next.js site: landing, invite links, admin (quizzly.app)
services/api/         FastAPI app + worker, LLM config
supabase/migrations/  SQL schema and row-level security
evals/                Evaluation set for prompts
infra/                Docker Compose, reverse proxy
docs/                 Product and technical docs
```

## Getting started

You need Node 22, Python 3.12 and [`uv`](https://docs.astral.sh/uv/) (`pip install uv`). Docker and the Supabase CLI are optional for now.

```bash
# API (http://localhost:8000/docs)
cd services/api && uv sync && cp .env.example .env && uv run uvicorn app.main:app --reload

# Mobile app
cd apps/mobile && npm install && cp .env.example .env.local && npx expo start

# Website and admin (http://localhost:3000)
cd apps/web && npm install && cp .env.example .env.local && npm run dev
```

Apply the database schema to a Supabase project:

```bash
supabase link --project-ref <ref>
supabase db push
```

More detail: [apps/mobile](apps/mobile/README.md) · [apps/web](apps/web/README.md) · [services/api](services/api/README.md) · [infra](infra/README.md).

## Contributing

Work on a feature branch and open a pull request into `main`. Reference requirement IDs (for example `FR-QGEN-02`) in the PR description.
