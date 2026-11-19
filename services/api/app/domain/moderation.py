"""Reports and takedowns for the admin app (E4, WEB.md §3 30c/30d; FR-MOD-01/02/04/05).

Admins see the reported item itself and what reporters wrote (with school and level, never names),
never anyone's notes, chats or progress otherwise. Every action is audited by the route."""

import json
from typing import Any, Literal
from uuid import UUID

from psycopg import AsyncConnection

from app.domain import notifications, page_images, quizzes, sharing
from app.rag import questions as q
from app.worker import queue

Target = Literal["question", "explanation", "chat_message", "course"]
REPORT_STATUS = Literal["open", "resolved", "dismissed"]


class BadAnswer(ValueError):
    pass


async def queue_list(
    conn: AsyncConnection, status: str, target_type: str | None, limit: int
) -> list[dict[str, Any]]:
    """Reports grouped by the item they're about, newest activity first."""
    return await (
        await conn.execute(
            """
            select r.target_type::text as type, r.target_id, count(*) as reports,
                   count(distinct r.user_id) as reporters, max(r.created_at) as last_at,
                   (array_agg(r.reason::text order by r.created_at desc))[1] as reason,
                   (array_agg(r.note order by r.created_at desc)
                      filter (where r.note is not null))[1] as note,
                   coalesce(bool_or(qn.hidden), false) as hidden,
                   left(coalesce(max(qn.stem), max(c.code || ' · ' || coalesce(c.title, '')),
                                 max(t.title), ''), 140) as preview
            from reports r
            left join questions qn on r.target_type = 'question' and qn.id = r.target_id
            left join courses c on r.target_type = 'course' and c.id = r.target_id
            left join explanations e on r.target_type = 'explanation' and e.id = r.target_id
            left join topics t on t.id = e.topic_id
            where r.status = %(status)s::report_status
              and (%(type)s::text is null or r.target_type::text = %(type)s)
              and r.target_type::text <> 'avatar'
            group by 1, 2 order by last_at desc limit %(limit)s
            """,
            {"status": status, "type": target_type, "limit": limit},
        )
    ).fetchall()


async def detail(conn: AsyncConnection, target_type: str, target_id: UUID) -> dict | None:
    """The reported item, its reporters' notes (school, level, time: no names) and, for a
    question, how often it was answered and got right."""
    reporters = await (
        await conn.execute(
            """
            select r.reason::text as reason, r.note, r.status::text as status, r.created_at,
                   coalesce(i.short_name, i.name, p.institution_other) as school, p.level
            from reports r join profiles p on p.id = r.user_id
            left join institutions i on i.id = p.institution_id
            where r.target_type::text = %s and r.target_id = %s order by r.created_at desc
            """,
            (target_type, target_id),
        )
    ).fetchall()
    if not reporters:
        return None
    item: dict[str, Any] | None = None
    if target_type == "question":
        item = await (
            await conn.execute(
                """
                select qn.type::text as type, qn.stem, qn.options, qn.answer, qn.explanation,
                       qn.source_pages, qn.hidden,
                       (select string_agg(left(ch.content, 600), E'\n\n' order by ch.ordinal)
                          from chunks ch where ch.id = any(qn.source_chunk_ids)) as source_text,
                       (select count(*) from attempt_answers a where a.question_id = qn.id)
                         as answered,
                       (select count(*) from attempt_answers a where a.question_id = qn.id
                          and a.is_correct) as correct
                from questions qn where qn.id = %s
                """,
                (target_id,),
            )
        ).fetchone()
    elif target_type == "explanation":
        item = await (
            await conn.execute(
                "select t.title, e.style::text as style, left(e.content_md, 4000) as content "
                "from explanations e join topics t on t.id = e.topic_id where e.id = %s",
                (target_id,),
            )
        ).fetchone()
    elif target_type == "chat_message":
        item = await (
            await conn.execute(
                "select left(content, 4000) as content, grounded from chat_messages "
                "where id = %s and role = 'assistant'",
                (target_id,),
            )
        ).fetchone()
    elif target_type == "course":
        item = await (
            await conn.execute(
                """
                select c.code, c.title, s.status::text as share_status, s.code as share_code,
                       s.member_count
                from courses c left join course_shares s on s.course_id = c.id
                where c.id = %s order by s.created_at desc nulls last limit 1
                """,
                (target_id,),
            )
        ).fetchone()
    return {"type": target_type, "target_id": target_id, "item": item, "reporters": reporters}


async def _close(
    conn: AsyncConnection, target_type: str, target_id: UUID, status: str
) -> list[UUID]:
    """Closes the item's open reports; returns who reported it."""
    rows = await (
        await conn.execute(
            "update reports set status = %s::report_status where target_type::text = %s "
            "and target_id = %s and status = 'open' returning user_id",
            (status, target_type, target_id),
        )
    ).fetchall()
    return list({r["user_id"] for r in rows})


async def dismiss(conn: AsyncConnection, target_type: str, target_id: UUID) -> int:
    """Nothing wrong: close the reports and bring a hidden question back."""
    closed = await _close(conn, target_type, target_id, "dismissed")
    if target_type == "question":
        await conn.execute(
            "update questions set hidden = false, report_count = 0 where id = %s", (target_id,)
        )
    return len(closed)


async def keep_hidden(conn: AsyncConnection, target_type: str, target_id: UUID) -> int:
    """Really wrong: the question stays out of quizzes for good; the reports are resolved."""
    if target_type == "question":
        await conn.execute("update questions set hidden = true where id = %s", (target_id,))
    return len(await _close(conn, target_type, target_id, "resolved"))


def check_answer(qtype: str, options: list | None, answer: Any) -> Any:
    """The corrected answer in the shape the question type stores (FR-QGEN-03)."""
    if qtype == "mcq":
        if not isinstance(answer, int) or isinstance(answer, bool):
            raise BadAnswer("Pick the correct option by its number.")
        if not options or not 0 <= answer < len(options):
            raise BadAnswer("That option doesn't exist.")
        return answer
    if qtype == "true_false":
        if not isinstance(answer, bool):
            raise BadAnswer("The answer must be true or false.")
        return answer
    if qtype == "fill_blank":
        if not isinstance(answer, str) or not answer.strip():
            raise BadAnswer("Type the correct answer.")
        return answer.strip()
    raise BadAnswer(
        "Only multiple-choice, true/false and fill-the-blank answers can be fixed here."
    )


async def fix_answer(
    conn: AsyncConnection, question_id: UUID, answer: Any, explanation: str | None
) -> dict[str, int]:
    """Corrects a question's answer, re-marks every past answer to it, rescores the attempts,
    brings it back into quizzes, resolves the reports and thanks the reporters."""
    qn = await (
        await conn.execute(
            "select id, type::text as type, options, answer, marks from questions where id = %s",
            (question_id,),
        )
    ).fetchone()
    if qn is None:
        raise LookupError
    stored = check_answer(qn["type"], qn["options"], answer)
    if qn["type"] == "fill_blank" and isinstance(qn["answer"], dict):
        stored = {**qn["answer"], "text": stored}  # keep the accepted alternatives
    await conn.execute(
        "update questions set answer = %s, explanation = coalesce(%s, explanation), "
        "hidden = false, report_count = 0 where id = %s",
        (json.dumps(stored), explanation, question_id),
    )
    answers = await (
        await conn.execute(
            "select id, attempt_id, response from attempt_answers where question_id = %s "
            "and (marked_by = 'server' or marked_by is null)",
            (question_id,),
        )
    ).fetchall()
    for a in answers:
        correct = q.is_correct(qn["type"], stored, a["response"])
        await conn.execute(
            "update attempt_answers set is_correct = %s, score = %s, marked_by = 'server' "
            "where id = %s",
            (correct, qn["marks"] if correct else 0, a["id"]),
        )
    rescored = 0
    for attempt_id in {a["attempt_id"] for a in answers}:
        attempt = await (
            await conn.execute(
                "select a.id, a.user_id, z.question_set_id, z.question_ids "
                "from quiz_attempts a join quizzes z on z.id = a.quiz_id "
                "where a.id = %s and a.status = 'completed'",
                (attempt_id,),
            )
        ).fetchone()
        if attempt:
            score, max_score, topics = await quizzes._score(conn, attempt)
            await conn.execute(
                "update quiz_attempts set score = %s, max_score = %s, topic_breakdown = %s "
                "where id = %s",
                (score, max_score, json.dumps(topics), attempt_id),
            )
            rescored += 1
    reporters = await _close(conn, "question", question_id, "resolved")
    for user_id in reporters:
        await notifications.notify(
            conn,
            user_id,
            "report_resolved",
            "Thanks for your report",
            "We fixed the question you reported. Your past scores have been updated.",
            dedupe_key=f"report:{question_id}",
        )
    return {"remarked": len(answers), "rescored": rescored, "thanked": len(reporters)}


# --- takedowns (FR-MOD-04) ------------------------------------------------------------------------


async def take_down_file(conn: AsyncConnection, sha256: str, notify: bool) -> int:
    """Blocks a file by its hash: deletes everything made from it, fails every copy, removes the
    stored files and refuses the same file if anyone uploads it again. Returns students affected."""
    sf = await (
        await conn.execute(
            """
            insert into source_files (sha256, mime_type, size_bytes, storage_path, status,
                                      failure_reason, blocked)
            values (%s, 'application/octet-stream', 0, '', 'failed', 'blocked', true)
            on conflict (sha256) do update set blocked = true, status = 'failed',
                                               failure_reason = 'blocked'
            returning id, storage_path, sha256
            """,
            (sha256,),
        )
    ).fetchone()
    # Quizzes keep their question set from being deleted (on delete restrict): they, and their
    # attempts, are made from the file too.
    await conn.execute(
        "delete from quizzes where question_set_id in "
        "(select id from question_sets where source_file_id = %s)",
        (sf["id"],),
    )
    for table in ("pages", "topics", "chunks", "explanations", "question_sets"):
        await conn.execute(f"delete from {table} where source_file_id = %s", (sf["id"],))
    docs = await (
        await conn.execute(
            "update documents set status = 'failed', failure_reason = 'blocked' "
            "where source_file_id = %s and deleted_at is null "
            "returning id, user_id, title, upload_path",
            (sf["id"],),
        )
    ).fetchall()
    paths = [p for p in [sf["storage_path"], *(d["upload_path"] for d in docs)] if p]
    paths.append(page_images.cache_folder(sf["sha256"]))
    await queue.enqueue(conn, "cleanup_storage", {"paths": sorted(set(paths))})
    if notify:
        for d in docs:
            await notifications.notify(
                conn,
                d["user_id"],
                "document_failed",
                "Notes removed",
                f"{d['title']}: This file was removed after a copyright request.",
                {"route": "/document/[id]", "params": {"id": str(d["id"])}},
                dedupe_key=f"document:{d['id']}",
            )
    return len({d["user_id"] for d in docs})


async def take_down_course(conn: AsyncConnection, share_code: str) -> int | None:
    """Takes down a shared course; members lose access and are told (FR-MOD-04). None if no
    such share is active."""
    share = await (
        await conn.execute(
            "select id, member_count from course_shares where code = %s and status = 'active'",
            (sharing.normalise_code(share_code),),
        )
    ).fetchone()
    if share is None:
        return None
    await sharing.take_down(conn, share["id"])
    return share["member_count"]


async def log_takedown(conn: AsyncConnection, row: dict[str, Any]) -> UUID:
    created = await (
        await conn.execute(
            """
            insert into takedowns (target_type, target, reason, requested_by, note,
                                   students_affected, admin_id)
            values (%(target_type)s, %(target)s, %(reason)s, %(requested_by)s, %(note)s,
                    %(students_affected)s, %(admin_id)s) returning id
            """,
            row,
        )
    ).fetchone()
    return created["id"]


async def takedowns(conn: AsyncConnection, limit: int) -> list[dict[str, Any]]:
    return await (
        await conn.execute(
            "select id, target_type, target, reason, requested_by, students_affected, admin_id, "
            "status, created_at, reversed_at from takedowns order by created_at desc limit %s",
            (limit,),
        )
    ).fetchall()


async def reverse(conn: AsyncConnection, takedown_id: UUID, admin_id: UUID) -> dict | None:
    """Unblocks a file so it can be uploaded and processed again. Its old derived data is gone,
    so students upload it again. A course takedown can't be reversed: members were removed, and
    the owner can share the course again."""
    row = await (
        await conn.execute(
            "select target_type, target from takedowns where id = %s and status = 'active'",
            (takedown_id,),
        )
    ).fetchone()
    if row is None or row["target_type"] != "file":
        return None
    # A failed file with a non-permanent reason is taken over by the next upload (ingest).
    await conn.execute(
        "update source_files set blocked = false, failure_reason = 'internal' where sha256 = %s",
        (row["target"],),
    )
    await conn.execute(
        "update takedowns set status = 'reversed', reversed_at = now(), reversed_by = %s "
        "where id = %s",
        (admin_id, takedown_id),
    )
    return row


async def courses_near_unshare(conn: AsyncConnection) -> list[dict[str, Any]]:
    """Shared courses with open reports, closest to the automatic unshare first (FR-MOD-05)."""
    return await (
        await conn.execute(
            """
            select c.code, c.title, s.code as share_code, s.member_count,
                   count(distinct r.user_id) as reporters
            from reports r join courses c on c.id = r.target_id
            join course_shares s on s.course_id = c.id and s.status = 'active'
            where r.target_type = 'course' and r.status = 'open'
            group by 1, 2, 3, 4 order by reporters desc limit 10
            """,
            {},
        )
    ).fetchall()
