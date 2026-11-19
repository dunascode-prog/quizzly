"""Public link pages and the iPhone waitlist (FR-INV-02, FR-INV-06)."""

import hashlib

import pytest

from app.api import links as links_api
from app.api import sharing as sharing_api
from app.domain import links, sharing
from tests.test_credits_plans import Conn

TOLU = {
    "display_name": "Tolu A.",
    "level": "200L",
    "show_identity_on_links": True,
    "institution": "UNILAG",
}


@pytest.fixture(autouse=True)
def fresh_rate_limit():
    sharing_api._lookups.clear()
    yield
    sharing_api._lookups.clear()


# --- what the pages may show ----------------------------------------------------------------------


async def test_an_invite_shows_first_name_school_and_level():
    conn = Conn({"select": TOLU})
    assert await links.invite(conn, "tolu7") == {
        "name": "Tolu",
        "institution": "UNILAG",
        "level": "200L",
    }
    assert conn.sql[0][1] == ("TOLU7",)  # codes are case-insensitive


async def test_identity_off_hides_everything_about_the_inviter():
    conn = Conn({"select": {**TOLU, "show_identity_on_links": False}})
    assert await links.invite(conn, "TOLU7") == {"name": None, "institution": None, "level": None}


async def test_unknown_or_deleted_inviters_show_no_card():
    assert await links.invite(Conn({}), "NOPE1") is None


async def test_an_active_share_shows_the_course_and_counts(monkeypatch):
    async def counts(conn, course_id):
        return {"notes": 4, "topics": 31, "questions": 240}

    monkeypatch.setattr(sharing, "_counts", counts)
    row = {**TOLU, "share_status": "active", "course_id": "c1", "code": "CSC 225", "title": "DS"}
    data = await links.share(Conn({"select": row}), "abcd2345")
    assert data == {
        "status": "active",
        "owner": "Tolu",
        "institution": "UNILAG",
        "level": "200L",
        "course_code": "CSC 225",
        "title": "DS",
        "notes": 4,
        "topics": 31,
        "questions": 240,
    }
    assert "course_id" not in data  # no internal ids on a public page


async def test_stopped_and_taken_down_shares_say_so_without_course_details():
    gone = await links.share(Conn({"select": {**TOLU, "share_status": "stopped"}}), "x" * 8)
    assert gone == {"status": "gone", "owner": "Tolu"}
    down = await links.share(Conn({"select": {**TOLU, "share_status": "taken_down"}}), "x" * 8)
    assert down == {"status": "taken_down", "owner": None}


def test_link_routes_need_no_token_and_unknown_codes_look_normal(client, monkeypatch):
    async def none(conn, code):
        return None

    monkeypatch.setattr(links, "invite", none)
    monkeypatch.setattr(links, "share", none)
    assert client.get("/v1/links/invite/NOPE1").json() == {"inviter": None}
    assert client.get("/v1/links/share/ABCD2345").json()["status"] == "unknown"


def test_link_lookups_are_rate_limited_per_ip(client, monkeypatch):
    async def none(conn, code):
        return None

    monkeypatch.setattr(links, "invite", none)
    codes = [client.get(f"/v1/links/invite/A{i}").status_code for i in range(31)]
    assert codes[:30] == [200] * 30 and codes[30] == 429


# --- the waitlist ---------------------------------------------------------------------------------


async def test_only_the_token_hash_is_stored_and_confirming_uses_it():
    conn = Conn({"insert into waitlist": {"id": 1}})
    token = await links.join_waitlist(conn, " ada@unilag.edu.ng ", "TOLU7")
    stored = conn.ran("insert into waitlist")[0]
    assert stored[0] == "ada@unilag.edu.ng" and token not in stored
    assert stored[2] == hashlib.sha256(token.encode()).hexdigest()

    conn = Conn({"update waitlist": {"id": 1}})
    assert await links.confirm_waitlist(conn, token) is True
    assert conn.ran("update waitlist")[0] == (hashlib.sha256(token.encode()).hexdigest(),)


async def test_an_already_confirmed_address_gets_no_new_token():
    assert await links.join_waitlist(Conn({}), "ada@unilag.edu.ng", None) is None


class FakeMailer:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    async def send(self, to, subject, text):
        self.sent.append((to, text))
        return True


@pytest.fixture
def mailer(client, monkeypatch):
    fake = FakeMailer()
    client.app.dependency_overrides[links_api.get_mailer] = lambda: fake
    state = {"confirmed": False}

    async def join(conn, email, invite_code):
        return None if state["confirmed"] else "t" * 43

    monkeypatch.setattr(links, "join_waitlist", join)
    fake.state = state
    return fake


def test_signing_up_emails_a_confirmation_link(client, mailer):
    r = client.post("/v1/waitlist", json={"email": "ada@unilag.edu.ng", "consent": True})
    assert r.status_code == 202
    to, text = mailer.sent[0]
    assert to == "ada@unilag.edu.ng" and "/waitlist/confirm?token=" + "t" * 43 in text


def test_the_answer_is_the_same_for_an_address_already_on_the_list(client, mailer):
    mailer.state["confirmed"] = True
    r = client.post("/v1/waitlist", json={"email": "ada@unilag.edu.ng", "consent": True})
    assert r.status_code == 202 and mailer.sent == []


def test_the_waitlist_needs_consent_and_a_real_inbox(client, mailer):
    body = {"email": "ada@unilag.edu.ng"}
    assert client.post("/v1/waitlist", json=body).status_code == 422
    assert client.post("/v1/waitlist", json={**body, "consent": False}).status_code == 422
    r = client.post("/v1/waitlist", json={"email": "not-an-email", "consent": True})
    assert r.status_code == 422 and r.json()["detail"] == links_api.BAD_EMAIL
    r = client.post("/v1/waitlist", json={"email": "x@mailinator.com", "consent": True})
    assert r.status_code == 422 and r.json()["detail"] == links_api.DISPOSABLE
    assert mailer.sent == []


def test_an_unknown_or_used_confirmation_link_says_so(client, monkeypatch):
    async def no(conn, token):
        return False

    monkeypatch.setattr(links, "confirm_waitlist", no)
    r = client.post("/v1/waitlist/confirm", json={"token": "t" * 43})
    assert r.status_code == 404 and r.json()["detail"] == links_api.EXPIRED


async def test_the_mailer_stays_off_without_a_key(settings):
    from app.core.mailer import Mailer

    assert await Mailer(settings).send("ada@unilag.edu.ng", "s", "t") is False
