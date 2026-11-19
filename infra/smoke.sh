#!/usr/bin/env bash
# Checks a deployed API from outside, through Caddy and TLS. CI rolls back when this fails.
#   smoke.sh <base url> [expected release]   e.g. smoke.sh https://staging-api.quizzly.app sha-<12-char commit>
set -euo pipefail

base=${1:?usage: smoke.sh <base url> [expected release]}
base=${base%/}
release=${2:-}
failed=0

# status <path> [curl args…] prints the HTTP status, retrying while the proxy warms up.
status() {
  local path=$1 code
  shift
  for _ in 1 2 3 4 5; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@" "$base$path" || true)
    if [ "$code" != 000 ] && [ "$code" != 502 ] && [ "$code" != 503 ]; then break; fi
    sleep 5
  done
  echo "$code"
}

check() {
  local name=$1 want=$2 got=$3
  if [ "$got" = "$want" ]; then
    echo "ok   $name"
  else
    echo "FAIL $name: expected $want, got $got"
    failed=1
  fi
}

check "GET /healthz" 200 "$(status /healthz)"
check "GET /readyz (database reachable)" 200 "$(status /readyz)"
check "GET /v1/me without a token is refused" 401 "$(status /v1/me)"
check "GET /v1/me with a forged token is refused" 401 \
  "$(status /v1/me -H 'Authorization: Bearer not.a.real.token')"

if [ -n "$release" ]; then
  running=$(curl -s --max-time 10 "$base/readyz" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("release", ""))' || true)
  check "running release" "$release" "$running"
fi

exit $failed
