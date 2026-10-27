"""Sharing routes: limits and messages (FR-SHARE-04/10, FRD §4). The SQL is covered by the live
end-to-end run; here the domain is faked."""

import uuid

import pytest

from app.api import sharing as sharing_api
from app.domain import sharing
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

USER = uuid.uuid4()


def auth() -> dict:
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, sub=str(USER))}"}


@pytest.fixture(autouse=True)
def fresh_rate_limit():
    sharing_api._lookups.clear()


def raises(exc):
    async def fn(*args, **kwargs):
        raise exc

    return fn


def test_over_the_daily_share_limit(client, monkeypatch):
    monkeypatch.setattr(sharing, "share_course", raises(sharing.ShareLimit()))
    r = client.post(f"/v1/courses/{uuid.uuid4()}/share", headers=auth(), json={"codes": ["TOLU7"]})
    assert r.status_code == 429
    assert r.json()["detail"] == "You've shared with 20 people today. You can share again tomorrow."


def test_a_full_course(client, monkeypatch):
    monkeypatch.setattr(sharing, "join", raises(sharing.ShareFull("Ada O.")))
    r = client.post("/v1/shares/join", headers=auth(), json={"code": "7KQ2M9XD"})
    assert r.status_code == 429
    assert r.json()["detail"] == (
        "This shared course is full. Ask Ada O. to make a new one, or upload the notes yourself."
    )


@pytest.mark.parametrize(
    ("exc", "detail"),
    [
        (
            sharing.ShareGone("Ada O."),
            "This course isn't shared any more. Ask Ada O. for a new link.",
        ),
        (sharing.ShareGone("Ada O.", taken_down=True), "This course is no longer available."),
    ],
)
def test_a_link_that_no_longer_works(client, monkeypatch, exc, detail):
    monkeypatch.setattr(sharing, "preview_code", raises(exc))
    r = client.get("/v1/shares/code/7KQ2M9XD", headers=auth())
    assert r.status_code == 410 and r.json()["detail"] == detail


def test_link_lookups_are_rate_limited(client, monkeypatch):
    monkeypatch.setattr(sharing, "preview_code", raises(sharing.ShareGone()))
    codes = [client.get("/v1/shares/code/ZZZZZZZZ", headers=auth()).status_code for _ in range(31)]
    assert codes[:30] == [410] * 30 and codes[30] == 429


def test_share_codes_are_crockford_and_forgiving():
    code = sharing.new_code()
    assert len(code) == 8 and not set(code) & set("ILOU")
    assert sharing.normalise_code(" 7kq2m9xo ") == "7KQ2M9X0"
