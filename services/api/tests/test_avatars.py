"""Profile photos (FR-PROF-04/05/06, FR-MOD-06; docs/PROFILE_V2.md §5)."""

import io
import uuid

import pytest
from PIL import Image

from app.api import deps
from app.api.photos import with_photo_urls
from app.domain import accounts, avatars, usage
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

USER = uuid.uuid4()


def auth() -> dict:
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, sub=str(USER))}"}


def webp(w=512, h=512, exif: bool = False) -> bytes:
    out = io.BytesIO()
    img = Image.new("RGB", (w, h), (120, 80, 60))
    kwargs = {}
    if exif:
        data = img.getexif()
        data[0x8825] = {2: (6, 27, 0)}  # a GPS block
        data[0x010F] = "PhoneMaker"
        kwargs["exif"] = data
    img.save(out, format="WEBP", quality=80, **kwargs)
    return out.getvalue()


# --- checking and cleaning the upload ----------------------------------------------------------


def test_a_good_photo_is_re_encoded_without_metadata():
    raw = webp(exif=True)
    assert b"EXIF" in raw or b"Exif" in raw
    clean = avatars.process(raw)
    with Image.open(io.BytesIO(clean)) as img:
        assert img.format == "WEBP" and img.size == (512, 512)
        assert not img.getexif()
    assert b"EXIF" not in clean and b"PhoneMaker" not in clean


def test_a_non_square_photo_is_centre_cropped():
    with Image.open(io.BytesIO(avatars.process(webp(800, 600)))) as img:
        assert img.size == (512, 512)


@pytest.mark.parametrize(
    "data, why",
    [
        (b"\x89PNG\r\n\x1a\n" + b"0" * 100, "WebP"),
        (webp(1500, 1500), "wrong size"),
        (webp(32, 32), "wrong size"),
        (b"RIFF\x00\x00\x00\x00WEBPgarbage", "couldn't read"),
        (b"0" * (avatars.MAX_BYTES + 1), "too big"),
    ],
    ids=["png", "too-wide", "too-small", "corrupt", "too-big"],
)
def test_bad_photos_are_refused(data, why):
    with pytest.raises(avatars.BadPhoto, match=why):
        avatars.process(data)


def test_paths_are_named_by_the_server():
    a, b = avatars.new_path(USER), avatars.new_path(USER)
    assert a.startswith(f"{USER}/") and a.endswith(".webp") and a != b


# --- the endpoints -------------------------------------------------------------------------------


@pytest.fixture
def photos(client, monkeypatch):
    state = {"uploaded": {}, "removed": [], "path": "old/photo.webp"}

    class Photos:
        async def upload(self, path, data, content_type):
            state["uploaded"][path] = (data, content_type)

        async def remove(self, paths):
            state["removed"].extend(paths)

        async def signed_url(self, path, expires_in=300):
            return f"https://signed/{path}"

    async def set_photo(conn, user_id, path):
        assert user_id == USER
        old, state["path"] = state["path"], path
        return old

    async def clear_photo(conn, user_id):
        old, state["path"] = state["path"], None
        return old

    async def get_profile(conn, user_id):
        return {
            "full_name": "Tolu Adebayo",
            "institution_id": None,
            "institution_other": "Somewhere",
            "department": None,
            "level": "200L",
            "explanation_style": "standard",
            "terms_accepted_at": None,
            "institution_name": None,
            "institution_short_name": None,
            "avatar_path": state["path"],
            "avatar_visible": False,
            "practice_times": [],
            "weekly_goal_days": 4,
        }

    async def take(conn, user_id, resource, limit, tz):
        state["taken"] = state.get("taken", 0) + 1
        return None if state.get("limit_hit") else state["taken"]

    monkeypatch.setattr(usage, "take", take)
    monkeypatch.setattr(avatars, "set_photo", set_photo)
    monkeypatch.setattr(avatars, "clear_photo", clear_photo)
    monkeypatch.setattr(accounts, "get_profile", get_profile)
    client.app.dependency_overrides[deps.get_avatar_storage] = lambda: Photos()
    return state


def test_upload_stores_a_clean_copy_under_a_server_path_and_deletes_the_old(client, photos):
    r = client.put(
        "/v1/me/avatar",
        headers=auth() | {"content-type": "image/webp", "x-path": "../../evil.webp"},
        content=webp(exif=True),
    )
    assert r.status_code == 200
    (path,) = photos["uploaded"]
    assert path.startswith(f"{USER}/") and "evil" not in path
    data, kind = photos["uploaded"][path]
    assert kind == "image/webp" and b"PhoneMaker" not in data
    assert photos["removed"] == ["old/photo.webp"]
    assert r.json()["avatar_url"] == f"https://signed/{path}"


def test_upload_refuses_other_types_and_big_files(client, photos):
    png = client.put("/v1/me/avatar", headers=auth() | {"content-type": "image/png"}, content=b"x")
    assert png.status_code == 422 and png.json()["detail"] == "Send the photo as a WebP image."
    big = client.put(
        "/v1/me/avatar",
        headers=auth() | {"content-type": "image/webp"},
        content=b"0" * (avatars.MAX_BYTES + 10),
    )
    assert big.status_code == 413
    assert photos["uploaded"] == {}
    assert client.put("/v1/me/avatar", content=webp()).status_code == 401


def test_photo_changes_are_capped_per_day(client, photos):
    """FR-SEC-22: each change costs image work and storage writes, so there's a daily cap."""
    photos["limit_hit"] = True
    r = client.put("/v1/me/avatar", headers=auth() | {"content-type": "image/webp"}, content=webp())
    assert r.status_code == 429
    assert (
        r.json()["detail"]
        == "You've changed your photo 10 times today. You can change it again tomorrow."
    )
    assert photos["uploaded"] == {} and photos["removed"] == []


def test_removing_the_photo_deletes_the_file(client, photos):
    r = client.delete("/v1/me/avatar", headers=auth())
    assert r.status_code == 200 and r.json()["avatar_url"] is None
    assert photos["removed"] == ["old/photo.webp"]


# --- other students' photos in lists --------------------------------------------------------------


async def test_lists_get_signed_urls_and_never_the_storage_path():
    class Photos:
        async def signed_urls(self, paths, expires_in=300):
            assert expires_in == avatars.SIGNED_SECONDS
            return {p: f"https://signed/{p}" for p in paths}

    rows = [
        {"display_name": "Ada O.", "avatar_path": "a/1.webp"},
        {"display_name": "Bola K.", "avatar_path": None},  # hidden, not opted in, or blocked
    ]
    out = await with_photo_urls(Photos(), rows, "avatar_path", "avatar_url")
    assert out == [
        {"display_name": "Ada O.", "avatar_url": "https://signed/a/1.webp"},
        {"display_name": "Bola K.", "avatar_url": None},
    ]


def test_only_a_photo_shown_to_you_can_be_reported(client, monkeypatch):
    async def can_see(conn, viewer, owner):
        return False

    monkeypatch.setattr(avatars, "can_see", can_see)
    r = client.post(
        "/v1/reports",
        headers=auth(),
        json={"target_type": "avatar", "target_id": str(uuid.uuid4()), "reason": "inappropriate"},
    )
    assert r.status_code == 404


def test_the_photo_rule_hides_hidden_unshared_and_blocked_photos():
    sql = avatars.shown_path_sql()
    for clause in ("p.avatar_visible", "not p.avatar_hidden", "user_blocks"):
        assert clause in sql


# --- practice times set the reminder (FR-PROF-06) ------------------------------------------------


@pytest.mark.parametrize(
    "times, expected",
    [
        (["evening", "commute"], "06:45"),  # the earliest chosen wins
        (["lectures"], "11:50"),
        (["night"], "21:45"),
        ([], "19:30"),
    ],
)
def test_practice_times_pick_the_reminder(times, expected):
    assert accounts.reminder_for(times, "23:00:00", "06:00:00") == expected


def test_a_reminder_inside_quiet_hours_moves_to_their_end():
    assert accounts.reminder_for(["night"], "21:00:00", "07:00:00") == "07:00"
    # The default quiet hours (11 pm-7 am) cover the 6:45 commute reminder: it moves to 7:00.
    assert accounts.reminder_for(["commute"], "23:00:00", "07:00:00") == "07:00"
