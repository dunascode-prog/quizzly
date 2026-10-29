"""NFR-09: structured logs with request ids, Sentry scrubbing, and the metrics route's guard."""

import json
import logging

from app.core import observability
from app.core.config import get_settings
from app.core.logging import ContextFilter, JsonFormatter, request_id_var


def test_scrub_drops_student_content_and_credentials():
    event = {
        "request": {
            "url": "https://api/v1/attempts/x/answers",
            "data": {"answers": ["my written answer"]},
            "cookies": {"session": "s"},
            "query_string": "q=secret",
            "headers": {"Authorization": "Bearer abc", "User-Agent": "okhttp", "apikey": "k"},
        },
        "user": {"id": "u1", "email": "ada@example.com", "ip_address": "1.2.3.4"},
    }
    token = request_id_var.set("req-123")
    try:
        out = observability.scrub(event)
    finally:
        request_id_var.reset(token)
    assert "data" not in out["request"] and "cookies" not in out["request"]
    assert "query_string" not in out["request"]
    assert out["request"]["headers"] == {"User-Agent": "okhttp"}
    assert out["user"] == {"id": "u1"}
    assert out["tags"]["request_id"] == "req-123"


def test_sentry_stays_off_without_a_dsn():
    assert observability.init_sentry(get_settings(), "api") is False


def test_log_lines_carry_the_request_id_and_fields():
    record = logging.LogRecord("quizzly.api", logging.INFO, __file__, 1, "request", None, None)
    record.path, record.status, record.ms = "/v1/home", 200, 12.5
    token = request_id_var.set("abc")
    try:
        ContextFilter().filter(record)
    finally:
        request_id_var.reset(token)
    line = json.loads(JsonFormatter().format(record))
    assert line["request_id"] == "abc" and line["path"] == "/v1/home" and line["status"] == 200


def test_requests_get_an_id_back_and_metrics_are_hidden(client, monkeypatch):
    r = client.get("/v1/home", headers={"x-request-id": "mine"})
    assert r.headers["x-request-id"] == "mine"
    # No METRICS_TOKEN: the route doesn't exist as far as anyone can tell.
    assert client.get("/internal/metrics").status_code == 404
    monkeypatch.setattr(get_settings(), "metrics_token", "s3cret")
    assert client.get("/internal/metrics", headers={"x-metrics-token": "wrong"}).status_code == 404
