"""Supabase Auth admin API with the service-role key (server side only)."""

from uuid import UUID

import httpx

from app.core.config import Settings


async def delete_user(settings: Settings, user_id: UUID, client: httpx.AsyncClient | None = None):
    """Deletes the sign-in account; the database cascades from it to everything the user owns."""
    key = settings.supabase_service_role_key
    async with client or httpx.AsyncClient(timeout=30) as c:
        r = await c.delete(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
        if r.status_code != 404:  # already gone: a retry after a partial failure
            r.raise_for_status()
