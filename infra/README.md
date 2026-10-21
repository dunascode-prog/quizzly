# Infrastructure

Runs the API, the worker and a TLS reverse proxy (Caddy) with Docker Compose. The target is an Oracle Cloud Always Free ARM VM ([ARCHITECTURE §1](../docs/ARCHITECTURE.md#1-decisions-at-a-glance)).

## Deploy

1. Point a DNS record (e.g. `api.quizzly.app`) at the VM and open ports 80 and 443.
2. Create `services/api/.env` from `services/api/.env.example`.
3. Start the stack:
   ```bash
   cd infra
   API_DOMAIN=api.quizzly.app docker compose up -d --build
   ```

Add worker capacity with `docker compose up -d --scale worker=2`. Jobs are claimed with `SKIP LOCKED`, so workers never pick the same job.
