"""Supabase Storage over its REST API, with the service-role key (server side only).

Students upload straight to Storage through a signed URL (FR-DOC-03); the API never sees the bytes.
"""

import httpx

from app.core.config import Settings


class Storage:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self.base = f"{settings.supabase_url.rstrip('/')}/storage/v1"
        self.bucket = settings.storage_bucket
        key = settings.supabase_service_role_key
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}"}
        self.client = client or httpx.AsyncClient(timeout=120)

    async def signed_upload_url(self, path: str) -> str:
        """A URL the app can PUT the raw file to, without any auth header."""
        r = await self.client.post(
            f"{self.base}/object/upload/sign/{self.bucket}/{path}", headers=self.headers, json={}
        )
        r.raise_for_status()
        return f"{self.base}{r.json()['url']}"

    async def download(self, path: str) -> bytes:
        r = await self.client.get(f"{self.base}/object/{self.bucket}/{path}", headers=self.headers)
        r.raise_for_status()
        return r.content

    async def remove(self, paths: list[str]) -> None:
        if not paths:
            return
        r = await self.client.request(
            "DELETE",
            f"{self.base}/object/{self.bucket}",
            headers=self.headers,
            json={"prefixes": paths},
        )
        r.raise_for_status()
