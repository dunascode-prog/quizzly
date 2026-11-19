"""A student's own topic names and merges (FR-TOP-03, DESIGN.md screen 27).

Overrides live in `topic_overrides`, one row per (student, topic): a new `title`, and/or
`merged_into_topic_id` when the topic was merged into the one before it. Nothing about the shared
topics changes, so coursemates and shared copies keep the original outline; explanations, questions
and scores stay linked to the original topics.
"""

from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

TITLE_MAX = 60


def apply_overrides(topics: list[dict], overrides: dict[UUID, dict]) -> list[dict[str, Any]]:
    """The outline as this student sees it. `topics` are in order; a topic merged into another
    disappears and widens that topic's page range. Each visible topic lists its `parts` (the
    original topic ids, in order) and keeps `original_title` when its name was changed."""
    ids = {t["id"] for t in topics}
    visible: list[dict[str, Any]] = []
    by_id: dict[UUID, dict[str, Any]] = {}
    for t in topics:
        target = (overrides.get(t["id"]) or {}).get("merged_into_topic_id")
        if target in by_id:  # merged into a topic shown above it
            parent = by_id[target]
            parent["parts"].append(t["id"])
            parent["part_titles"].append(t["title"])
            starts = [p for p in (parent["page_start"], t["page_start"]) if p is not None]
            ends = [p for p in (parent["page_end"], t["page_end"]) if p is not None]
            parent["page_start"] = min(starts) if starts else None
            parent["page_end"] = max(ends) if ends else None
            parent["original_title"] = parent["original_title"] or parent["title"]
            continue
        if target is not None and target in ids:
            continue  # its target comes later: not a valid merge, ignore it below
        row = {**t, "parts": [t["id"]], "part_titles": [t["title"]], "original_title": None}
        title = (overrides.get(t["id"]) or {}).get("title")
        if title:
            row["original_title"] = t["title"]
            row["title"] = title
        visible.append(row)
        by_id[t["id"]] = row
    for row in visible:
        if len(row["parts"]) > 1 and not (overrides.get(row["id"]) or {}).get("title"):
            # A merge without a new name shows both names.
            names = [t["title"] for t in topics if t["id"] in row["parts"][:2]]
            row["title"] = " and ".join(names)[: TITLE_MAX * 2]
    return visible


async def overrides(conn: AsyncConnection, user_id: UUID, source_file_id: UUID) -> dict[UUID, dict]:
    rows = await (
        await conn.execute(
            "select o.topic_id, o.title, o.merged_into_topic_id from topic_overrides o "
            "join topics t on t.id = o.topic_id "
            "where o.user_id = %s and t.source_file_id = %s",
            (user_id, source_file_id),
        )
    ).fetchall()
    return {r["topic_id"]: r for r in rows}


async def outline(
    conn: AsyncConnection, user_id: UUID, source_file_id: UUID, topics: list[dict]
) -> list[dict[str, Any]]:
    return apply_overrides(topics, await overrides(conn, user_id, source_file_id))


async def _tidy(conn: AsyncConnection, user_id: UUID) -> None:
    """Rows that no longer change anything are removed."""
    await conn.execute(
        "delete from topic_overrides where user_id = %s and title is null "
        "and merged_into_topic_id is null",
        (user_id,),
    )


async def rename(conn: AsyncConnection, user_id: UUID, topic_id: UUID, title: str | None) -> None:
    """A new name, or None to go back to the original."""
    await conn.execute(
        "insert into topic_overrides (user_id, topic_id, title) values (%s, %s, %s) "
        "on conflict (user_id, topic_id) do update set title = excluded.title",
        (user_id, topic_id, title),
    )
    await _tidy(conn, user_id)


async def merge(
    conn: AsyncConnection, user_id: UUID, keep_id: UUID, absorb_id: UUID, title: str | None
) -> None:
    """`absorb_id` (and anything already merged into it) becomes part of `keep_id`."""
    async with conn.transaction():
        await conn.execute(
            "update topic_overrides set merged_into_topic_id = %s "
            "where user_id = %s and merged_into_topic_id = %s",
            (keep_id, user_id, absorb_id),
        )
        await conn.execute(
            "insert into topic_overrides (user_id, topic_id, merged_into_topic_id) "
            "values (%s, %s, %s) on conflict (user_id, topic_id) do update "
            "set merged_into_topic_id = excluded.merged_into_topic_id",
            (user_id, absorb_id, keep_id),
        )
        if title:
            await rename(conn, user_id, keep_id, title)


async def split(conn: AsyncConnection, user_id: UUID, keep_id: UUID) -> None:
    """Undoes the merges into `keep_id`; the merged name goes too, since it named both."""
    async with conn.transaction():
        await conn.execute(
            "update topic_overrides set merged_into_topic_id = null "
            "where user_id = %s and merged_into_topic_id = %s",
            (user_id, keep_id),
        )
        await conn.execute(
            "update topic_overrides set title = null where user_id = %s and topic_id = %s",
            (user_id, keep_id),
        )
        await _tidy(conn, user_id)


async def titles(conn: AsyncConnection, user_id: UUID, topic_ids: list[UUID]) -> dict[UUID, str]:
    """The student's own names for these topics, where they gave one."""
    rows = await (
        await conn.execute(
            "select topic_id, title from topic_overrides "
            "where user_id = %s and topic_id = any(%s) and title is not null",
            (user_id, topic_ids),
        )
    ).fetchall()
    return {r["topic_id"]: r["title"] for r in rows}
