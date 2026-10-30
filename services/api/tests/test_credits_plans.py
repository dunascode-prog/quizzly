"""Quizzly credits and plans (FR-INV-03..05, FR-PLAN-01..03)."""

import base64
import json
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.api import plans as plans_api
from app.core.play import PlayBilling, PlayError
from app.domain import invites, notifications, plans
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

USER = uuid.uuid4()
INVITER = uuid.uuid4()


def auth(user=USER) -> dict:
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, sub=str(user))}"}


class Conn:
    """Answers each query from `answers` (matched by the SQL's first words); records the rest."""

    def __init__(self, answers: dict[str, object]):
        self.sql: list[tuple[str, object]] = []
        self.answers = answers

    async def execute(self, sql, params=None):
        flat = " ".join(sql.split())
        self.sql.append((flat, params))
        answer = next((v for k, v in self.answers.items() if flat.startswith(k)), None)

        class Cur:
            async def fetchone(self):
                return answer[0] if isinstance(answer, list) and answer else answer

            async def fetchall(self):
                return answer if isinstance(answer, list) else []

        return Cur()

    @asynccontextmanager
    async def transaction(self):
        yield

    def ran(self, prefix: str) -> list:
        return [p for s, p in self.sql if s.startswith(prefix)]


# --- credits (FR-INV-03..05) ----------------------------------------------------------------------


@pytest.mark.parametrize("days, ok", [(2, False), (3, True)])
async def test_a_friend_counts_after_three_study_days(days, ok):
    conn = Conn({"select": {"verified": True, "onboarded": True, "days": days}})
    assert await invites.ready_for_credit(conn, USER) is ok
    assert "from study_days" in conn.sql[0][0] and "counted" in conn.sql[0][0]


async def test_unverified_or_unfinished_friends_dont_count():
    assert not await invites.ready_for_credit(
        Conn({"select": {"verified": False, "onboarded": True, "days": 9}}), USER
    )
    assert not await invites.ready_for_credit(
        Conn({"select": {"verified": True, "onboarded": False, "days": 9}}), USER
    )


async def test_progress_is_kept_for_screen_23_and_the_credit_job_is_queued_when_ready(monkeypatch):
    queued = []

    async def ready(conn, user_id):
        return True

    async def enqueue(conn, job_type, payload, **kw):
        queued.append(job_type)

    monkeypatch.setattr(invites, "ready_for_credit", ready)
    monkeypatch.setattr(invites.queue, "enqueue", enqueue)
    conn = Conn({"update referrals set study_days": {"id": uuid.uuid4()}})
    await invites.check(conn, USER)
    params = conn.ran("update referrals set study_days")[0]
    assert params[0] == invites.STUDY_DAYS_NEEDED  # capped at 3 for display
    assert queued == ["credit_referral"]


def credit_conn(credited_before: int, unlocked_now=True):
    referral = {"id": uuid.uuid4(), "inviter_id": INVITER, "invitee_id": USER, "device_hash": None}
    return Conn(
        {
            "select id, inviter_id": referral,
            "select count(*) as n from referrals": {"n": credited_before},
            "select display_name": {"display_name": "Ada O."},
            "update profiles set discount_unlocked_at": {"id": INVITER} if unlocked_now else None,
        }
    )


@pytest.fixture
def notified(monkeypatch):
    sent = []

    async def ready(conn, user_id):
        return True

    async def notify(conn, user_id, kind, title, body=None, target=None, **kw):
        sent.append((kind, title, body, target))

    monkeypatch.setattr(invites, "ready_for_credit", ready)
    monkeypatch.setattr(notifications, "notify", notify)
    return sent


async def test_the_fifth_credit_unlocks_ten_percent_off_once(notified):
    conn = credit_conn(credited_before=4)
    assert await invites.credit(conn, USER) == "credited"
    assert conn.ran("update profiles set credits") == [(5, INVITER)]
    kinds = [n[0] for n in notified]
    assert kinds == ["invite_joined", "invite_reward"]
    reward = notified[1]
    assert reward[1] == "You unlocked 10% off" and reward[3] == {"route": "/invite/unlocked"}
    # Already unlocked: the update matches nothing and no second reward is sent.
    notified.clear()
    await invites.credit(credit_conn(credited_before=5, unlocked_now=False), USER)
    assert [n[0] for n in notified] == ["invite_joined"]


async def test_the_joined_message_says_what_the_next_reward_needs(notified):
    await invites.credit(credit_conn(credited_before=0), USER)
    assert notified[0][2] == "1 credit · 2 more to unlock Lavender"
    notified.clear()
    await invites.credit(credit_conn(credited_before=3), USER)
    assert notified[0][2] == "4 credits · 1 more for 10% off"


async def test_lavender_still_unlocks_at_three(notified):
    conn = credit_conn(credited_before=2)
    await invites.credit(conn, USER)
    assert conn.ran("insert into achievements")
    assert not conn.ran("update profiles set discount_unlocked_at")


async def test_screen_23_shows_counted_and_started_friends_and_the_next_reward():
    friends = [
        {
            "display_name": "Kemi B.",
            "credited_at": datetime.now(UTC),
            "study_days": 3,
            "state": "counted",
        },
        {"display_name": "Femi E.", "credited_at": None, "study_days": 1, "state": "started"},
    ]
    conn = Conn(
        {
            "select invite_code": {
                "invite_code": "TOLU7",
                "discount_unlocked_at": None,
                "discount_seen_at": None,
            },
            "select p.display_name": friends,
        }
    )
    out = await invites.my_invite(conn, USER, "quizzly.app")
    assert out["credited"] == 1 and len(out["friends"]) == 2
    assert out["next_reward"] == {"kind": "lavender", "at": 3, "percent": None}
    assert out["discount"] == {"percent": 10, "at": 5, "unlocked": False, "celebrate": False}


# --- plans and Google Play (FR-PLAN-01..03) -------------------------------------------------------


class FakePlay:
    configured = True

    def __init__(self, sub=None, error=None):
        self.sub, self.error, self.acked = sub, error, []

    async def subscription(self, token):
        if self.error:
            raise self.error
        return self.sub

    async def acknowledge(self, product_id, token):
        self.acked.append(token)


def sub(user=USER, offer=None, state="SUBSCRIPTION_STATE_ACTIVE", product="quizzly_student"):
    expiry = (datetime.now(UTC) + timedelta(days=30)).isoformat()
    return {
        "subscriptionState": state,
        "acknowledgementState": "ACKNOWLEDGEMENT_STATE_PENDING",
        "externalAccountIdentifiers": {"obfuscatedExternalAccountId": str(user)},
        "lineItems": [
            {"productId": product, "expiryTime": expiry, "offerDetails": {"offerId": offer}}
        ],
    }


@pytest.fixture
def store(client, monkeypatch):
    state = {"saved": [], "owner": None, "disc": False, "plan": "free", "revoked": [], "voided": []}

    async def paid_plan(conn, user_id):
        return {
            "plan": state["plan"],
            "plan_expires_at": None,
            "active": True,
            "disc": state["disc"],
        }

    async def subscription_owner(conn, token):
        return state["owner"]

    async def save_subscription(conn, user_id, token, plan, line, sub_state):
        state["saved"].append((user_id, token, plan, sub_state))
        state["plan"] = plan if sub_state in plans.ENTITLED_STATES else "free"

    async def revoke(conn, user_id, token):
        state["revoked"].append(token)

    async def void(conn, user_id, token):
        state["voided"].append(token)

    for name, fn in [
        ("paid_plan", paid_plan),
        ("subscription_owner", subscription_owner),
        ("save_subscription", save_subscription),
        ("revoke", revoke),
        ("void", void),
    ]:
        monkeypatch.setattr(plans, name, fn)
    state["play"] = FakePlay(sub())
    client.app.dependency_overrides[plans_api.get_play] = lambda: state["play"]
    return state


def buy(client, token="t" * 20, product="quizzly_student"):
    return client.post(
        "/v1/plans/purchase", headers=auth(), json={"product_id": product, "purchase_token": token}
    )


def test_the_plan_list_shows_limits_prices_and_the_discount(client, store):
    r = client.get("/v1/plans", headers=auth())
    assert r.status_code == 200
    body = r.json()
    by_id = {p["id"]: p for p in body["plans"]}
    assert by_id["free"]["limits"]["question_set"] == 15 and by_id["free"]["price_usd"] == 0
    assert by_id["student"]["price_usd"] == 6 and by_id["premium"]["price_usd"] == 10
    assert by_id["student"]["monthly_ai_usd"] == 2.0 and by_id["premium"]["monthly_ai_usd"] == 3.5
    assert "Offline course downloads" in by_id["free"]["extras"]  # free on every plan
    assert body["discount_percent"] is None and by_id["student"]["discounted_price_usd"] is None
    store["disc"] = True
    body = client.get("/v1/plans", headers=auth()).json()
    by_id = {p["id"]: p for p in body["plans"]}
    assert body["discount_percent"] == 10 and body["invite_offer_id"] == "invite-10"
    assert by_id["student"]["discounted_price_usd"] == 5.4
    assert by_id["premium"]["discounted_price_usd"] == 9.0


def test_a_verified_purchase_gives_the_plan_and_is_acknowledged(client, store):
    r = buy(client)
    assert r.status_code == 200 and r.json()["plan"] == "student"
    assert store["saved"][0][2] == "student" and store["play"].acked == ["t" * 20]


def test_a_purchase_for_another_account_is_refused(client, store):
    store["play"] = FakePlay(sub(user=uuid.uuid4()))
    r = buy(client)
    assert r.status_code == 409 and r.json()["detail"] == plans_api.NOT_YOURS
    assert store["saved"] == []


def test_a_token_already_on_another_account_is_refused(client, store):
    store["owner"] = {"user_id": uuid.uuid4(), "plan": "student"}
    assert buy(client).status_code == 409 and store["saved"] == []


def test_the_invite_price_needs_the_unlocked_reward(client, store):
    store["play"] = FakePlay(sub(offer="invite-10"))
    r = buy(client)
    assert r.status_code == 403 and r.json()["detail"] == plans_api.NO_OFFER
    store["disc"] = True
    assert buy(client).status_code == 200


def test_unknown_products_and_unknown_tokens(client, store):
    assert buy(client, product="quizzly_gold").status_code == 422
    store["play"] = FakePlay(error=PlayError(404, "gone"))
    r = buy(client)
    assert r.status_code == 422 and r.json()["detail"] == plans_api.NOT_FOUND


def test_payments_are_off_until_play_is_set_up(client, store):
    store["play"] = FakePlay(sub())
    store["play"].configured = False
    r = buy(client)
    assert r.status_code == 503 and r.json()["detail"] == plans_api.NOT_READY


def test_a_purchase_needs_a_signed_in_student(client, store):
    assert (
        client.post(
            "/v1/plans/purchase", json={"product_id": "x", "purchase_token": "t" * 20}
        ).status_code
        == 401
    )


# --- Real-time Developer Notifications ------------------------------------------------------------


def push(client, data: dict, secret="s3cret"):
    body = {"message": {"data": base64.b64encode(json.dumps(data).encode()).decode()}}
    return client.post(f"/v1/billing/play?secret={secret}", json=body)


@pytest.fixture
def rtdn(client, store, settings):
    settings.play_rtdn_secret = "s3cret"
    store["owner"] = {"user_id": USER, "plan": "student"}
    return store


def test_notifications_need_the_shared_secret(client, rtdn):
    assert push(client, {}, secret="wrong").status_code == 403


def test_a_refund_removes_the_plan_at_once(client, rtdn):
    r = push(client, {"voidedPurchaseNotification": {"purchaseToken": "tok"}})
    assert r.status_code == 204 and rtdn["voided"] == ["tok"]


def test_a_renewal_or_expiry_rereads_the_subscription_from_google(client, rtdn):
    rtdn["play"] = FakePlay(sub(state="SUBSCRIPTION_STATE_EXPIRED"))
    r = push(client, {"subscriptionNotification": {"purchaseToken": "tok", "notificationType": 13}})
    assert r.status_code == 204 and rtdn["saved"][0][3] == "SUBSCRIPTION_STATE_EXPIRED"
    assert rtdn["plan"] == "free"


def test_unknown_tokens_and_bad_bodies_are_ignored(client, rtdn):
    rtdn["owner"] = None
    assert push(client, {"subscriptionNotification": {"purchaseToken": "x"}}).status_code == 204
    r = client.post("/v1/billing/play?secret=s3cret", json={"nope": 1})
    assert r.status_code == 204 and rtdn["saved"] == []


def test_google_down_asks_pubsub_to_retry(client, rtdn):
    rtdn["play"] = FakePlay(error=PlayError(503, "busy"))
    r = push(client, {"subscriptionNotification": {"purchaseToken": "tok"}})
    assert r.status_code == 502


# --- the Play client ------------------------------------------------------------------------------


async def test_play_signs_in_with_the_service_account_and_reads_the_subscription():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.host == "oauth2.googleapis.com":
            form = dict(x.split("=", 1) for x in request.content.decode().split("&"))
            claims = jwt.decode(
                form["assertion"],
                key.public_key(),
                algorithms=["RS256"],
                audience=plans_api_token_url(),
            )
            assert claims["iss"] == "play@quizzly.iam.gserviceaccount.com"
            return httpx.Response(200, json={"access_token": "at", "expires_in": 3600})
        assert request.headers["authorization"] == "Bearer at"
        return httpx.Response(200, json={"subscriptionState": "SUBSCRIPTION_STATE_ACTIVE"})

    settings = type(
        "S",
        (),
        {
            "play_package_name": "app.quizzly",
            "play_service_account_json": json.dumps(
                {"client_email": "play@quizzly.iam.gserviceaccount.com", "private_key": pem}
            ),
        },
    )()
    play = PlayBilling(settings, httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert play.configured
    assert (await play.subscription("tok"))["subscriptionState"] == "SUBSCRIPTION_STATE_ACTIVE"
    await play.subscription("tok")  # the access token is reused
    hosts = [r.url.host for r in seen]
    assert hosts.count("oauth2.googleapis.com") == 1
    assert seen[1].url.path.endswith(
        "/applications/app.quizzly/purchases/subscriptionsv2/tokens/tok"
    )


def plans_api_token_url():
    from app.core.play import TOKEN_URL

    return TOKEN_URL
