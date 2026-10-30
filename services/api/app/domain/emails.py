"""One Quizzly account per real inbox (FR-SEC-24): throwaway domains are refused and look-alike
addresses (Gmail dots, "+tags") count as the same inbox. Mirrors normalize_email() in migration
0024."""

from functools import lru_cache
from pathlib import Path

GMAIL = ("gmail.com", "googlemail.com")


def normalize(email: str) -> str:
    """tolu+quiz@gmail.com, T.O.L.U@googlemail.com -> tolu@gmail.com; ada+x@unilag.edu.ng ->
    ada@unilag.edu.ng."""
    local, _, domain = email.strip().lower().rpartition("@")
    local = local.split("+", 1)[0]
    if domain in GMAIL:
        return local.replace(".", "") + "@gmail.com"
    return f"{local}@{domain}"


@lru_cache(maxsize=1)
def _disposable() -> frozenset[str]:
    path = Path(__file__).resolve().parent.parent / "data" / "disposable_domains.txt"
    lines = path.read_text(encoding="utf-8").splitlines()
    return frozenset(x.strip().lower() for x in lines if x.strip() and not x.startswith("#"))


def is_disposable(email: str) -> bool:
    """True for throwaway domains, including their subdomains (x.mailinator.com)."""
    domain = email.strip().lower().rpartition("@")[2]
    parts = domain.split(".")
    return any(".".join(parts[i:]) in _disposable() for i in range(len(parts) - 1))
