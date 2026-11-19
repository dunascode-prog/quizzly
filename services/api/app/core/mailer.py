"""Email the API sends itself, through Resend's HTTP API (FR-INV-06). Sign-in codes don't come
through here: Supabase Auth sends those. Off until RESEND_API_KEY is set."""

import logging

import httpx

from app.core.config import Settings

log = logging.getLogger("quizzly.mail")
API = "https://api.resend.com/emails"


class Mailer:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self._key = settings.resend_api_key
        self.sender = settings.mail_from or f"Quizzly <hello@{settings.invite_domain}>"
        self.client = client or httpx.AsyncClient(timeout=10)

    @property
    def configured(self) -> bool:
        return bool(self._key)

    async def send(self, to: str, subject: str, text: str) -> bool:
        """True when Resend accepted it. Failures are logged, never raised: an email that didn't
        go out mustn't turn into an error page."""
        if not self.configured:
            return False
        try:
            r = await self.client.post(
                API,
                headers={"Authorization": f"Bearer {self._key}"},
                json={"from": self.sender, "to": [to], "subject": subject, "text": text},
            )
        except httpx.HTTPError:
            log.warning("email not sent: Resend unreachable")
            return False
        if r.status_code >= 300:
            log.warning("email not sent: Resend said %s", r.status_code)
            return False
        return True
