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

MAX_CREDITS = 50  # per inviter
LAVENDER_AT = 3  # credits unlock the Lavender theme (FR-INV-05)
DISCOUNT_AT = 5  # credits unlock 10% off Student or Premium (FR-INV-05)
DISCOUNT_PERCENT = 10
STUDY_DAYS_NEEDED = 3  # a friend counts after studying on 3 different days (FR-INV-03)


async def my_invite(conn: AsyncConnection, user_id: UUID, invite_domain: str) -> dict | None:
    """Screen 23: the link, credits, friends (display names only, counted or getting started) and
    the next reward (FR-INV-04)."""
    me = await (
        await conn.execute(
            "select invite_code, discount_unlocked_at, discount_seen_at from profiles "
            "where id = %s and deleted_at is null",
            (user_id,),
        )
    ).fetchone()
    if me is None:
        return None
    friends = await (
        await conn.execute(
            """
            select p.display_name, r.credited_at, r.study_days,
                   case when r.status = 'credited' then 'counted' else 'started' end as state
            from referrals r
            join profiles p on p.id = r.invitee_id
            where r.inviter_id = %s and r.status in ('credited', 'pending')
              and p.deleted_at is null
            order by r.status = 'credited' desc, r.credited_at desc nulls last, r.created_at desc
            """,
            (user_id,),
        )
    ).fetchall()
    n = sum(f["state"] == "counted" for f in friends)
    if n < LAVENDER_AT:
        next_reward = {"kind": "lavender", "at": LAVENDER_AT, "percent": None}
    elif n < DISCOUNT_AT:
        next_reward = {"kind": "discount", "at": DISCOUNT_AT, "percent": DISCOUNT_PERCENT}
    else:
        next_reward = None
    unlocked = me["discount_unlocked_at"] is not None
    return {
        "code": me["invite_code"],
        "link": f"https://{invite_domain}/i/{me['invite_code']}",
        "friends": friends,
        "credited": n,
        "next_reward": next_reward,
        "lavender_unlocked": n >= LAVENDER_AT,
        "discount": {
            "percent": DISCOUNT_PERCENT,
            "at": DISCOUNT_AT,
            "unlocked": unlocked,
            # 23c is shown once (FR-INV-05).
            "celebrate": unlocked and me["discount_seen_at"] is None,
        },
    }


async def mark_reward_seen(conn: AsyncConnection, user_id: UUID) -> None:
    """The 23c celebration was shown; it isn't shown again."""
    await conn.execute(
        "update profiles set discount_seen_at = now() "
        "where id = %s and discount_unlocked_at is not null and discount_seen_at is null",
        (user_id,),
    )


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
    """Email verified, onboarding finished, and studied on 3 different days in their own time zone
    (FR-INV-03): a quiz, flashcards or a Daily 5 each make a study day."""
    row = await (
        await conn.execute(
            """
            select
              (select email_confirmed_at is not null from auth.users where id = %(u)s) as verified,
              ((p.institution_id is not null or p.institution_other is not null)
                and p.level is not null and p.terms_accepted_at is not null) as onboarded,
              (select count(*) from study_days s where s.user_id = %(u)s and s.counted) as days
            from profiles p where p.id = %(u)s and p.deleted_at is null
            """,
            {"u": user_id},
        )
    ).fetchone()
    return bool(row and row["verified"] and row["onboarded"] and row["days"] >= STUDY_DAYS_NEEDED)


async def check(conn: AsyncConnection, user_id: UUID) -> None:
    """Keeps the friend's study-day progress up to date for screen 23, and queues the credit job
    once a pending referral's conditions are met. Cheap to call after onboarding, after a claim,
    and after each finished quiz."""
    pending = await (
        await conn.execute(
            "update referrals set study_days = least(%s, (select count(*) from study_days s "
            "where s.user_id = %s and s.counted)) "
            "where invitee_id = %s and status = 'pending' returning id",
            (STUDY_DAYS_NEEDED, user_id, user_id),
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
            "update referrals set status = 'credited', credited_at = now(), study_days = %s "
            "where id = %s",
            (STUDY_DAYS_NEEDED, r["id"]),
        )
        n = count + 1
        await conn.execute("update profiles set credits = %s where id = %s", (n, r["inviter_id"]))
        friend = await (
            await conn.execute("select display_name from profiles where id = %s", (invitee_id,))
        ).fetchone()
        await notifications.notify(
            conn,
            r["inviter_id"],
            "invite_joined",
            f"{friend['display_name']} joined Quizzly with your invite",
            f"{n} credit{'s' if n != 1 else ''}" + _next_line(n),
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
        if n >= DISCOUNT_AT:
            unlocked = await (
                await conn.execute(
                    "update profiles set discount_unlocked_at = now() "
                    "where id = %s and discount_unlocked_at is null returning id",
                    (r["inviter_id"],),
                )
            ).fetchone()
            if unlocked:  # once (FR-INV-05)
                await notifications.notify(
                    conn,
                    r["inviter_id"],
                    "invite_reward",
                    f"You unlocked {DISCOUNT_PERCENT}% off",
                    f"{DISCOUNT_AT} friends are studying with Quizzly because of you. "
                    f"Student and Premium are now {DISCOUNT_PERCENT}% off for you.",
                    {"route": "/invite/unlocked"},
                    dedupe_key=f"invite:{r['inviter_id']}:reward",
                )
        return "credited"


def _next_line(n: int) -> str:
    """For the invite_joined notification: what the next reward needs."""
    if n < LAVENDER_AT:
        return f" · {LAVENDER_AT - n} more to unlock Lavender"
    if n < DISCOUNT_AT:
        return f" · {DISCOUNT_AT - n} more for {DISCOUNT_PERCENT}% off"
    return ""
