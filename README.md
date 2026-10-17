# NoteGenie

AI study companion for Nigerian university students. Upload lecture notes or slides (PDF, PPTX, or photos), and NoteGenie explains them topic by topic, generates exam-style practice questions with answers, and answers questions about the notes with page citations.

Built on open-source models through free hosted tiers, with a retrieval-augmented generation (RAG) pipeline designed to cost close to $0/month during beta.

## Status

**M0: Foundations.** Docs, database schema and repository skeleton are in place. No application code yet.

## Documentation

| Doc | What it covers |
|---|---|
| [PRD](docs/PRD.md) | Problem, users, goals, features, metrics, risks, release plan |
| [FRD](docs/FRD.md) | Functional and non-functional requirements with acceptance criteria |
| [Architecture](docs/ARCHITECTURE.md) | Stack, components, RAG pipeline, LLM gateway, cost strategy |
| [Data models](docs/DATA_MODELS.md) | ER diagram and every table |
| [Data flows](docs/DATA_FLOWS.md) | Context and level-1 DFDs, a DFD per entity, key sequences |

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
services/api/         FastAPI app + worker, LLM config
supabase/migrations/  SQL schema and row-level security
evals/                Evaluation set for prompts
infra/                Docker Compose, reverse proxy
docs/                 Product and technical docs
```

## Getting started

Coming in M1. You will need: Node 22, Python 3.12 with `uv`, the Supabase CLI, and Docker.

To apply the schema to a Supabase project today:

```bash
supabase link --project-ref <ref>
supabase db push
```

## Contributing

Work on a feature branch and open a pull request into `main`. Reference requirement IDs (for example `FR-QGEN-02`) in the PR description.
