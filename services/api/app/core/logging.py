import json
import logging
import sys
from contextvars import ContextVar

# NFR-09: every log line from a request or a job carries its id, without passing it around.
request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
job_id_var: ContextVar[str | None] = ContextVar("job_id", default=None)

# Structured fields a log call may pass in `extra=` (e.g. the per-request and per-job lines).
FIELDS = ("method", "path", "status", "ms", "job_type", "outcome", "attempt", "wait_ms", "metrics")


class ContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not getattr(record, "request_id", None):
            record.request_id = request_id_var.get()
        if not getattr(record, "job_id", None):
            record.job_id = job_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in ("request_id", "job_id", *FIELDS):
            if (value := getattr(record, key, None)) is not None:
                entry[key] = value
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(ContextFilter())
    logging.basicConfig(level=level.upper(), handlers=[handler], force=True)
