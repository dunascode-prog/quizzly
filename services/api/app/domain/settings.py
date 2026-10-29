"""Study settings and notification settings (FR-HAB-03, FR-HAB-07, FR-HAB-08, FR-SHARE-09)."""

import json
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

THEMES = ("ink", "lagoon", "ankara", "palm", "lavender")
SETTINGS_COLUMNS = (
    "weekly_goal_days",
    "accent",
    "night_mode",
    "low_data_mode",
    "share_permission",
    "show_identity_on_links",
    "timezone",
)
NOTIFICATION_TYPES = ("exam", "due", "recap", "mates", "ready")


class ThemeLocked(Exception):
    pass


async def unlocked_themes(conn: AsyncConnection, user_id: UUID) -> list[str]:
    """Ink always; the others once the progress engine has unlocked them (FR-HAB-07)."""
    rows = await (
        await conn.execute(
            "select ref->>'theme' as theme from achievements "
            "where user_id = %s and kind = 'theme_unlocked'",
            (user_id,),
        )
    ).fetchall()
    have = {r["theme"] for r in rows}
    return [t for t in THEMES if t == "ink" or t in have]


async def get_settings(conn: AsyncConnection, user_id: UUID) -> dict[str, Any] | None:
    row = await (
        await conn.execute(
            "select weekly_goal_days, accent::text as accent, night_mode, low_data_mode, "
            "share_permission::text as share_permission, show_identity_on_links, timezone "
            "from profiles where id = %s and deleted_at is null",
            (user_id,),
        )
    ).fetchone()
    if row is None:
        return None
    return row | {"unlocked_themes": await unlocked_themes(conn, user_id)}


async def update_settings(
    conn: AsyncConnection, user_id: UUID, fields: dict[str, Any]
) -> dict[str, Any] | None:
    fields = {k: v for k, v in fields.items() if k in SETTINGS_COLUMNS}
    if "accent" in fields and fields["accent"] not in await unlocked_themes(conn, user_id):
        raise ThemeLocked(fields["accent"])
    if fields:
        sets = ", ".join(f"{k} = %s" for k in fields)
        await conn.execute(
            f"update profiles set {sets} where id = %s and deleted_at is null",
            (*fields.values(), user_id),
        )
    return await get_settings(conn, user_id)


async def get_notification_settings(conn: AsyncConnection, user_id: UUID) -> dict[str, Any]:
    await conn.execute(
        "insert into notification_settings (user_id) values (%s) on conflict do nothing",
        (user_id,),
    )
    return await (
        await conn.execute(
            "select daily_reminder, daily_reminder_time, quiet_start, quiet_end, types "
            "from notification_settings where user_id = %s",
            (user_id,),
        )
    ).fetchone()


async def update_notification_settings(
    conn: AsyncConnection, user_id: UUID, fields: dict[str, Any]
) -> dict[str, Any]:
    current = await get_notification_settings(conn, user_id)
    if "types" in fields:
        fields["types"] = json.dumps(current["types"] | fields["types"])
    allowed = {"daily_reminder", "daily_reminder_time", "quiet_start", "quiet_end", "types"}
    fields = {k: v for k, v in fields.items() if k in allowed}
    if "daily_reminder_time" in fields:
        fields["daily_reminder_custom"] = True  # their own choice now beats practice times
    if fields:
        sets = ", ".join(f"{k} = %s" for k in fields)
        await conn.execute(
            f"update notification_settings set {sets}, updated_at = now() where user_id = %s",
            (*fields.values(), user_id),
        )
    return await get_notification_settings(conn, user_id)
