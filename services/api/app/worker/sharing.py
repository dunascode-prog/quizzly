"""`fan_out_share_update` job: new notes in a shared course (FR-SHARE-06).

Members read the course's ready documents directly, so nothing is copied; each active member gets
one batched `shared_course_updated` notification ("Ada O. added 3 notes to CSC 225").
"""

from uuid import UUID

from psycopg import AsyncConnection

from app.domain import notifications


async def fan_out_share_update(conn: AsyncConnection, job: dict) -> None:
    share_id = UUID(job["payload"]["share_id"])
    share = await (
        await conn.execute(
            "select s.id, s.course_id, s.owner_id, c.code, p.display_name as owner_name "
            "from course_shares s join courses c on c.id = s.course_id "
            "join profiles p on p.id = s.owner_id where s.id = %s and s.status = 'active'",
            (share_id,),
        )
    ).fetchone()
    if share is None:
        return  # stopped sharing since
    doc = await (
        await conn.execute(
            "select title from documents where id = %s and status = 'ready' and deleted_at is null",
            (UUID(job["payload"]["document_id"]),),
        )
    ).fetchone()
    if doc is None:
        return
    key = f"share:{share_id}:updated"
    for m in await (
        await conn.execute(
            "select user_id from course_members where share_id = %s and status = 'active'",
            (share_id,),
        )
    ).fetchall():
        # Count the notes added since the member last read this notification.
        prev = await (
            await conn.execute(
                "select coalesce((target->'params'->>'count')::int, 0) as n from notifications "
                "where user_id = %s and dedupe_key = %s and read_at is null",
                (m["user_id"], key),
            )
        ).fetchone()
        n = (prev["n"] if prev else 0) + 1
        title = (
            f"{share['owner_name']} added a note to {share['code']}"
            if n == 1
            else f"{share['owner_name']} added {n} notes to {share['code']}"
        )
        await notifications.notify(
            conn,
            m["user_id"],
            "shared_course_updated",
            title,
            doc["title"] if n == 1 else f"Latest: {doc['title']}",
            {"route": "/course/[id]", "params": {"id": str(share["course_id"]), "count": n}},
            actor_id=share["owner_id"],
            dedupe_key=key,
        )
