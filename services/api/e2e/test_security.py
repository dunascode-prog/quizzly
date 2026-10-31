"""Security probes with real accounts (FRD §2.16). No AI work, so they're cheap and quick; safe to
run against staging and production (the throwaway students are deleted afterwards)."""

import secrets
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest

from e2e.conftest import new_id, notes_pdf

pytestmark = pytest.mark.security

SETUP_FIRST = "Finish setting up your profile first."


# --- sign-up and onboarding (FR-SEC-24/25) --------------------------------------------------------


def test_nothing_that_costs_money_before_onboarding(make_student):
    s = make_student(onboard=False)
    assert s.get("/v1/me").status_code == 200  # can still set up
    for method, path, body in [
        ("POST", "/v1/documents", {"filename": "a.pdf", "size_bytes": 1000}),
        ("POST", "/v1/courses", {"code": "BIO101"}),
        ("POST", "/v1/shares/join", {"code": "ABCDEF"}),
        ("GET", "/v1/home", None),
    ]:
        r = s.api.request(method, path, headers=s.headers, json=body)
        assert r.status_code == 403, (path, r.status_code)
        assert r.json()["detail"] == SETUP_FIRST


def test_throwaway_email_domains_cannot_finish_onboarding(make_student):
    s = make_student(onboard=False, email=f"e2e{secrets.token_hex(4)}@mailinator.com")
    r = s.patch(
        "/v1/me",
        json={"full_name": "T", "institution_other": "U", "level": "100L", "accept_terms": True},
    )
    assert r.status_code in (400, 403, 409, 422)


def test_one_inbox_one_account(make_student):
    """A Gmail alias (dots, +tags, googlemail) of an inbox that already has an account."""
    local = f"e2equiz{secrets.token_hex(4)}"
    make_student(email=f"{local}@gmail.com")
    alias = make_student(onboard=False, email=f"{local[:3]}.{local[3:]}+free@googlemail.com")
    r = alias.patch(
        "/v1/me",
        json={"full_name": "T", "institution_other": "U", "level": "100L", "accept_terms": True},
    )
    assert r.status_code in (400, 403, 409, 422)
    upload = alias.post("/v1/documents", json={"filename": "a.pdf", "size_bytes": 1000})
    assert upload.status_code == 403


# --- the app can't write to Supabase or change its own plan (FR-SEC-01, §2.16) --------------------


def test_the_app_is_read_only_on_supabase(make_student, supabase):
    s = make_student()
    rest = f"{supabase.url}/rest/v1"
    headers = supabase.as_app(s.token) | {"Prefer": "return=representation"}
    writes = [
        ("POST", "courses", {"user_id": s.id, "code": "HACK101"}),
        ("PATCH", f"profiles?id=eq.{s.id}", {"plan": "premium"}),
        ("POST", "ai_spend", {"user_id": s.id, "month": "2026-01-01", "micro_usd": 0}),
        ("DELETE", f"usage_counters?user_id=eq.{s.id}", None),
        ("POST", "notifications", {"user_id": s.id, "type": "x", "title": "x"}),
    ]
    for method, path, body in writes:
        r = httpx.request(method, f"{rest}/{path}", headers=headers, json=body, timeout=30)
        changed = r.status_code in (200, 201) and r.json() not in ([], None)
        assert not changed, (method, path, r.status_code, r.text[:200])
    assert s.get("/v1/plans").json()["current"] == "free"


def test_students_cannot_read_each_others_rows_on_supabase(make_student, supabase):
    a, b = make_student(), make_student()
    a.post("/v1/courses", json={"code": "PRIV101", "title": "Private"})
    r = httpx.get(
        f"{supabase.url}/rest/v1/courses?select=id,user_id",
        headers=supabase.as_app(b.token),
        timeout=30,
    )
    rows = r.json() if r.status_code == 200 else []
    assert all(row["user_id"] != a.id for row in rows)
    r = httpx.get(
        f"{supabase.url}/rest/v1/profiles?select=id,email",
        headers=supabase.as_app(b.token),
        timeout=30,
    )
    rows = r.json() if r.status_code == 200 else []
    assert all(row.get("id") == b.id for row in rows)


def test_storage_is_not_listable_or_writable_by_the_app(make_student, supabase):
    s = make_student()
    headers = supabase.as_app(s.token)
    listed = httpx.post(
        f"{supabase.url}/storage/v1/object/list/documents",
        headers=headers,
        json={"prefix": "uploads", "limit": 100},
        timeout=30,
    )
    assert listed.status_code != 200 or listed.json() == []
    put = httpx.post(
        f"{supabase.url}/storage/v1/object/documents/uploads/{s.id}/{new_id()}/x.pdf",
        headers=headers | {"content-type": "application/pdf"},
        content=b"%PDF-1.4",
        timeout=30,
    )
    assert put.status_code not in (200, 201)


def test_mass_assignment_is_ignored(make_student):
    s = make_student()
    r = s.patch(
        "/v1/me",
        json={
            "plan": "premium",
            "plan_expires_at": "2099-01-01",
            "suspended_at": None,
            "email_normalized": "x@x.com",
            "id": new_id(),
        },
    )
    assert r.status_code == 200
    assert s.get("/v1/plans").json()["current"] == "free"
    # A user_id in the body can't file the course under someone else.
    course = s.post("/v1/courses", json={"code": "OWN101", "user_id": new_id()})
    assert course.status_code == 201
    assert course.json()["id"] in [c["id"] for c in s.get("/v1/courses").json()]


# --- one student can't reach another's things (FR-SEC-03) -----------------------------------------


def test_no_access_to_another_students_course_or_document(make_student):
    a, b = make_student(), make_student()
    course = a.post("/v1/courses", json={"code": "OWNR101"}).json()
    doc = a.post(
        "/v1/documents",
        json={"filename": "n.pdf", "size_bytes": 1000, "course_id": course["id"]},
    ).json()["document"]
    probes = [
        ("PATCH", f"/v1/courses/{course['id']}", {"title": "mine now"}),
        ("DELETE", f"/v1/courses/{course['id']}?documents=delete", None),
        ("GET", f"/v1/courses/{course['id']}/share", None),
        ("POST", f"/v1/courses/{course['id']}/share", {}),
        ("GET", f"/v1/courses/{course['id']}/members", None),
        ("GET", f"/v1/documents/{doc['id']}", None),
        ("PATCH", f"/v1/documents/{doc['id']}", {"title": "mine now"}),
        ("DELETE", f"/v1/documents/{doc['id']}", None),
        ("POST", f"/v1/documents/{doc['id']}/upload-url", None),
        ("POST", f"/v1/documents/{doc['id']}/uploaded", None),
        ("GET", f"/v1/documents/{doc['id']}/outline", None),
        ("GET", f"/v1/documents/{doc['id']}/pages/1", None),
        ("POST", f"/v1/documents/{doc['id']}/quizzes", {"count": 5}),
        ("GET", f"/v1/documents/{doc['id']}/chat", None),
    ]
    for method, path, body in probes:
        r = b.api.request(method, path, headers=b.headers, json=body)
        assert r.status_code in (403, 404), (method, path, r.status_code)
    # And it's all still A's.
    assert a.get(f"/v1/documents/{doc['id']}").status_code == 200
    assert a.get(f"/v1/courses/{course['id']}/members").status_code in (200, 404)


def test_random_ids_are_not_found(make_student):
    s = make_student()
    for path in (
        f"/v1/quizzes/{new_id()}",
        f"/v1/attempts/{new_id()}",
        f"/v1/shares/{new_id()}",
        f"/v1/achievements/{new_id()}",
    ):
        assert s.get(path).status_code == 404, path
    assert s.delete(f"/v1/chat/{new_id()}").status_code == 404


# --- uploads (FR-SEC-02, FR-DOC-02) ---------------------------------------------------------------


def test_only_pdf_and_pptx_are_accepted(make_student):
    s = make_student()
    for name in ("run.exe", "notes.html", "x.svg", "a.pdf.js"):
        r = s.post("/v1/documents", json={"filename": name, "size_bytes": 100})
        assert r.status_code == 422, name


def test_oversized_uploads_are_refused_up_front(make_student):
    s = make_student()
    r = s.post("/v1/documents", json={"filename": "big.pdf", "size_bytes": 10**10})
    assert r.status_code == 422


def test_uploaded_needs_the_real_file(make_student):
    s = make_student()
    doc = s.post("/v1/documents", json={"filename": "n.pdf", "size_bytes": 2000}).json()
    r = s.post(f"/v1/documents/{doc['document']['id']}/uploaded")
    assert r.status_code == 422  # nothing was uploaded


def test_a_file_that_is_not_really_a_pdf_is_rejected(make_student):
    s = make_student()
    fake = b"<html><script>alert(1)</script></html>" * 20
    doc = s.post("/v1/documents", json={"filename": "n.pdf", "size_bytes": len(fake)}).json()
    (url,) = doc["upload_urls"]
    httpx.put(url, content=fake, headers={"content-type": "application/pdf"}, timeout=60)
    r = s.post(f"/v1/documents/{doc['document']['id']}/uploaded")
    assert r.status_code == 422


def test_a_signed_upload_url_only_writes_its_own_file(make_student):
    s = make_student()
    doc = s.post("/v1/documents", json={"filename": "n.pdf", "size_bytes": len(notes_pdf())}).json()
    (url,) = doc["upload_urls"]
    assert f"/uploads/{s.id}/{doc['document']['id']}/" in url
    other = url.replace(f"/uploads/{s.id}/", f"/uploads/{new_id()}/")
    r = httpx.put(other, content=notes_pdf(), headers={"content-type": "application/pdf"})
    assert r.status_code not in (200, 201)


# --- input limits and padlocks (FR-SEC-10, FR-PLAN-04) --------------------------------------------


def test_input_limits(make_student):
    s = make_student()
    assert s.post("/v1/courses", json={"code": "X"}).status_code == 422
    assert s.post("/v1/courses", json={"code": "OK101", "title": "x" * 81}).status_code == 422
    chat = s.post(f"/v1/documents/{new_id()}/chat/messages", json={"text": "x" * 2001})
    assert chat.status_code == 422
    assert s.patch("/v1/me", json={"full_name": "x" * 121}).status_code == 422
    assert s.patch("/v1/me", json={"timezone": "Mars/Base"}).status_code == 422


def test_free_padlocks(make_student):
    s = make_student()
    for body in ({"count": 20}, {"count": 10, "mode": "exam", "time_limit_min": 30}):
        r = s.post(f"/v1/documents/{new_id()}/quizzes", json=body)
        assert r.status_code == 403, body


# --- abuse limits (FR-SEC-20) ---------------------------------------------------------------------


@pytest.mark.slow
def test_request_rate_limit(make_student):
    """120 a minute per student (fixed windows): 250 at once is over it even across a boundary."""
    s = make_student()
    with ThreadPoolExecutor(max_workers=16) as pool:
        codes = list(pool.map(lambda _: s.get("/v1/me").status_code, range(250)))
    assert 429 in codes, "no 429 after 250 requests in a minute"
    assert set(codes) <= {200, 429}
    r = s.get("/v1/me")
    if r.status_code == 429:
        assert r.headers.get("retry-after")


def test_share_codes_cannot_be_guessed_in_bulk(make_student):
    s = make_student()
    codes = []
    for _ in range(100):
        r = s.get(f"/v1/shares/code/{secrets.token_hex(3).upper()}")
        codes.append(r.status_code)
        assert r.status_code in (404, 410, 429), r.status_code
        if r.status_code == 429:
            break
    assert 429 in codes


# --- deleting an account (FR-ACC) -----------------------------------------------------------------


def test_deleting_an_account_removes_access(make_student, supabase):
    s = make_student()
    s.post("/v1/courses", json={"code": "GONE101"})
    assert s.delete("/v1/me").status_code == 204
    assert s.get("/v1/courses").status_code in (401, 403, 404)
    r = supabase.http.post(
        f"{supabase.url}/auth/v1/token?grant_type=password",
        headers={"apikey": supabase.anon},
        json={"email": s.email, "password": s.password},
    )
    assert r.status_code != 200
