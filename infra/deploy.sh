#!/usr/bin/env bash
# Deploys one environment of the API and worker on the VM, checks it, and rolls back on failure.
#   deploy.sh <staging|production> <image>    run that image (ghcr.io/…/quizzly-api:sha-…)
#   deploy.sh <staging|production> rollback   go back to the image that ran before
# CI runs it over SSH (.github/actions/remote-deploy). State lives in $QUIZZLY_HOME/<env>/.deploy:
# `current` is the image that passed its checks, `previous` the one before it.
set -euo pipefail

usage="usage: deploy.sh <staging|production> <image|rollback>"
env_name=${1:?$usage}
target=${2:?$usage}
case $env_name in staging | production) ;; *) echo "$usage" >&2; exit 2 ;; esac

home=${QUIZZLY_HOME:-/opt/quizzly}/$env_name
state=$home/.deploy
mkdir -p "$state"
cd "$home"

compose() {
  local image=$1
  shift
  QUIZZLY_ENV=$env_name API_IMAGE=$image RELEASE=${image##*:} \
    docker compose -p "quizzly-$env_name" -f docker-compose.yml "$@"
}

start() {
  compose "$1" pull --quiet api worker
  compose "$1" up -d --no-build --remove-orphans
}

# The API answers /readyz (so it reached the database) and the worker stays up.
healthy() {
  local image=$1 i
  for i in $(seq 1 30); do
    if compose "$image" exec -T api python -c \
      "import urllib.request; urllib.request.urlopen('http://localhost:8000/readyz', timeout=5)" \
      >/dev/null 2>&1; then
      break
    fi
    if [ "$i" = 30 ]; then
      echo "The API never became ready." >&2
      compose "$image" logs --tail 50 api >&2 || true
      return 1
    fi
    sleep 3
  done

  # A worker that crashes on start has restarted at least once by now.
  sleep 20
  local worker running restarts
  worker=$(compose "$image" ps -q worker)
  if [ -z "$worker" ]; then
    echo "The worker isn't running." >&2
    return 1
  fi
  read -r running restarts < <(docker inspect -f '{{.State.Running}} {{.RestartCount}}' "$worker")
  if [ "$running" != true ] || [ "$restarts" != 0 ]; then
    echo "The worker keeps crashing." >&2
    compose "$image" logs --tail 50 worker >&2 || true
    return 1
  fi
}

current=$(cat "$state/current" 2>/dev/null || true)
previous=$(cat "$state/previous" 2>/dev/null || true)

if [ "$target" = rollback ]; then
  if [ -z "$previous" ]; then
    echo "There's no earlier image to roll back to." >&2
    exit 1
  fi
  image=$previous
else
  image=$target
fi

docker network create quizzly-edge >/dev/null 2>&1 || true

echo "Deploying $image to $env_name (was ${current:-nothing})"
if start "$image" && healthy "$image"; then
  if [ "$image" != "$current" ]; then
    if [ -n "$current" ]; then echo "$current" >"$state/previous"; fi
    echo "$image" >"$state/current"
  fi
  # Old images can always be pulled again from GHCR, so keep the disk small.
  docker image prune -af --filter "until=168h" >/dev/null || true
  echo "$env_name is running $image"
  exit 0
fi

echo "::error::$image failed its checks on $env_name"
if [ -n "$current" ] && [ "$current" != "$image" ]; then
  echo "Rolling back to $current"
  if start "$current" && healthy "$current"; then
    echo "Rolled back: $env_name is running $current"
  else
    echo "::error::The rollback to $current failed its checks too. Look at the VM now."
  fi
fi
exit 1
