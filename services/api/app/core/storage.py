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

    async def list_folder(self, folder: str) -> list[str]:
        """Full paths of the files directly inside `folder` (ending in "/"), sorted by name."""
        r = await self.client.post(
            f"{self.base}/object/list/{self.bucket}",
            headers=self.headers,
            json={"prefix": folder, "limit": 1000, "sortBy": {"column": "name", "order": "asc"}},
        )
        r.raise_for_status()
        # Sub-folders come back with a null id; photo sets have none, but skip them anyway.
        return sorted(folder + o["name"] for o in r.json() if o.get("id"))

    async def remove(self, paths: list[str]) -> None:
        """Deletes files; a path ending in "/" (a photo set) deletes the files inside it."""
        files: list[str] = []
        for path in paths:
            files.extend(await self.list_folder(path) if path.endswith("/") else [path])
        paths = files
        if not paths:
            return
        r = await self.client.request(
            "DELETE",
            f"{self.base}/object/{self.bucket}",
            headers=self.headers,
            json={"prefixes": paths},
        )
        r.raise_for_status()
