"""Profile photos (FR-PROF-04/05, FR-MOD-06; docs/PROFILE_V2.md).

The app crops and shrinks the photo to a 512x512 WebP; the API checks it again, re-encodes it (which
drops EXIF and GPS data) and stores it under a path it names itself. Other students see a photo only
when its owner turned "Show my photo to classmates" on, reports haven't hidden it, and neither has
blocked the other.
"""

import io
from uuid import UUID, uuid4

from PIL import Image, UnidentifiedImageError
from psycopg import AsyncConnection

MAX_BYTES = 300 * 1024
MAX_SIDE = 1024
MIN_SIDE = 64
OUTPUT_SIDE = 512
QUALITY = 80
REPORTS_TO_HIDE = 3  # FR-MOD-06
SIGNED_SECONDS = 7 * 24 * 3600  # the app caches photos on disk; a week-long URL is plenty


class BadPhoto(ValueError):
    """The upload isn't a usable photo; the message is shown to the student."""


def process(data: bytes) -> bytes:
    """A clean 512x512 WebP from the uploaded one, or BadPhoto."""
    if len(data) > MAX_BYTES:
        raise BadPhoto("That photo is too big. Try again; the app shrinks it before sending.")
    if not (data[:4] == b"RIFF" and data[8:12] == b"WEBP"):
        raise BadPhoto("Send the photo as a WebP image.")
    try:
        with Image.open(io.BytesIO(data)) as img:
            if img.format != "WEBP":
                raise BadPhoto("Send the photo as a WebP image.")
            w, h = img.size
            if max(w, h) > MAX_SIDE or min(w, h) < MIN_SIDE:
                raise BadPhoto("That photo is the wrong size. Crop it again in the app.")
            img.load()
            frame = img.convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise BadPhoto("We couldn't read that photo. Try another one.") from exc
    # Centre-square it in case a client sends a non-square image, then size it.
    side = min(frame.size)
    left, top = (frame.width - side) // 2, (frame.height - side) // 2
    frame = frame.crop((left, top, left + side, top + side))
    if side != OUTPUT_SIDE:
        frame = frame.resize((OUTPUT_SIDE, OUTPUT_SIDE), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    frame.save(out, format="WEBP", quality=QUALITY, method=4)  # no exif/icc passed: stripped
    return out.getvalue()


def new_path(user_id: UUID) -> str:
    """A fresh name per upload, so cached copies of the old photo never show by mistake."""
    return f"{user_id}/{uuid4()}.webp"


async def set_photo(conn: AsyncConnection, user_id: UUID, path: str) -> str | None:
    """Points the profile at the new file; returns the old file's path, to delete."""
    row = await (
        await conn.execute(
            """
            update profiles p set avatar_path = %s, avatar_updated_at = now()
            from (select avatar_path from profiles where id = %s for update) old
            where p.id = %s
            returning old.avatar_path as old_path
            """,
            (path, user_id, user_id),
        )
    ).fetchone()
    return row["old_path"] if row else None


async def clear_photo(conn: AsyncConnection, user_id: UUID) -> str | None:
    """Removes the photo from the profile; returns its path, to delete."""
    row = await (
        await conn.execute(
            """
            update profiles p set avatar_path = null, avatar_updated_at = now()
            from (select avatar_path from profiles where id = %s for update) old
            where p.id = %s
            returning old.avatar_path as old_path
            """,
            (user_id, user_id),
        )
    ).fetchone()
    return row["old_path"] if row else None


async def own_path(conn: AsyncConnection, user_id: UUID) -> str | None:
    row = await (
        await conn.execute("select avatar_path from profiles where id = %s", (user_id,))
    ).fetchone()
    return row["avatar_path"] if row else None


# The photo a viewer may see of profile `p`, as a SQL expression: null unless shown (FR-PROF-05).
def shown_path_sql(viewer_param: str = "%(viewer)s") -> str:
    return f"""case when p.avatar_path is not null and p.avatar_visible and not p.avatar_hidden
               and not exists (select 1 from user_blocks b
                               where (b.blocker_id = {viewer_param} and b.blocked_id = p.id)
                                  or (b.blocker_id = p.id and b.blocked_id = {viewer_param}))
          then p.avatar_path end"""


async def can_see(conn: AsyncConnection, viewer: UUID, owner: UUID) -> bool:
    """Whether `viewer` is shown `owner`'s photo: it's visible to them, and they share an active
    course (either way). Used before a photo can be reported."""
    row = await (
        await conn.execute(
            f"""
            select ({shown_path_sql()}) is not null as shown,
              exists (
                select 1 from course_shares s
                join course_members m on m.share_id = s.id and m.status = 'active'
                where s.status = 'active'
                  and ((s.owner_id = %(owner)s and m.user_id = %(viewer)s)
                       or (s.owner_id = %(viewer)s and m.user_id = %(owner)s))
              ) as mates
            from profiles p where p.id = %(owner)s
            """,
            {"viewer": viewer, "owner": owner},
        )
    ).fetchone()
    return bool(row and row["shown"] and row["mates"])


async def hide_if_reported(conn: AsyncConnection, owner: UUID) -> bool:
    """3 different students reporting a photo hides it (back to initials) until an admin reviews it
    (FR-MOD-06)."""
    row = await (
        await conn.execute(
            "update profiles set avatar_hidden = true where id = %s and not avatar_hidden and ("
            "select count(distinct user_id) from reports where target_type = 'avatar' "
            "and target_id = %s and status = 'open') >= %s returning id",
            (owner, owner, REPORTS_TO_HIDE),
        )
    ).fetchone()
    return row is not None
