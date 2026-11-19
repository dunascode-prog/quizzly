"""Admin API (E4, WEB.md §3 admin security): only admins with 2FA get in, and views are logged."""

import json
import re
import uuid

import pytest

from app.core import admin as admin_core
from app.domain import admin as stats
from app.domain import moderation
from tests.conftest import JWT_SECRET
from tests.test_api import make_token

ADMIN = uuid.uuid4()


def bearer(**claims) -> dict:
    return {"Authorization": f"Bearer {make_token(JWT_SECRET, **claims)}"}


def admin_headers(**extra) -> dict:
    return bearer(sub=str(ADMIN), app_metadata={"role": "admin"}, aal="aal2", **extra)


def admin_routes(client) -> list[tuple[str, str]]:
    """Every (method, path) under /admin, with sample values for path parameters."""
    spec = client.get("/openapi.json").json()
    routes = []
    for path, ops in spec["paths"].items():
        if not path.startswith("/admin"):
            continue
        concrete = path.replace("{target_type}", "question")
        concrete = re.sub(r"\{[a-z_]+\}", str(uuid.uuid4()), concrete)
        routes += [(method.upper(), concrete) for method in ops]
    return routes


def admin_pages(client) -> list[str]:
    """The GET routes with no path parameters: the admin app's pages."""
    spec = client.get("/openapi.json").json()
    return [
        p
        for p, ops in spec["paths"].items()
        if p.startswith("/admin") and "get" in ops and "{" not in p
    ]


HEALTH = {"waiting": 3, "running": 1, "failed_24h": 0, "worker_beat_s": 12, "breakers": []}


@pytest.fixture
def fake_stats(client, monkeypatch):
    from app.core.db import get_conn
    from tests.test_credits_plans import Conn

    # Actions run in a transaction; the fake domain functions never touch the connection.
    client.app.dependency_overrides[get_conn] = lambda: Conn({})
    seen: dict = {}

    async def overview(conn, tz, rng, budget):
        seen["overview"] = rng
        return {
            "active": 74,
            "active_month": 186,
            "signups": 41,
            "invited": 19,
            "documents": 23,
            "duplicates": 7,
            "open_reports": 14,
            "auto_hidden": 3,
            "cost_today": 0.42,
            "daily_budget_usd": budget,
            "providers": [],
            "attention": [],
            "health": HEALTH,
        }

    async def costs(conn, tz, rng):
        return {
            "calls": 0,
            "free_calls": 0,
            "list_usd": 0,
            "paid_usd": 0,
            "active": 0,
            "daily": [],
            "providers": [],
            "tasks": [],
            "top_students": [],
            "health": HEALTH,
        }

    async def system(conn):
        return {
            "health": HEALTH,
            "jobs": [],
            "upload_to_ready": {"p50_s": None, "p95_s": None},
            "failures": [],
        }

    async def summary(conn, tz):
        return {
            "active_month": 0,
            "active_today": 0,
            "new_week": 0,
            "invited_week": 0,
            "goal_met_share": None,
            "week4_retention": None,
            "schools": [],
            "sources": [],
        }

    async def students(conn, tz, search, school, limit, offset):
        seen["students"] = (search, school, limit, offset)
        return []

    for name, fn in [
        ("overview", overview),
        ("costs", costs),
        ("system", system),
        ("students_summary", summary),
        ("students", students),
    ]:
        monkeypatch.setattr(stats, name, fn)

    logged: list = []

    async def audit(conn, admin, action, target=None, detail=None):
        logged.append((admin.id, action, target, detail))

    monkeypatch.setattr("app.api.admin.audit", audit)
    seen["audit"] = logged

    async def queue_list(conn, status, target_type, limit):
        seen["queue"] = (status, target_type, limit)
        return []

    async def detail(conn, target_type, target_id):
        return seen.get("detail")

    async def closing(conn, target_type, target_id):
        return 3

    async def fix_answer(conn, question_id, answer, explanation):
        if answer == "boom":
            raise moderation.BadAnswer("Pick the correct option by its number.")
        return {"remarked": 12, "rescored": 4, "thanked": 3}

    async def take_down_file(conn, sha, notify):
        seen["file"] = (sha, notify)
        return 2

    async def take_down_course(conn, code):
        return None if code == "GONE1234" else 9

    async def log_takedown(conn, row):
        seen["logged"] = row
        return uuid.uuid4()

    async def none_list(conn, *args):
        return []

    async def reverse(conn, takedown_id, admin_id):
        return None if seen.get("not_reversible") else {"target_type": "file", "target": "ab" * 32}

    for name, fn in [
        ("queue_list", queue_list),
        ("detail", detail),
        ("dismiss", closing),
        ("keep_hidden", closing),
        ("fix_answer", fix_answer),
        ("take_down_file", take_down_file),
        ("take_down_course", take_down_course),
        ("log_takedown", log_takedown),
        ("takedowns", none_list),
        ("courses_near_unshare", none_list),
        ("reverse", reverse),
    ]:
        monkeypatch.setattr(moderation, name, fn)
    return seen


def test_every_admin_route_needs_a_token(client, fake_stats):
    for method, path in admin_routes(client):
        assert client.request(method, path, json={}).status_code == 401, (method, path)


def test_students_are_refused_everywhere(client, fake_stats):
    for method, path in admin_routes(client):
        r = client.request(method, path, json={}, headers=bearer())
        assert r.status_code == 403 and r.json()["detail"] == admin_core.NOT_ADMIN, (method, path)


def test_admins_without_2fa_are_refused_everywhere(client, fake_stats):
    no_2fa = bearer(app_metadata={"role": "admin"}, aal="aal1")
    for method, path in admin_routes(client):
        r = client.request(method, path, json={}, headers=no_2fa)
        assert r.status_code == 403, (method, path)


def test_admin_in_user_metadata_doesnt_count(client, fake_stats):
    """user_metadata is editable by the user themselves; only app_metadata is trusted."""
    r = client.get("/admin/overview", headers=bearer(user_metadata={"role": "admin"}, aal="aal2"))
    assert r.status_code == 403


def test_admins_need_their_second_factor(client, fake_stats):
    no_2fa = bearer(app_metadata={"role": "admin"}, aal="aal1")
    r = client.get("/admin/overview", headers=no_2fa)
    assert r.status_code == 403 and r.json()["detail"] == admin_core.NEEDS_2FA


def test_a_forged_admin_token_is_refused(client, fake_stats):
    forged = make_token(
        "not-the-secret-not-the-secret-not-the", app_metadata={"role": "admin"}, aal="aal2"
    )
    assert (
        client.get("/admin/overview", headers={"Authorization": f"Bearer {forged}"}).status_code
        == 401
    )


def test_admins_with_2fa_get_every_page(client, fake_stats):
    for path in admin_pages(client):
        assert client.get(path, headers=admin_headers()).status_code == 200, path
    assert client.get("/admin/overview?range=7d", headers=admin_headers()).json()["active"] == 74
    assert fake_stats["overview"] == "7d"
    assert client.get("/admin/overview?range=year", headers=admin_headers()).status_code == 422


def test_viewing_students_is_logged(client, fake_stats):
    r = client.get("/admin/students?search=Ada&school=UNILAG", headers=admin_headers())
    assert r.status_code == 200
    assert fake_stats["students"] == ("Ada", "UNILAG", 50, 0)
    assert fake_stats["audit"] == [(ADMIN, "students.list", "Ada", {"school": "UNILAG", "rows": 0})]


def test_the_student_table_has_no_emails(client, fake_stats):
    spec = client.get("/openapi.json").json()["components"]["schemas"]["StudentRow"]
    assert "email" not in json.dumps(spec)


async def test_audit_writes_the_admin_action_and_detail():
    from tests.test_credits_plans import Conn

    conn = Conn({})
    who = admin_core.AdminUser(id=ADMIN, email=None)
    await admin_core.audit(conn, who, "reports.dismiss", "r1", {"why": "fine"})
    params = conn.ran("insert into admin_audit_log")[0]
    assert params[:3] == (ADMIN, "reports.dismiss", "r1") and json.loads(params[3]) == {
        "why": "fine"
    }


# --- reports (30c) --------------------------------------------------------------------------------


def actions(fake_stats) -> list[str]:
    return [a[1] for a in fake_stats["audit"]]


def test_the_report_queue_filters(client, fake_stats):
    r = client.get("/admin/reports?status=dismissed&type=course&limit=5", headers=admin_headers())
    assert r.status_code == 200 and fake_stats["queue"] == ("dismissed", "course", 5)
    assert client.get("/admin/reports?type=avatar", headers=admin_headers()).status_code == 422


def test_opening_a_report_is_logged_and_unknown_ones_are_404(client, fake_stats):
    qid = uuid.uuid4()
    assert client.get(f"/admin/reports/question/{qid}", headers=admin_headers()).status_code == 404
    item = {"stem": "2+2?"}
    fake_stats["detail"] = {"type": "question", "target_id": qid, "item": item, "reporters": []}
    r = client.get(f"/admin/reports/question/{qid}", headers=admin_headers())
    assert r.status_code == 200 and r.json()["item"] == item
    assert fake_stats["audit"][-1][1:3] == ("reports.view", f"question:{qid}")


def test_dismiss_and_keep_hidden_are_logged(client, fake_stats):
    qid = uuid.uuid4()
    for action, logged in (("dismiss", "reports.dismiss"), ("keep-hidden", "reports.keep_hidden")):
        r = client.post(f"/admin/reports/question/{qid}/{action}", headers=admin_headers())
        assert r.status_code == 200 and r.json() == {"closed": 3}
        assert fake_stats["audit"][-1][1:4] == (logged, f"question:{qid}", {"closed": 3})


def test_fixing_an_answer_reports_what_changed_and_is_logged(client, fake_stats):
    url = f"/admin/reports/question/{uuid.uuid4()}/fix-answer"
    r = client.post(url, json={"answer": 2}, headers=admin_headers())
    assert r.json() == {"remarked": 12, "rescored": 4, "thanked": 3}
    assert fake_stats["audit"][-1][1] == "reports.fix_answer"
    assert fake_stats["audit"][-1][3]["answer"] == 2
    bad = client.post(url, json={"answer": "boom"}, headers=admin_headers())
    assert bad.status_code == 422 and "option" in bad.json()["detail"]


# --- takedowns (30d) ------------------------------------------------------------------------------


def test_a_file_takedown_needs_a_real_sha256(client, fake_stats):
    body = {"target_type": "file", "target": "not-a-hash", "reason": "copyright"}
    assert client.post("/admin/takedowns", json=body, headers=admin_headers()).status_code == 422
    assert "file" not in fake_stats and "takedowns.create" not in actions(fake_stats)


def test_a_file_takedown_is_logged_with_who_asked(client, fake_stats):
    sha = "AB" * 32
    body = {
        "target_type": "file",
        "target": sha,
        "reason": "copyright",
        "requested_by": "Dr Ade, CSC dept",
        "notify": False,
    }
    r = client.post("/admin/takedowns", json=body, headers=admin_headers())
    assert r.status_code == 201 and r.json()["students_affected"] == 2
    assert fake_stats["file"] == (sha.lower(), False)
    row = fake_stats["logged"]
    assert row["target"] == sha.lower() and row["requested_by"] == "Dr Ade, CSC dept"
    assert row["admin_id"] == ADMIN and "notify" not in row
    assert fake_stats["audit"][-1][1:3] == ("takedowns.create", f"file:{sha.lower()}")


def test_a_course_takedown_needs_an_active_share(client, fake_stats):
    body = {"target_type": "course", "target": "GONE1234", "reason": "copyright"}
    assert client.post("/admin/takedowns", json=body, headers=admin_headers()).status_code == 404
    body["target"] = "ABCD2345"
    r = client.post("/admin/takedowns", json=body, headers=admin_headers())
    assert r.status_code == 201 and r.json()["students_affected"] == 9


def test_only_file_takedowns_can_be_reversed_and_it_is_logged(client, fake_stats):
    url = f"/admin/takedowns/{uuid.uuid4()}/reverse"
    assert client.post(url, headers=admin_headers()).status_code == 204
    assert fake_stats["audit"][-1][1] == "takedowns.reverse"
    fake_stats["not_reversible"] = True
    assert client.post(url, headers=admin_headers()).status_code == 409


# --- the moderation domain ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("qtype", "options", "answer", "ok"),
    [
        ("mcq", ["a", "b", "c"], 2, True),
        ("mcq", ["a", "b", "c"], 3, False),
        ("mcq", ["a", "b"], True, False),  # a bool is not an option number
        ("true_false", None, False, True),
        ("true_false", None, 0, False),
        ("fill_blank", None, " stack ", True),
        ("fill_blank", None, "  ", False),
        ("theory", None, "anything", False),  # written answers are marked by the LLM
    ],
)
def test_check_answer(qtype, options, answer, ok):
    if ok:
        moderation.check_answer(qtype, options, answer)
    else:
        with pytest.raises(moderation.BadAnswer):
            moderation.check_answer(qtype, options, answer)


async def test_fixing_an_answer_remarks_past_answers_and_thanks_reporters(monkeypatch):
    from tests.test_credits_plans import Conn

    a1, a2, reporter = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    question = {"id": "q", "type": "mcq", "options": ["a", "b", "c"], "answer": 0, "marks": 2}
    conn = Conn(
        {
            "select id, type::text": question,
            "select id, attempt_id, response": [
                {"id": a1, "attempt_id": "t1", "response": 2},
                {"id": a2, "attempt_id": "t1", "response": 0},
            ],
            "select a.id, a.user_id": None,  # the attempt is not finished: nothing to rescore
            "update reports": [{"user_id": reporter}, {"user_id": reporter}],
        }
    )
    thanked: list = []

    async def notify(conn, user_id, type_, *args, **kwargs):
        thanked.append((user_id, type_))

    monkeypatch.setattr(moderation.notifications, "notify", notify)
    result = await moderation.fix_answer(conn, uuid.uuid4(), 2, None)
    assert result == {"remarked": 2, "rescored": 0, "thanked": 1}
    marks = conn.ran("update attempt_answers")
    assert marks == [(True, 2, a1), (False, 0, a2)]  # the old right answer is now wrong
    assert json.loads(conn.ran("update questions")[0][0]) == 2
    assert thanked == [(reporter, "report_resolved")]  # once per reporter


async def test_a_file_takedown_removes_everything_made_from_it(monkeypatch):
    from tests.test_credits_plans import Conn

    student = uuid.uuid4()
    sf = {"id": "sf", "storage_path": "uploads/a/b/f.pdf", "sha256": "ab" * 32}
    docs = [
        {"id": uuid.uuid4(), "user_id": student, "title": "CSC 225", "upload_path": "u/1"},
        {"id": uuid.uuid4(), "user_id": student, "title": "CSC 225", "upload_path": "u/2"},
    ]
    conn = Conn({"insert into source_files": sf, "update documents": docs})
    queued: list = []

    async def enqueue(conn, job_type, payload, **kwargs):
        queued.append((job_type, payload))

    async def notify(*args, **kwargs):
        queued.append(("notify",))

    monkeypatch.setattr(moderation.queue, "enqueue", enqueue)
    monkeypatch.setattr(moderation.notifications, "notify", notify)
    affected = await moderation.take_down_file(conn, "ab" * 32, notify=False)
    assert affected == 1  # one student, two copies
    statements = [s for s, _ in conn.sql]
    assert any("blocked = true" in s for s in statements)
    quizzes_at = next(i for i, s in enumerate(statements) if s.startswith("delete from quizzes"))
    sets_at = statements.index("delete from question_sets where source_file_id = %s")
    assert quizzes_at < sets_at  # quizzes hold their question set (on delete restrict)
    for table in ("pages", "topics", "chunks", "explanations"):
        assert f"delete from {table} where source_file_id = %s" in statements
    job, payload = queued[0]
    assert job == "cleanup_storage"
    assert {"uploads/a/b/f.pdf", "u/1", "u/2"} <= set(payload["paths"])
    assert ("notify",) not in queued  # notify=False
