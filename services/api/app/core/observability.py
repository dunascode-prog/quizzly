"""Error tracking with Sentry (NFR-09, free tier). Off unless SENTRY_DSN is set.

Students' notes, answers and chat are never sent: no request bodies, no cookies or auth headers, no
user details beyond an anonymous id, and breadcrumbs from logs carry messages only.
"""

import logging
from typing import Any

from app.core.config import Settings
from app.core.logging import job_id_var, request_id_var

log = logging.getLogger("quizzly.observability")

_SENSITIVE_HEADERS = {"authorization", "cookie", "x-api-key", "apikey"}


def scrub(event: dict[str, Any], _hint: dict | None = None) -> dict[str, Any]:
    """Drops anything that could hold a student's content or credentials before it's sent."""
    request = event.get("request")
    if isinstance(request, dict):
        request.pop("data", None)
        request.pop("cookies", None)
        request.pop("query_string", None)
        headers = request.get("headers")
        if isinstance(headers, dict):
            request["headers"] = {
                k: v for k, v in headers.items() if k.lower() not in _SENSITIVE_HEADERS
            }
    user = event.get("user")
    if isinstance(user, dict):
        event["user"] = {"id": user["id"]} if "id" in user else {}
    for key in ("request_id", "job_id"):
        value = (request_id_var if key == "request_id" else job_id_var).get()
        if value:
            event.setdefault("tags", {})[key] = value
    return event


def init_sentry(settings: Settings, component: str) -> bool:
    """`component` is "api" or "worker". Returns whether Sentry is on."""
    if not settings.sentry_dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.env,
        release=settings.release or None,
        send_default_pii=False,
        max_request_body_size="never",
        traces_sample_rate=settings.sentry_traces_rate,
        before_send=scrub,
        before_send_transaction=scrub,
    )
    sentry_sdk.set_tag("component", component)
    log.info("sentry on for %s", component)
    return True
