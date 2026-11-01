# Infrastructure

Runs the API and the worker for **staging** and **production** side by side on one Oracle Cloud Always Free ARM VM ([ARCHITECTURE §1](../docs/ARCHITECTURE.md#1-decisions-at-a-glance)), with one Caddy in front for TLS. GitHub Actions deploys them; see [docs/CI_CD.md](../docs/CI_CD.md).

| Path | What it is |
|---|---|
| `docker-compose.yml` | One environment: `api` + `worker` from a prebuilt image. CI copies it to `/opt/quizzly/<env>/` |
| `deploy.sh` | Deploys an image, checks `/readyz` and the worker, rolls back on failure. Run by CI over SSH |
| `smoke.sh` | Checks a deployed API from outside. Run by CI after each deploy |
| `edge/` | Caddy for both domains, on the shared `quizzly-edge` network. Started once by hand |

## First start on the VM

After the VM setup in [CI_CD.md §6](../docs/CI_CD.md#6-one-time-setup), copy `infra/edge/` to the VM and start Caddy:

```bash
docker network create quizzly-edge
cd edge
API_DOMAIN=api.quizzly.app STAGING_API_DOMAIN=staging-api.quizzly.app docker compose up -d
# no domain yet (VM IP 129.151.1.2):
API_DOMAIN=api.129-151-1-2.sslip.io STAGING_API_DOMAIN=staging-api.129-151-1-2.sslip.io docker compose up -d
```

Then merge to `main` (staging) or publish a `v*` release (production); the pipeline does the rest.

## By hand

```bash
cd /opt/quizzly/production
bash deploy.sh production ghcr.io/dunascode-prog/quizzly-api:sha-<12-char commit>   # needs `docker login ghcr.io` for a private package
bash deploy.sh production rollback
```

Add worker capacity with `docker compose -p quizzly-production up -d --scale worker=2`. Jobs are claimed with `SKIP LOCKED`, so workers never pick the same job.

## Locally

```bash
docker build -t quizzly-api:local ../services/api
docker network create quizzly-edge   # once
ENV_FILE=../services/api/.env docker compose up -d
```
