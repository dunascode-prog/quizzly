"""Course sharing (FR-SHARE-01..11, FR-MOD-04/05).

An owner shares a course in Quizzly (pending until the recipient adds it) or by link. Members
study the course's ready documents read-only; they never see the owner's files, scores, chats or
progress, and the owner sees only members' display names.
"""

import secrets
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection, errors

from app.domain import avatars, notifications, usage
from app.worker import queue

CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # Crockford base32: no I, L, O, U
CODE_LENGTH = 8
MAX_MEMBERS = 300
REPORTS_TO_UNSHARE = 5  # distinct members (FR-MOD-05)
MEMBER_COUNT_SHOWN_FROM = 3  # the join screen hides small counts (FR-SHARE-04)


class ShareGone(Exception):
    """The link or invite no longer works. `owner` names who to ask, when known."""

    def __init__(self, owner: str | None = None, taken_down: bool = False):
        self.owner, self.taken_down = owner, taken_down


class ShareFull(Exception):
    def __init__(self, owner: str):
        self.owner = owner


class ShareLimit(Exception):
    pass


def new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalise_code(code: str) -> str:
    """Share codes are read aloud and typed: case doesn't matter, and O/I/L read as 0/1/1 (they
    never appear in Crockford base32)."""
    return code.strip().upper().translate(str.maketrans("OIL", "011"))


def normalise_invite_code(code: str) -> str:
    """Invite codes are a first name plus digits ("TOLU7"): only case is ignored."""
    return code.strip().upper()


async def _owned_course(conn: AsyncConnection, owner: UUID, course_id: UUID) -> dict | None:
    return await (
        await conn.execute(
            "select c.id, c.code, c.title, p.display_name as owner_name from courses c "
            "join profiles p on p.id = c.user_id where c.id = %s and c.user_id = %s",
            (course_id, owner),
        )
    ).fetchone()


async def active_share(conn: AsyncConnection, course_id: UUID) -> dict | None:
    return await (
        await conn.execute(
            "select id, code, member_count, owner_id from course_shares "
            "where course_id = %s and status = 'active'",
            (course_id,),
        )
    ).fetchone()


async def get_share(conn: AsyncConnection, owner: UUID, course_id: UUID) -> dict | None:
    """The course's active share, or None. Raises LookupError if the course isn't theirs."""
    if await _owned_course(conn, owner, course_id) is None:
        raise LookupError
    return await active_share(conn, course_id)


async def ensure_share(conn: AsyncConnection, owner: UUID, course_id: UUID) -> dict:
    share = await active_share(conn, course_id)
    while share is None:
        try:
            async with conn.transaction():
                await conn.execute(
                    "insert into course_shares (course_id, owner_id, code) values (%s, %s, %s)",
                    (course_id, owner, new_code()),
                )
        except errors.UniqueViolation:
            pass  # code taken (or a share made at the same moment): look again / retry
        share = await active_share(conn, course_id)
    return share


async def coursemates(conn: AsyncConnection, user_id: UUID) -> list[dict[str, Any]]:
    """People who already share a course with the student, either way; quick picks on screen 19.
    Blocked people (either way) never appear (FR-SHARE-09)."""
    return await (
        await conn.execute(
            f"""
            with mates as (
              select s.owner_id as user_id from course_members m
              join course_shares s on s.id = m.share_id and s.status = 'active'
              where m.user_id = %(u)s and m.status = 'active'
              union
              select m.user_id from course_shares s
              join course_members m on m.share_id = s.id and m.status = 'active'
              where s.owner_id = %(u)s and s.status = 'active'
            )
            select p.id as user_id, p.display_name,
                   {avatars.shown_path_sql("%(u)s")} as avatar_path
            from mates
            join profiles p on p.id = mates.user_id and p.deleted_at is null
            where mates.user_id <> %(u)s
              and not exists (select 1 from user_blocks b
                              where (b.blocker_id = %(u)s and b.blocked_id = p.id)
                                 or (b.blocker_id = p.id and b.blocked_id = %(u)s))
            order by p.display_name
            """,
            {"u": user_id},
        )
    ).fetchall()


async def _accepts_from(conn: AsyncConnection, recipient: dict, sender: UUID) -> bool:
    """Receiving controls (FR-SHARE-09): blocks and "Who can send me courses"."""
    blocked = await (
        await conn.execute(
            "select 1 from user_blocks where blocker_id = %s and blocked_id = %s",
            (recipient["id"], sender),
        )
    ).fetchone()
    if blocked or recipient["share_permission"] == "nobody":
        return False
    if recipient["share_permission"] == "coursemates":
        mates = {m["user_id"] for m in await coursemates(conn, recipient["id"])}
        return sender in mates
    return True


async def _counts(conn: AsyncConnection, course_id: UUID) -> dict[str, int]:
    return await (
        await conn.execute(
            """
            select count(distinct d.id) as notes,
                   (select count(*) from topics t where t.parent_id is null and t.source_file_id
                      in (select source_file_id from documents where course_id = %(c)s
                          and status = 'ready' and deleted_at is null
                          and kind = 'notes')) as topics,
                   (select count(*) from questions q
                    join question_sets s on s.id = q.question_set_id
                    where not q.hidden and s.source_file_id
                      in (select source_file_id from documents where course_id = %(c)s
                          and status = 'ready' and deleted_at is null
                          and kind = 'notes')) as questions
            from documents d
            where d.course_id = %(c)s and d.status = 'ready' and d.deleted_at is null
              and d.kind = 'notes'
            """,
            {"c": course_id},
        )
    ).fetchone()


async def share_course(
    conn: AsyncConnection,
    owner: UUID,
    course_id: UUID,
    user_ids: list[UUID],
    codes: list[str],
    daily_limit: int,
    tz: str,
) -> dict[str, Any]:
    """Shares the course (making its link if needed) and invites people in Quizzly. Recipients
    whose settings or blocks refuse it are skipped silently: the sender sees it as sent
    (FRD §4). Raises LookupError (not their course) or ShareLimit (20 a day, FR-SHARE-10)."""
    course = await _owned_course(conn, owner, course_id)
    if course is None:
        raise LookupError
    share = await ensure_share(conn, owner, course_id)
    mates = {m["user_id"] for m in await coursemates(conn, owner)}
    recipients: dict[UUID, dict] = {}
    if codes:
        for r in await (
            await conn.execute(
                "select id, share_permission::text as share_permission from profiles "
                "where upper(invite_code) = any(%s) and deleted_at is null",
                ([normalise_invite_code(c) for c in codes],),
            )
        ).fetchall():
            recipients[r["id"]] = r
    if user_ids:
        for r in await (
            await conn.execute(
                "select id, share_permission::text as share_permission from profiles "
                "where id = any(%s) and deleted_at is null",
                ([u for u in user_ids if u in mates],),  # quick picks are coursemates only
            )
        ).fetchall():
            recipients[r["id"]] = r
    recipients.pop(owner, None)
    already = {
        r["user_id"]
        for r in await (
            await conn.execute(
                "select user_id from course_members where share_id = %s "
                "and status in ('pending', 'active')",
                (share["id"],),
            )
        ).fetchall()
    }
    new = [r for uid, r in recipients.items() if uid not in already]
    taken = 0
    for _ in new:
        if await usage.take(conn, owner, "share_recipient", daily_limit, tz) is None:
            await usage.give_back(conn, owner, "share_recipient", taken, tz)
            raise ShareLimit
        taken += 1
    counts = await _counts(conn, course_id)
    for r in new:
        if not await _accepts_from(conn, r, owner):
            continue
        member = await (
            await conn.execute(
                """
                insert into course_members (share_id, user_id, invited_by, source, status)
                values (%s, %s, %s, 'in_app', 'pending')
                on conflict (share_id, user_id) do update
                  set status = 'pending', invited_by = excluded.invited_by, source = 'in_app',
                      ended_at = null
                returning id
                """,
                (share["id"], r["id"], owner),
            )
        ).fetchone()
        await notifications.notify(
            conn,
            r["id"],
            "course_shared",
            f"{course['owner_name']} shared {course['code']} with you",
            f"{counts['topics']} topics, {counts['questions']} questions",
            {"route": "/shares/[memberId]", "params": {"memberId": str(member["id"])}},
            actor_id=owner,
            dedupe_key=f"share:{share['id']}:invite",
        )
    share = await active_share(conn, course_id)
    return share | {"sent": len(new)}


async def members(conn: AsyncConnection, owner: UUID, course_id: UUID) -> list[dict]:
    """Display names only (FR-SHARE-07). Raises LookupError if the course isn't theirs."""
    if await _owned_course(conn, owner, course_id) is None:
        raise LookupError
    return await (
        await conn.execute(
            f"""
            select m.id as member_id, p.id as user_id, p.display_name, m.status::text as status,
                   m.joined_at, {avatars.shown_path_sql("%(owner)s")} as avatar_path
            from course_shares s join course_members m on m.share_id = s.id
            join profiles p on p.id = m.user_id
            where s.course_id = %(course)s and s.status = 'active'
              and m.status in ('pending', 'active')
            order by m.status, p.display_name
            """,
            {"course": course_id, "owner": owner},
        )
    ).fetchall()


async def _end(
    conn: AsyncConnection, share_id: UUID, member_ids: list[UUID] | None, notice: tuple[str, str]
) -> None:
    """Ends memberships (all of the share's, or the given ones) and tells active members."""
    ended = await (
        await conn.execute(
            """
            with ending as (
              select id, user_id, status from course_members
              where share_id = %s and status in ('pending', 'active')
                and (%s::uuid[] is null or id = any(%s))
            ), done as (
              update course_members m set status = 'removed', ended_at = now()
              from ending where m.id = ending.id
            )
            select user_id, status::text as status from ending
            """,
            (share_id, member_ids, member_ids),
        )
    ).fetchall()
    type_, title = notice
    for row in ended:
        if row["status"] == "active":  # a pending invite just disappears
            await notifications.notify(conn, row["user_id"], type_, title, target={"route": "/"})


async def remove_member(
    conn: AsyncConnection, owner: UUID, course_id: UUID, member_id: UUID
) -> bool:
    course = await _owned_course(conn, owner, course_id)
    share = await active_share(conn, course_id) if course else None
    if share is None:
        return False
    await _end(
        conn, share["id"], [member_id], ("share_revoked", f"You no longer have {course['code']}")
    )
    return True


async def regenerate(conn: AsyncConnection, owner: UUID, course_id: UUID) -> dict | None:
    """A new link; the old one stops working (FR-SHARE-07). Members keep access."""
    if await _owned_course(conn, owner, course_id) is None:
        return None
    share = await ensure_share(conn, owner, course_id)
    while True:
        try:
            async with conn.transaction():
                await conn.execute(
                    "update course_shares set code = %s where id = %s", (new_code(), share["id"])
                )
            break
        except errors.UniqueViolation:
            continue
    return await active_share(conn, course_id)


async def stop(conn: AsyncConnection, owner: UUID, course_id: UUID) -> bool:
    """Stop sharing: everyone loses access and gets `share_revoked` (FR-SHARE-07). Members keep
    their past attempts as score history."""
    course = await _owned_course(conn, owner, course_id)
    share = await active_share(conn, course_id) if course else None
    if share is None:
        return False
    await conn.execute(
        "update course_shares set status = 'revoked', revoked_at = now() where id = %s",
        (share["id"],),
    )
    await _end(
        conn, share["id"], None, ("share_revoked", f"{course['code']} isn't shared any more")
    )
    return True


async def end_all_for_owner(conn: AsyncConnection, owner: UUID) -> None:
    """Account deletion: the student's shares stop and members are told (FR-AUTH-05)."""
    for s in await (
        await conn.execute(
            "select course_id from course_shares where owner_id = %s and status = 'active'",
            (owner,),
        )
    ).fetchall():
        await stop(conn, owner, s["course_id"])


async def take_down(conn: AsyncConnection, share_id: UUID) -> None:
    """Moderation (FR-MOD-04/05): unshared pending review; members get "no longer available"."""
    await conn.execute(
        "update course_shares set status = 'taken_down', revoked_at = now() where id = %s "
        "and status = 'active'",
        (share_id,),
    )
    await _end(conn, share_id, None, ("course_unavailable", "This course is no longer available."))


_SHARE_COLUMNS = """
       s.id as share_id, s.status::text as share_status,
       s.member_count, s.owner_id, c.id as course_id, c.code, c.title, c.accent::text as accent,
       p.display_name as owner_name, p.level,
       coalesce(i.short_name, i.name, p.institution_other) as institution
from course_shares s
join courses c on c.id = s.course_id
join profiles p on p.id = s.owner_id
left join institutions i on i.id = p.institution_id
"""
_PREVIEW = "select m.id as member_id, m.status::text as status," + _SHARE_COLUMNS
_SHARE_BY_CODE = "select" + _SHARE_COLUMNS + "where s.code = %s"


async def _preview(conn: AsyncConnection, row: dict) -> dict[str, Any]:
    counts = await _counts(conn, row["course_id"])
    return {
        "member_id": row.get("member_id"),
        "status": row.get("status"),
        "course_id": row["course_id"],
        "code": row["code"],
        "accent": row["accent"],
        "title": row["title"],
        "owner_name": row["owner_name"],
        "institution": row["institution"],
        "level": None if row["level"] == "other" else row["level"],
        "notes": counts["notes"],
        "topics": counts["topics"],
        "questions": counts["questions"],
        # Only shown from 3 members, so a small group isn't exposed (FR-SHARE-04).
        "member_count": row["member_count"]
        if row["member_count"] >= MEMBER_COUNT_SHOWN_FROM
        else None,
    }


async def preview_invite(conn: AsyncConnection, user_id: UUID, member_id: UUID) -> dict | None:
    """Screen 20 for an in-app share."""
    row = await (
        await conn.execute(
            _PREVIEW + "join course_members m on m.share_id = s.id "
            "where m.id = %s and m.user_id = %s and m.status in ('pending', 'active')",
            (member_id, user_id),
        )
    ).fetchone()
    if row is None:
        return None
    if row["share_status"] != "active":
        raise ShareGone(row["owner_name"], row["share_status"] == "taken_down")
    return await _preview(conn, row)


async def _by_code(conn: AsyncConnection, user_id: UUID, code: str) -> dict:
    row = await (await conn.execute(_SHARE_BY_CODE, (normalise_code(code),))).fetchone()
    if row is None:
        raise ShareGone()
    if row["share_status"] != "active":
        raise ShareGone(row["owner_name"], row["share_status"] == "taken_down")
    blocked = await (
        await conn.execute(
            "select 1 from user_blocks where (blocker_id = %(o)s and blocked_id = %(u)s) "
            "or (blocker_id = %(u)s and blocked_id = %(o)s)",
            {"o": row["owner_id"], "u": user_id},
        )
    ).fetchone()
    if blocked:
        raise ShareGone(row["owner_name"])
    return row


async def preview_code(conn: AsyncConnection, user_id: UUID, code: str) -> dict[str, Any]:
    """Screen 20 for a share link (`/c/{code}`). Raises ShareGone."""
    row = await _by_code(conn, user_id, code)
    mine = await (
        await conn.execute(
            "select id, status::text as status from course_members "
            "where share_id = %s and user_id = %s",
            (row["share_id"], user_id),
        )
    ).fetchone()
    data = await _preview(conn, row)
    data |= {"own_course": row["owner_id"] == user_id}
    if mine:
        data |= {"member_id": mine["id"], "status": mine["status"]}
    return data


async def _activate(conn: AsyncConnection, row: dict, user_id: UUID, source: str) -> UUID:
    """Joins (or re-joins) the course; tells the owner, batched (FR-NOTIF-01)."""
    if row["member_count"] >= MAX_MEMBERS:
        raise ShareFull(row["owner_name"])
    member = await (
        await conn.execute(
            """
            insert into course_members (share_id, user_id, source, status, joined_at)
            values (%s, %s, %s, 'active', now())
            on conflict (share_id, user_id) do update
              set status = 'active', joined_at = now(), ended_at = null
            returning id
            """,
            (row["share_id"], user_id, source),
        )
    ).fetchone()
    me = await (
        await conn.execute("select display_name from profiles where id = %s", (user_id,))
    ).fetchone()
    count = await (
        await conn.execute(
            "select count(*) as n from course_members where share_id = %s and status = 'active'",
            (row["share_id"],),
        )
    ).fetchone()
    title = (
        f"{me['display_name']} joined {row['code']}"
        if count["n"] == 1
        else f"{me['display_name']} and others joined {row['code']}"
    )
    await notifications.notify(
        conn,
        row["owner_id"],
        "share_member_joined",
        title,
        f"{count['n']} coursemates are studying it",
        {"route": "/course/[id]/members", "params": {"id": str(row["course_id"])}},
        actor_id=user_id,
        dedupe_key=f"share:{row['share_id']}:joined",
    )
    return member["id"]


async def join(conn: AsyncConnection, user_id: UUID, code: str) -> dict[str, Any]:
    """Add to library from a link. Raises ShareGone / ShareFull."""
    row = await _by_code(conn, user_id, code)
    if row["owner_id"] == user_id:
        return {"member_id": None, "course_id": row["course_id"]}
    current = await (
        await conn.execute(
            "select id from course_members where share_id = %s and user_id = %s "
            "and status = 'active'",
            (row["share_id"], user_id),
        )
    ).fetchone()
    member_id = current["id"] if current else await _activate(conn, row, user_id, "link")
    return {"member_id": member_id, "course_id": row["course_id"]}


async def respond(
    conn: AsyncConnection, user_id: UUID, member_id: UUID, action: str
) -> dict | None:
    """accept / decline a pending share, or leave a joined course. The sender isn't told about a
    decline (FR-SHARE-03). Raises ShareGone / ShareFull."""
    row = await (
        await conn.execute(
            _PREVIEW + "join course_members m on m.share_id = s.id "
            "where m.id = %s and m.user_id = %s",
            (member_id, user_id),
        )
    ).fetchone()
    if row is None:
        return None
    if action == "accept":
        if row["share_status"] != "active":
            raise ShareGone(row["owner_name"], row["share_status"] == "taken_down")
        if row["status"] != "active":
            if row["status"] != "pending":
                return None
            await _activate(conn, row, user_id, "in_app")
    elif action == "decline" and row["status"] == "pending":
        await conn.execute(
            "update course_members set status = 'declined', ended_at = now() where id = %s",
            (member_id,),
        )
    elif action == "leave" and row["status"] == "active":
        await conn.execute(
            "update course_members set status = 'left', ended_at = now() where id = %s",
            (member_id,),
        )
    else:
        return None
    return {"member_id": member_id, "course_id": row["course_id"]}


async def block(conn: AsyncConnection, user_id: UUID, blocked_id: UUID) -> None:
    """They can't send shares any more and don't appear as a coursemate; shares they already
    sent are dropped silently (FR-SHARE-09)."""
    if blocked_id == user_id:
        return
    await conn.execute(
        "insert into user_blocks (blocker_id, blocked_id) values (%s, %s) on conflict do nothing",
        (user_id, blocked_id),
    )
    await conn.execute(
        """
        update course_members m set status = 'declined', ended_at = now()
        from course_shares s
        where s.id = m.share_id and s.owner_id = %s and m.user_id = %s and m.status = 'pending'
        """,
        (blocked_id, user_id),
    )


async def blocked(conn: AsyncConnection, user_id: UUID) -> list[dict[str, Any]]:
    """People the student has blocked, display names only (Privacy and blocking)."""
    return await (
        await conn.execute(
            "select b.blocked_id as user_id, p.display_name, b.created_at from user_blocks b "
            "join profiles p on p.id = b.blocked_id where b.blocker_id = %s "
            "order by b.created_at desc",
            (user_id,),
        )
    ).fetchall()


async def unblock(conn: AsyncConnection, user_id: UUID, blocked_id: UUID) -> None:
    await conn.execute(
        "delete from user_blocks where blocker_id = %s and blocked_id = %s", (user_id, blocked_id)
    )


async def report_course(
    conn: AsyncConnection, user_id: UUID, course_id: UUID, reason: str, note: str | None
) -> bool:
    """A member reports a shared course; 5 different members unshare it pending review
    (FR-MOD-05). Returns False when the student isn't a member."""
    share = await active_share(conn, course_id)
    member = (
        share
        and await (
            await conn.execute(
                "select 1 from course_members where share_id = %s and user_id = %s "
                "and status = 'active'",
                (share["id"], user_id),
            )
        ).fetchone()
    )
    if not member:
        return False
    await conn.execute(
        "insert into reports (user_id, target_type, target_id, reason, note) "
        "values (%s, 'course', %s, %s, %s) on conflict do nothing",
        (user_id, course_id, reason, note),
    )
    n = await (
        await conn.execute(
            "select count(distinct user_id) as n from reports where target_type = 'course' "
            "and target_id = %s and status = 'open'",
            (course_id,),
        )
    ).fetchone()
    await conn.execute(
        "update course_shares set report_count = %s where id = %s", (n["n"], share["id"])
    )
    if n["n"] >= REPORTS_TO_UNSHARE:
        await take_down(conn, share["id"])
    return True


async def document_ready_in_shared_course(conn: AsyncConnection, document_id: UUID) -> None:
    """FR-SHARE-06: new notes in a shared course reach members automatically; queue one batched
    notification per member."""
    row = await (
        await conn.execute(
            "select s.id as share_id from documents d "
            "join course_shares s on s.course_id = d.course_id and s.status = 'active' "
            "where d.id = %s and d.status = 'ready'",
            (document_id,),
        )
    ).fetchone()
    if row:
        await queue.enqueue(
            conn,
            "fan_out_share_update",
            {"share_id": str(row["share_id"]), "document_id": str(document_id)},
            dedupe_key=f"fanout:{document_id}",
        )
