"""Google Play Billing on the server (FR-PLAN-03): every subscription is checked with the Google
Play Developer API before a plan is given, and Real-time Developer Notifications keep it current
(renewals, cancellations, refunds). The app's word is never enough."""

import json
import time

import httpx
import jwt

from app.core.config import Settings

TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"


class PlayError(Exception):
    """Google said no, or couldn't be reached."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


class PlayBilling:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self.package = settings.play_package_name
        self._key = json.loads(settings.play_service_account_json or "null")
        self.client = client or httpx.AsyncClient(timeout=20)
        self._token: tuple[str, float] | None = None

    @property
    def configured(self) -> bool:
        return bool(self._key and self.package)

    async def _access_token(self) -> str:
        """A service-account OAuth token (JWT bearer grant), reused until a minute before expiry."""
        if self._token and self._token[1] > time.time() + 60:
            return self._token[0]
        now = int(time.time())
        assertion = jwt.encode(
            {
                "iss": self._key["client_email"],
                "scope": SCOPE,
                "aud": TOKEN_URL,
                "iat": now,
                "exp": now + 3600,
            },
            self._key["private_key"],
            algorithm="RS256",
        )
        r = await self.client.post(
            TOKEN_URL,
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
        )
        if r.status_code != 200:
            raise PlayError(r.status_code, "Google sign-in for Play failed")
        body = r.json()
        self._token = (body["access_token"], time.time() + int(body.get("expires_in", 3600)))
        return self._token[0]

    async def _call(self, method: str, path: str) -> dict:
        headers = {"Authorization": f"Bearer {await self._access_token()}"}
        r = await self.client.request(method, f"{API}/{self.package}/{path}", headers=headers)
        if r.status_code >= 400:
            raise PlayError(r.status_code, f"Play API {r.status_code}")
        return r.json() if r.content else {}

    async def subscription(self, purchase_token: str) -> dict:
        """purchases.subscriptionsv2.get: state, line items (product, expiry, offer), owner."""
        return await self._call("GET", f"purchases/subscriptionsv2/tokens/{purchase_token}")

    async def acknowledge(self, product_id: str, purchase_token: str) -> None:
        """Unacknowledged purchases are refunded by Google after 3 days."""
        await self._call(
            "POST", f"purchases/subscriptions/{product_id}/tokens/{purchase_token}:acknowledge"
        )
