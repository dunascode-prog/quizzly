"""One Quizzly account per real inbox (FR-SEC-24)."""

import pytest

from app.domain import emails


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("tolu@gmail.com", "tolu@gmail.com"),
        ("T.O.L.U@Gmail.com", "tolu@gmail.com"),
        ("tolu+quizzly@gmail.com", "tolu@gmail.com"),
        ("t.olu+a+b@googlemail.com", "tolu@gmail.com"),
        ("ada+notes@unilag.edu.ng", "ada@unilag.edu.ng"),
        ("ada.obi@yahoo.com", "ada.obi@yahoo.com"),  # dots matter outside Gmail
        ("  Ada@Outlook.com ", "ada@outlook.com"),
    ],
)
def test_look_alike_addresses_normalise_to_one_inbox(raw, expected):
    assert emails.normalize(raw) == expected


@pytest.mark.parametrize(
    "email, throwaway",
    [
        ("a@mailinator.com", True),
        ("a@x.mailinator.com", True),
        ("a@10minutemail.com", True),
        ("a@gmail.com", False),
        ("a@yahoo.com", False),
        ("a@outlook.com", False),
        ("a@unilag.edu.ng", False),
    ],
)
def test_throwaway_domains(email, throwaway):
    assert emails.is_disposable(email) is throwaway


def test_the_list_is_loaded_once_and_is_large():
    assert len(emails._disposable()) > 5000
