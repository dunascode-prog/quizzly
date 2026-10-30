"""Country-ready (FR-PROF-08): country and time zone on the profile, years as levels, schools per
country, and daily limits at the student's own midnight without a time-zone loophole."""

import uuid

import pytest
from pydantic import ValidationError

from app.api.routes import MeOut, ProfileUpdate
from app.domain import accounts, settings, usage


def test_profiles_take_a_country_code_and_a_real_time_zone():
    p = ProfileUpdate(country="GH", timezone="Africa/Accra", level="Y2")
    assert (p.country, p.timezone, p.level) == ("GH", "Africa/Accra", "Y2")
    for bad in ({"country": "Ghana"}, {"country": "gh"}, {"timezone": "Mars/Base"}):
        with pytest.raises(ValidationError):
            ProfileUpdate(**bad)


def test_years_and_postgraduate_are_levels_alongside_nigerian_ones():
    for level in ("100L", "Y1", "Y6", "PG", "other"):
        assert ProfileUpdate(level=level).level == level
    with pytest.raises(ValidationError):
        ProfileUpdate(level="Y7")


def test_me_defaults_to_nigeria():
    me = MeOut(id=uuid.uuid4(), email=None)
    assert (me.country, me.timezone) == ("NG", "Africa/Lagos")


def test_country_is_editable_but_time_zone_goes_through_the_weekly_rule():
    assert "country" in accounts.EDITABLE
    assert "timezone" not in accounts.EDITABLE and "timezone" not in settings.SETTINGS_COLUMNS


class Recorder:
    def __init__(self):
        self.calls = []

    async def execute(self, sql, params=None):
        self.calls.append((sql, params))

        class Cursor:
            async def fetchone(self):
                return None

            async def fetchall(self):
                return []

        return Cursor()


async def test_a_time_zone_changes_at_most_once_a_week():
    conn = Recorder()
    await settings.set_timezone(conn, uuid.uuid4(), "Africa/Accra")
    sql, params = conn.calls[0]
    assert "interval '7 days'" in sql and "timezone_changed_at" in sql
    assert "is distinct from" in sql  # sending the same zone again doesn't use up the change
    assert params["tz"] == "Africa/Accra"


async def test_profile_and_settings_updates_both_use_the_weekly_rule(monkeypatch):
    seen = []

    async def set_timezone(conn, user_id, tz):
        seen.append(tz)

    async def get_profile(conn, user_id):
        return {}

    async def get_settings(conn, user_id):
        return {}

    monkeypatch.setattr(settings, "set_timezone", set_timezone)
    monkeypatch.setattr(accounts, "get_profile", get_profile)
    monkeypatch.setattr(settings, "get_settings", get_settings)
    user = uuid.uuid4()
    await accounts.update_profile(Recorder(), user, {"timezone": "Europe/London"}, None)
    await settings.update_settings(Recorder(), user, {"timezone": "Africa/Nairobi"})
    assert seen == ["Europe/London", "Africa/Nairobi"]


async def test_daily_limits_roll_over_at_the_students_own_midnight():
    conn = Recorder()
    await usage.take(conn, uuid.uuid4(), "upload", 5, "Africa/Lagos")
    sql, params = conn.calls[0]
    assert "select timezone from profiles where id = %(user)s" in sql
    assert params["tz"] == "Africa/Lagos"  # the fallback


async def test_school_search_stays_within_the_country():
    conn = Recorder()
    await accounts.search_institutions(conn, "legon", 10, "GH")
    sql, params = conn.calls[0]
    assert "country = %(country)s" in sql and params["country"] == "GH"
    await accounts.search_institutions(conn, "", 10, "KE")
    assert "where country = %s" in conn.calls[1][0] and conn.calls[1][1] == ("KE", 10)
