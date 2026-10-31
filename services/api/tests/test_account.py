import uuid

import httpx
import pytest

from app.api import deps
from app.core import auth_admin
from app.domain import accounts, avatars
from app.worker import queue
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

USER = uuid.uuid4()


def auth():
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, sub=str(USER))}"}


@pytest.fixture
def fake(client, monkeypatch):
    state = {
        "storage_fails": False,
        "auth_fails": False,
        "removed": [],
        "jobs": [],
        "deleted": [],
        "photos_removed": [],
    }

    async def own_path(conn, user_id):
        return f"{user_id}/photo.webp"

    class Photos:
        async def remove(self, paths):
            state["photos_removed"].extend(paths)

    async def delete_account_data(conn, user_id):
        assert user_id == USER
        return ["uploads/u/d1/notes.pdf", "uploads/u/d2/"]

    class Storage:
        async def remove(self, paths):
            if state["storage_fails"]:
                raise httpx.ConnectError("storage down")
            state["removed"].extend(paths)

    async def delete_user(settings, user_id, client=None):
        if state["auth_fails"]:
            raise httpx.ConnectError("auth down")
        state["deleted"].append(user_id)

    async def enqueue(conn, job_type, payload, *, user_id=None, dedupe_key=None):
        state["jobs"].append((job_type, payload))

    monkeypatch.setattr(accounts, "delete_account_data", delete_account_data)
    monkeypatch.setattr(avatars, "own_path", own_path)
    client.app.dependency_overrides[deps.get_avatar_storage] = lambda: Photos()
    monkeypatch.setattr(auth_admin, "delete_user", delete_user)
    monkeypatch.setattr(queue, "enqueue", enqueue)
    client.app.dependency_overrides[deps.get_storage] = lambda: Storage()
    return state


def test_deleting_the_account_removes_files_and_the_sign_in(client, fake):
    assert client.delete("/v1/me", headers=auth()).status_code == 204
    assert fake["removed"] == ["uploads/u/d1/notes.pdf", "uploads/u/d2/"]
    assert fake["deleted"] == [USER] and fake["jobs"] == []
    assert fake["photos_removed"] == [f"{USER}/photo.webp"]  # the profile photo goes too


def test_files_storage_cannot_remove_now_are_left_to_the_worker(client, fake):
    fake["storage_fails"] = True
    assert client.delete("/v1/me", headers=auth()).status_code == 204
    assert fake["jobs"] == [
        ("delete_account", {"storage_paths": ["uploads/u/d1/notes.pdf", "uploads/u/d2/"]})
    ]
    assert fake["deleted"] == [USER]


def test_if_the_sign_in_cannot_be_deleted_the_student_is_told_to_retry(client, fake):
    fake["auth_fails"] = True
    r = client.delete("/v1/me", headers=auth())
    assert r.status_code == 503
    assert r.json()["detail"].startswith("We couldn't finish deleting your account.")


async def test_auth_admin_treats_an_already_deleted_user_as_done():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path, request.headers["apikey"]))
        return httpx.Response(404, json={"msg": "User not found"})

    from app.core.config import Settings

    settings = Settings(
        _env_file=None, supabase_url="https://p.supabase.co", supabase_service_role_key="svc"
    )
    await auth_admin.delete_user(
        settings, USER, httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    assert calls == [("DELETE", f"/auth/v1/admin/users/{USER}", "svc")]
