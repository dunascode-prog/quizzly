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
