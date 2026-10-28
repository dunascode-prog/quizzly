"""Invites and referral credit (FR-INV-01, 03, 04, 05; FR-AUTH-07).

A new student's pending code (from an invite link, a share link or the Play install referrer) is
recorded after sign-up. The inviter is credited only once the new student has verified their
email, finished onboarding and answered 5 questions; the `credit_referral` job then applies the
self, device and cap rules.
"""

import json
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

from app.domain import notifications
from app.domain.sharing import normalise_code, normalise_invite_code
from app.worker import queue

ANSWERS_NEEDED = 5
MAX_CREDITS = 50  # per inviter
LAVENDER_AT = 3  # credited friends unlock the Lavender theme (FR-INV-05)


async def my_invite(conn: AsyncConnection, user_id: UUID, invite_domain: str) -> dict | None:
    """Screen 23: the link, credited friends (display names only) and the next reward."""
    me = await (
        await conn.execute(
            "select invite_code from profiles where id = %s and deleted_at is null", (user_id,)
        )
    ).fetchone()
    if me is None:
        return None
    friends = await (
        await conn.execute(
            """
            select p.display_name, r.credited_at from referrals r
            join profiles p on p.id = r.invitee_id
            where r.inviter_id = %s and r.status = 'credited'
            order by r.credited_at desc
            """,
            (user_id,),
        )
    ).fetchall()
    n = len(friends)
    return {
        "code": me["invite_code"],
        "link": f"https://{invite_domain}/i/{me['invite_code']}",
        "friends": friends,
        "credited": n,
        "next_reward": None if n >= LAVENDER_AT else {"theme": "lavender", "at": LAVENDER_AT},
        "lavender_unlocked": n >= LAVENDER_AT,
    }


async def _inviter_for(conn: AsyncConnection, code: str, channel: str) -> UUID | None:
    """An invite code (`/i/`, install referrer) or, for a share link, the course's owner."""
    if channel == "share_link":
        row = await (
            await conn.execute(
                "select owner_id as id from course_shares where code = %s", (normalise_code(code),)
            )
        ).fetchone()
    else:
        row = await (
            await conn.execute(
                "select id from profiles where upper(invite_code) = %s and deleted_at is null",
                (normalise_invite_code(code),),
            )
        ).fetchone()
    return row["id"] if row else None


async def claim(
    conn: AsyncConnection, user_id: UUID, code: str, channel: str, device_hash: str | None
) -> dict[str, Any] | None:
    """Records who invited the student (once per account). Returns the referral, or None when the
    code isn't known: the app just carries on (FRD §4, "Invite code invalid")."""
    inviter = await _inviter_for(conn, code, channel)
    if inviter is None:
        return None
    await conn.execute(
        """
        insert into referrals (inviter_id, invitee_id, code, channel, device_hash, status,
                               reject_reason)
        values (%s, %s, %s, %s, %s,
                case when %s then 'rejected'::referral_status else 'pending' end,
                case when %s then 'self' end)
        on conflict (invitee_id) do nothing
        """,
        (
            inviter,
            user_id,
            code.strip().upper(),
            channel,
            device_hash,
            inviter == user_id,
            inviter == user_id,
        ),
    )
    await check(conn, user_id)
    return await (
        await conn.execute(
            "select status::text as status, reject_reason from referrals where invitee_id = %s",
            (user_id,),
        )
    ).fetchone()


async def ready_for_credit(conn: AsyncConnection, user_id: UUID) -> bool:
    """Email verified, onboarding finished, and at least 5 questions answered (FR-INV-03)."""
    row = await (
        await conn.execute(
            """
            select
              (select email_confirmed_at is not null from auth.users where id = %(u)s) as verified,
              ((p.institution_id is not null or p.institution_other is not null)
                and p.level is not null and p.terms_accepted_at is not null) as onboarded,
              (select count(*) from attempt_answers aa
               join quiz_attempts a on a.id = aa.attempt_id where a.user_id = %(u)s) as answers
            from profiles p where p.id = %(u)s and p.deleted_at is null
            """,
            {"u": user_id},
        )
    ).fetchone()
    return bool(row and row["verified"] and row["onboarded"] and row["answers"] >= ANSWERS_NEEDED)


async def check(conn: AsyncConnection, user_id: UUID) -> None:
    """Queues the credit job once a pending referral's conditions are met. Cheap to call after
    onboarding, after a claim, and after each finished quiz."""
    pending = await (
        await conn.execute(
            "select 1 from referrals where invitee_id = %s and status = 'pending'", (user_id,)
        )
    ).fetchone()
    if pending and await ready_for_credit(conn, user_id):
        await queue.enqueue(
            conn,
            "credit_referral",
            {"invitee_id": str(user_id)},
            user_id=user_id,
            dedupe_key=f"credit:{user_id}",
        )


async def _reject(conn: AsyncConnection, referral_id: UUID, reason: str) -> None:
    await conn.execute(
        "update referrals set status = 'rejected', reject_reason = %s where id = %s",
        (reason, referral_id),
    )


async def credit(conn: AsyncConnection, invitee_id: UUID) -> str | None:
    """The `credit_referral` job. Returns the outcome: credited, or the reject reason."""
    async with conn.transaction():
        r = await (
            await conn.execute(
                "select id, inviter_id, invitee_id, device_hash from referrals "
                "where invitee_id = %s and status = 'pending' for update",
                (invitee_id,),
            )
        ).fetchone()
        if r is None or not await ready_for_credit(conn, invitee_id):
            return None
        if r["inviter_id"] == r["invitee_id"]:
            await _reject(conn, r["id"], "self")
            return "self"
        if r["device_hash"]:
            seen = await (
                await conn.execute(
                    "select 1 from referrals where device_hash = %s and status = 'credited' "
                    "and id <> %s",
                    (r["device_hash"], r["id"]),
                )
            ).fetchone()
            if seen:
                await _reject(conn, r["id"], "device_seen")
                return "device_seen"
        count = (
            await (
                await conn.execute(
                    "select count(*) as n from referrals where inviter_id = %s "
                    "and status = 'credited'",
                    (r["inviter_id"],),
                )
            ).fetchone()
        )["n"]
        if count >= MAX_CREDITS:
            await _reject(conn, r["id"], "cap_reached")
            return "cap_reached"
        await conn.execute(
            "update referrals set status = 'credited', credited_at = now() where id = %s",
            (r["id"],),
        )
        n = count + 1
        friend = await (
            await conn.execute("select display_name from profiles where id = %s", (invitee_id,))
        ).fetchone()
        await notifications.notify(
            conn,
            r["inviter_id"],
            "invite_joined",
            f"{friend['display_name']} joined Quizzly with your invite",
            f"{n} friend{'s' if n != 1 else ''} joined"
            + ("" if n >= LAVENDER_AT else f" · {LAVENDER_AT - n} more to unlock Lavender"),
            {"route": "/invite"},
            actor_id=invitee_id,
            dedupe_key=f"invite:{r['inviter_id']}:joined",
        )
        if n >= LAVENDER_AT:
            await conn.execute(
                "insert into achievements (user_id, kind, ref) values (%s, 'theme_unlocked', %s) "
                "on conflict do nothing",
                (r["inviter_id"], json.dumps({"theme": "lavender"})),
            )
        return "credited"
