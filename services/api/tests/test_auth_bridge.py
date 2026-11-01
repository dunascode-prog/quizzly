"""The Google sign-in bridge (FR-AUTH-01): forwards only to Quizzly's own app addresses."""

from urllib.parse import quote

import pytest

EXPO = "exp://192.168.20.203:8081/--/auth-callback"


def callback(client, next_url: str, **params):
    query = "&".join(f"{k}={quote(v)}" for k, v in params.items())
    return client.get(f"/auth/callback?next={quote(next_url, safe='')}&{query}")


@pytest.mark.parametrize("target", [EXPO, "quizzly://auth-callback"])
def test_forwards_the_code_to_the_app(client, target):
    r = callback(client, target, code="abc123", state="ignored")
    assert r.status_code == 200
    assert f"{target}?code=abc123" in r.text
    assert "state=" not in r.text  # only the sign-in result is passed on
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["referrer-policy"] == "no-referrer"


def test_errors_are_passed_back_so_the_app_can_say_so(client):
    r = callback(
        client, "quizzly://auth-callback", error="access_denied", error_description="User said no"
    )
    assert "error=access_denied" in r.text and "error_description=User+said+no" in r.text


@pytest.mark.parametrize(
    "target",
    [
        "https://evil.example/steal",
        "javascript:alert(1)",
        "quizzly://somewhere-else",
        "exp://192.168.20.203:8081/--/other-screen",
        f"{EXPO}#frag",
        "",
    ],
)
def test_refuses_anything_but_the_apps_own_callback(client, target):
    r = callback(client, target, code="abc123")
    assert r.status_code == 400
    assert "abc123" not in r.text


def test_a_crafted_target_cannot_break_out_of_the_script(client):
    r = callback(client, f"{EXPO}?x=</script><script>alert(1)</script>", code="c")
    assert r.status_code == 200
    assert "<script>alert(1)" not in r.text
    assert r.text.count("<script>") == 1
