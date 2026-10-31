"""Google sign-in bridge (FR-AUTH-01).

Supabase only returns to http(s) addresses on its Redirect URLs list, but the app is reached at
`quizzly://…` (builds) or `exp://…` (Expo Go). So Supabase returns here, and this page forwards
the result to the app address named in `next`.

Only Quizzly's own app addresses are accepted, and only the sign-in result is passed on. A code
that leaks is useless anyway: with PKCE only the phone that started the sign-in can exchange it.
"""

import html
import json
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["auth"])

APP_SCHEMES = ("quizzly", "exp", "exps")  # builds, Expo Go
FORWARDED = ("code", "error", "error_code", "error_description")
HEADERS = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": (
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"
    ),
}

_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Back to Quizzly</title>
<style>body{{font-family:system-ui,sans-serif;background:#DCDDE8;color:#0D0D10;display:flex;
min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center;padding:24px}}
a{{display:inline-block;margin-top:16px;padding:16px 28px;border-radius:999px;background:#0D0D10;
color:#fff;text-decoration:none;font-weight:600}}</style></head>
<body><main><p>{message}</p>{link}</main>{script}</body></html>"""


def _js_string(value: str) -> str:
    """A JavaScript string literal that can't close the surrounding <script> tag."""
    return json.dumps(value).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def app_target(next_url: str) -> str | None:
    """The app address to forward to, or None when it isn't one of Quizzly's own."""
    parts = urlsplit(next_url)
    if parts.scheme not in APP_SCHEMES or parts.fragment:
        return None
    if parts.scheme == "quizzly" and parts.netloc not in ("auth-callback", ""):
        return None
    if parts.scheme in ("exp", "exps") and not parts.path.endswith("/--/auth-callback"):
        return None
    return next_url


@router.get("/auth/callback", include_in_schema=False, response_class=HTMLResponse)
async def google_callback(
    next: str = Query(default="", max_length=500),
    code: str | None = Query(default=None, max_length=500),
    error: str | None = Query(default=None, max_length=200),
    error_code: str | None = Query(default=None, max_length=100),
    error_description: str | None = Query(default=None, max_length=500),
) -> HTMLResponse:
    target = app_target(next)
    if target is None:
        page = _PAGE.format(
            message="This sign-in link isn't valid. Go back to Quizzly and try again.",
            link="",
            script="",
        )
        return HTMLResponse(page, status_code=400, headers=HEADERS)
    values = {
        "code": code,
        "error": error,
        "error_code": error_code,
        "error_description": error_description,
    }
    query = urlencode({k: v for k, v in values.items() if v and k in FORWARDED})
    forward = f"{target}{'&' if '?' in target else '?'}{query}" if query else target
    page = _PAGE.format(
        message="Signing you in to Quizzly…",
        link=f'<a href="{html.escape(forward, quote=True)}">Open Quizzly</a>',
        script=f"<script>window.location.replace({_js_string(forward)});</script>",
    )
    return HTMLResponse(page, headers=HEADERS)
