"""What the public link pages may show, and the iPhone waitlist (FR-INV-02, FR-INV-06).

Nobody is signed in on these pages, so they get the least that makes the page work: a first name,
school and level only when the owner left "Show my name on invite links" on, and for a shared
course its code, title and counts. No ids, emails, photos or member names."""

import hashlib
import secrets
from typing import Any

from psycopg import AsyncConnection

from app.domain import sharing


def _first_name(display_name: str | None) -> str | None:
    """ "Ada O." -> "Ada"."""
    return display_name.split()[0] if display_name and display_name.strip() else None


def _who(row: dict) -> dict[str, Any]:
    if not row["show_identity_on_links"]:
        return {"name": None, "institution": None, "level": None}
    return {
        "name": _first_name(row["display_name"]),
        "institution": row["institution"],
        "level": None if row["level"] == "other" else row["level"],
    }


_PERSON = """
p.display_name, p.level, p.show_identity_on_links,
coalesce(i.short_name, i.name, p.institution_other) as institution
"""


async def invite(conn: AsyncConnection, code: str) -> dict[str, Any] | None:
    """The inviter on `/i/{code}`, or None for an unknown code (the page then shows no card)."""
    row = await (
        await conn.execute(
            f"select {_PERSON} from profiles p left join institutions i on i.id = p.institution_id "
            "where upper(p.invite_code) = %s and p.deleted_at is null and p.suspended_at is null",
            (sharing.normalise_invite_code(code),),
        )
    ).fetchone()
    return _who(row) if row else None


async def share(conn: AsyncConnection, code: str) -> dict[str, Any] | None:
    """The course on `/c/{code}`: active, gone (stopped or replaced) or taken_down; None if the
    code never existed."""
    row = await (
        await conn.execute(
            f"select s.status::text as share_status, s.course_id, c.code, c.title, {_PERSON} "
            "from course_shares s join courses c on c.id = s.course_id "
            "join profiles p on p.id = s.owner_id "
            "left join institutions i on i.id = p.institution_id where s.code = %s",
            (sharing.normalise_code(code),),
        )
    ).fetchone()
    if row is None:
        return None
    if row["share_status"] != "active":
        status = "taken_down" if row["share_status"] == "taken_down" else "gone"
        # A stopped link still names its owner, so the page can say who to ask (FRD §4).
        return {"status": status, "owner": _who(row)["name"] if status == "gone" else None}
    counts = await sharing._counts(conn, row["course_id"])
    return {
        "status": "active",
        "owner": _who(row)["name"],
        **{k: v for k, v in _who(row).items() if k != "name"},
        "course_code": row["code"],
        "title": row["title"],
        "notes": counts["notes"],
        "topics": counts["topics"],
        "questions": counts["questions"],
    }


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def join_waitlist(conn: AsyncConnection, email: str, invite_code: str | None) -> str | None:
    """A new token to email for confirmation, or None when the address is already confirmed.
    Only the token's hash is stored, so a database read can't confirm anyone. Signing up again
    before confirming replaces the token (the newest email is the one that works)."""
    token = secrets.token_urlsafe(32)
    row = await (
        await conn.execute(
            """
            insert into waitlist (email, invite_code, confirm_token) values (%s, %s, %s)
            on conflict (lower(email)) do update set confirm_token = excluded.confirm_token
              where waitlist.confirmed_at is null
            returning id
            """,
            (email.strip(), invite_code, _hash(token)),
        )
    ).fetchone()
    return token if row else None


async def confirm_waitlist(conn: AsyncConnection, token: str) -> bool:
    row = await (
        await conn.execute(
            "update waitlist set confirmed_at = now(), confirm_token = null "
            "where confirm_token = %s and confirmed_at is null returning id",
            (_hash(token),),
        )
    ).fetchone()
    return row is not None
