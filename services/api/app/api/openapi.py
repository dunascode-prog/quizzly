"""What Swagger (`/docs`) and the exported `docs/api/openapi.json` say about the API.

Served only where it's explicitly not production (FR-SEC-15). After changing a route, run
`uv run python -m app.api.openapi` to refresh the exported copy; a test fails until you do.
"""

import json
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI

VERSION = "0.2.0"

DESCRIPTION = """
The HTTP API behind the Quizzly app. The app reads its own rows straight from Supabase, but every
change goes through here, so ownership is always checked (FRD §2.16).

## Signing in

Every `/v1` route needs `Authorization: Bearer <token>`, where the token is the Supabase access
token of a signed-in student. To try routes here, click **Authorize** and paste one. You can get a
token from the app's session, or from Supabase directly:

```
curl -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \\
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \\
  -d '{"email": "you@example.com", "password": "…"}'
```

## Errors

Errors are JSON: `{"detail": "a sentence the app can show as-is"}` (copy from FRD §4). Request
validation errors (422) send `detail` as a list instead, one entry per problem.

| Status | Meaning |
|---|---|
| 401 | Missing, invalid or expired token. |
| 403 | The course or document was shared with the student, so only its owner can change it. |
| 404 | Not found, or not the student's: other people's things are never revealed. |
| 409 | Conflicts: a course code already used, a quiz not ready yet, an id already taken. |
| 410 | A share link that was stopped, replaced or taken down. |
| 422 | Invalid input, including text over its length limit. |
| 429 | Out of a daily allowance (`GET /v1/usage`), a shared course is full, or too many lookups. |

## Conventions

- Ids are UUIDs. Where the app creates something it may retry (quiz attempts), it chooses the id,
  so resending the same request is safe.
- Slow work (processing an upload, writing questions, marking) runs in the background worker; poll
  the resource's `GET` until its `status` changes.
- Each response carries an `x-request-id` header. Send your own to trace a request through logs.
- Shared-course members never receive storage URLs or other people's scores, chats or progress,
  and exam-mode quizzes include no answers until submitted.
"""

TAGS = [
    {"name": "account", "description": "Profile, settings, usage and invite link."},
    {"name": "courses", "description": "The student's courses and offline downloads."},
    {"name": "documents", "description": "Uploads and their processing."},
    {
        "name": "study",
        "description": "Outlines, topics, pages, explanations, feedback and reports.",
    },
    {"name": "quizzes", "description": "Quizzes, flashcards, attempts and the Practice tab."},
    {"name": "chat", "description": "Questions about a document, answered from its pages."},
    {"name": "home", "description": "Today, Daily 5, study days, achievements and weekly recap."},
    {"name": "notifications", "description": "Inbox, read state and push tokens."},
    {"name": "sharing", "description": "Sharing courses, joining by link, members and blocking."},
    {"name": "invites", "description": "Referral claims."},
    {"name": "ops", "description": "Health check."},
]

ERROR = {
    "title": "Error",
    "type": "object",
    "properties": {"detail": {"type": "string", "title": "Detail"}},
    "required": ["detail"],
}

EXPORT_PATH = Path(__file__).resolve().parents[4] / "docs" / "api" / "openapi.json"


def _tidy(schema: dict[str, Any]) -> None:
    schema["components"]["schemas"]["Error"] = ERROR
    for operations in schema["paths"].values():
        for op in operations.values():
            # Settings and invite routes live in other modules' routers but belong under account
            # only, not listed twice.
            if "account" in op.get("tags", []):
                op["tags"] = ["account"]
            if op.get("security"):
                op["responses"].setdefault(
                    "401",
                    {
                        "description": "Missing, invalid or expired token",
                        "content": {
                            "application/json": {"schema": {"$ref": "#/components/schemas/Error"}}
                        },
                    },
                )


def install(app: FastAPI) -> None:
    generate = app.openapi

    def openapi() -> dict[str, Any]:
        if app.openapi_schema is None:
            _tidy(generate())  # generate() caches the schema on the app; tidy it in place
        return app.openapi_schema

    app.openapi = openapi


def export(app: FastAPI) -> str:
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    from app.main import create_app

    EXPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    EXPORT_PATH.write_text(export(create_app()), encoding="utf-8", newline="\n")
    sys.stdout.write(f"Wrote {EXPORT_PATH}\n")
