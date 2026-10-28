"""FR-SEC-01 regression: clients are read-only on the database (DATA_MODELS §5).

Runs against a real database, the way PostgREST runs client requests: as the `authenticated`
(or `anon`) role with the user's JWT claims set. Skipped unless DB_TESTS=1 and DATABASE_URL is
set (services/api/.env locally), because the unit suite has no database.
"""

import json
import os
import uuid

import psycopg
import pytest
from dotenv import dotenv_values
from psycopg import errors

from app.core.config import SERVICE_ROOT

URL = os.environ.get("DATABASE_URL") or dotenv_values(SERVICE_ROOT / ".env").get("DATABASE_URL")
pytestmark = pytest.mark.skipif(
    os.environ.get("DB_TESTS") != "1" or not URL, reason="needs DB_TESTS=1 and a database"
)


@pytest.fixture
def conn():
    with psycopg.connect(URL, autocommit=False) as c:
        yield c
        c.rollback()


@pytest.fixture(scope="module")
def tables() -> dict[str, str]:
    """Every public table with one column an UPDATE can name (not identity or generated)."""
    with psycopg.connect(URL) as c:
        rows = c.execute(
            """
            select distinct on (table_name) table_name, column_name
            from information_schema.columns
            where table_schema = 'public' and is_identity = 'NO' and is_generated = 'NEVER'
              and table_name in (select tablename from pg_tables where schemaname = 'public')
            order by table_name, ordinal_position
            """
        ).fetchall()
    return dict(rows)


def as_role(conn, role: str, user_id: uuid.UUID | None = None) -> None:
    conn.execute(f"set local role {role}")
    claims = {"sub": str(user_id), "role": role} if user_id else {"role": role}
    conn.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps(claims),))


@pytest.mark.parametrize("role", ["authenticated", "anon"])
@pytest.mark.parametrize("action", ["insert", "update", "delete", "truncate"])
def test_clients_cannot_write_any_table(conn, tables, role, action):
    user = uuid.uuid4()
    refused = []
    for table, col in tables.items():
        sql = {
            "insert": f"insert into public.{table} default values",
            "update": f"update public.{table} set {col} = {col} where false",
            "delete": f"delete from public.{table} where false",
            "truncate": f"truncate public.{table}",
        }[action]
        conn.execute("savepoint s")
        as_role(conn, role, user)
        try:
            conn.execute(sql)
        except errors.InsufficientPrivilege:
            refused.append(table)
        conn.execute("rollback to savepoint s")
    assert refused == list(tables), f"{action} allowed for {role} on some tables"


def test_no_policy_allows_writes(conn):
    rows = conn.execute(
        "select tablename, policyname, cmd from pg_policies "
        "where schemaname = 'public' and cmd <> 'SELECT'"
    ).fetchall()
    assert rows == []


def test_signed_in_users_can_still_read_their_rows_and_anon_only_schools(conn):
    as_role(conn, "authenticated", uuid.uuid4())
    assert conn.execute("select count(*) from documents").fetchone()[0] == 0  # none are theirs
    conn.execute("reset role")
    as_role(conn, "anon")
    assert conn.execute("select count(*) from institutions").fetchone()[0] > 0
    with pytest.raises(errors.InsufficientPrivilege):
        conn.execute("select count(*) from documents")


@pytest.mark.parametrize("role", ["authenticated", "anon"])
def test_students_cannot_read_the_admin_cost_view(conn, role):
    as_role(conn, role, uuid.uuid4())
    with pytest.raises(errors.InsufficientPrivilege):
        conn.execute("select * from llm_daily_costs")


# --- FR-SEC-03: a job that crashes the worker every time stops after max_attempts ----------------


def test_a_job_that_always_crashes_is_failed_after_max_attempts():
    import asyncio
    import selectors

    # psycopg's async mode needs a selector loop (Windows defaults to Proactor).
    asyncio.run(
        _always_crashes(),
        loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()),
    )


async def _always_crashes():
    from psycopg.rows import dict_row

    from app.worker import queue

    async with await psycopg.AsyncConnection.connect(URL, row_factory=dict_row) as conn:
        try:
            job = await (
                await conn.execute(
                    "insert into jobs (type, payload, max_attempts) "
                    "values ('delete_account', '{}', 3) returning id"
                )
            ).fetchone()
            claims = 0
            while (got := await queue.claim(conn, "test", ["delete_account"])) is not None:
                assert got["id"] == job["id"]
                claims += 1
                # The worker died mid-job: its lease runs out without succeed/fail.
                await conn.execute(
                    "update jobs set locked_at = now() - %s - interval '1 minute' where id = %s",
                    (queue.LEASE, job["id"]),
                )
                assert claims <= 3, "reclaimed past max_attempts"
            assert claims == 3
            swept = await queue.sweep_crashed(conn)
            assert [j["id"] for j in swept] == [job["id"]]
            row = await (
                await conn.execute("select status, error from jobs where id = %s", (job["id"],))
            ).fetchone()
            assert (row["status"], row["error"]) == ("failed", "crashed")
            assert await queue.claim(conn, "test", ["delete_account"]) is None
        finally:
            await conn.rollback()


# --- v0.2 engagement and sharing tables (0011, DATA_MODELS §2.9–2.12) ---------------------------


def _profile(conn, name: str | None) -> uuid.UUID:
    """Signs a student up the way Supabase Auth does: the auth.users trigger creates the profile,
    and 0011's triggers fill display_name, invite_code and notification settings."""
    uid = uuid.uuid4()
    conn.execute(
        "insert into auth.users (id, aud, role, email, raw_user_meta_data) "
        "values (%s, 'authenticated', 'authenticated', %s, %s)",
        (uid, f"{uid}@example.com", json.dumps({"full_name": name})),
    )
    return uid


def test_profiles_get_a_display_name_a_unique_invite_code_and_settings(conn):
    a, b = _profile(conn, "ada okafor nnamdi"), _profile(conn, "Ada Bello")
    assert conn.execute(
        "select count(*) from notification_settings where user_id = any(%s)", ([a, b],)
    ).fetchone() == (2,)
    rows = dict(
        conn.execute(
            "select id, (display_name, invite_code) from profiles where id = any(%s)", ([a, b],)
        ).fetchall()
    )
    assert rows[a][0] == "Ada N." and rows[b][0] == "Ada B."
    assert rows[a][1].startswith("ADA") and rows[a][1].upper() != rows[b][1].upper()


def test_new_courses_rotate_accents(conn):
    uid = _profile(conn, "Tolu Adebayo")
    for code in ("CSC 201", "CSC 202", "CSC 203", "CSC 204", "CSC 205"):
        conn.execute("insert into courses (user_id, code) values (%s, %s)", (uid, code))
    accents = [
        r[0]
        for r in conn.execute(
            "select accent::text from courses where user_id = %s order by created_at, code", (uid,)
        ).fetchall()
    ]
    assert accents == ["lagoon", "ankara", "palm", "lavender", "lagoon"]


def test_members_see_a_shared_course_and_only_their_own_notifications(conn):
    owner, member, stranger = (_profile(conn, n) for n in ("Ada Okafor", "Tolu A", "Bayo B"))
    course = conn.execute(
        "insert into courses (user_id, code) values (%s, 'CSC 225') returning id", (owner,)
    ).fetchone()[0]
    share = conn.execute(
        "insert into course_shares (course_id, owner_id, code) values (%s, %s, '7KQ2M9XD') "
        "returning id",
        (course, owner),
    ).fetchone()[0]
    conn.execute(
        "insert into course_members (share_id, user_id, source, status) values (%s, %s, 'link', "
        "'active'), (%s, %s, 'in_app', 'pending')",
        (share, member, share, stranger),
    )
    assert conn.execute(
        "select member_count from course_shares where id = %s", (share,)
    ).fetchone() == (1,)
    conn.execute(
        "insert into notifications (user_id, type, title) values (%s, 'course_shared', 'x'), "
        "(%s, 'course_shared', 'y')",
        (member, stranger),
    )

    conn.execute("savepoint s")
    as_role(conn, "authenticated", member)
    assert conn.execute("select is_course_member(%s)", (course,)).fetchone() == (True,)
    assert conn.execute("select count(*) from course_shares").fetchone() == (1,)
    assert conn.execute("select title from notifications").fetchall() == [("x",)]
    conn.execute("rollback to savepoint s")

    as_role(conn, "authenticated", stranger)  # pending isn't a member yet
    assert conn.execute("select is_course_member(%s)", (course,)).fetchone() == (False,)
    assert conn.execute("select count(*) from course_shares").fetchone() == (0,)


def test_nobody_but_the_server_reads_the_waitlist(conn):
    for role in ("authenticated", "anon"):
        conn.execute("savepoint s")
        as_role(conn, role, uuid.uuid4())
        with pytest.raises(errors.InsufficientPrivilege):
            conn.execute("select * from waitlist")
        conn.execute("rollback to savepoint s")


def test_a_course_member_can_still_delete_their_account(conn):
    """Supabase Auth deletes users as supabase_auth_admin; the cascade into course_members must
    not fail on the member-count trigger (FR-AUTH-05)."""
    owner, member = _profile(conn, "Ada Okafor"), _profile(conn, "Tolu Adebayo")
    course = conn.execute(
        "insert into courses (user_id, code) values (%s, 'CSC 225') returning id", (owner,)
    ).fetchone()[0]
    share = conn.execute(
        "insert into course_shares (course_id, owner_id, code) values (%s, %s, 'ABCD2345') "
        "returning id",
        (course, owner),
    ).fetchone()[0]
    conn.execute(
        "insert into course_members (share_id, user_id, source, status) "
        "values (%s, %s, 'link', 'active')",
        (share, member),
    )
    # Tests can't switch to supabase_auth_admin; what matters is that the trigger runs as its
    # owner, whoever deletes the row.
    definer = conn.execute(
        "select prosecdef from pg_proc where proname = 'course_members_count'"
    ).fetchone()
    assert definer == (True,)
    conn.execute("delete from auth.users where id = %s", (member,))
    assert conn.execute(
        "select member_count from course_shares where id = %s", (share,)
    ).fetchone() == (0,)


def test_the_invite_code_takes_the_name_given_at_onboarding(conn):
    """Students sign up by email code with no name, so their first code is a placeholder; the name
    from onboarding replaces it (FR-INV-01)."""
    uid = _profile(conn, None)
    first = conn.execute("select invite_code from profiles where id = %s", (uid,)).fetchone()[0]
    assert first.startswith("QZ")
    conn.execute("update profiles set full_name = 'Tolu Adebayo' where id = %s", (uid,))
    code = conn.execute("select invite_code from profiles where id = %s", (uid,)).fetchone()[0]
    assert code.startswith("TOLU")
