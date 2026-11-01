"""End-to-end tests against a running Quizzly API (local, staging or production).

They are skipped unless E2E_API_URL is set, so `uv run pytest` (the unit tests) never needs a
server. CI runs them after a deploy; locally:

    E2E_API_URL=http://127.0.0.1:8000 uv run pytest e2e -m "smoke or security"
    E2E_API_URL=http://127.0.0.1:8000 uv run pytest e2e            # + the journey (needs a worker)

Settings (environment variables; locally they fall back to services/api/.env and
apps/mobile/.env.local):

    E2E_API_URL                 the API, e.g. https://api.example.com
    E2E_SUPABASE_URL            the same project the API uses
    E2E_SUPABASE_SERVICE_KEY    makes and deletes the throwaway test students (admin API)
    E2E_SUPABASE_ANON_KEY       signs them in, like the app does
    E2E_ENV                     "production" turns on the production-only checks
    E2E_DATABASE_URL            optional; only for the checks that change a plan directly

Every student made here is called e2e-<random>@example.com and is deleted afterwards, even when a
test fails. No emails are sent: the admin API makes the accounts already confirmed.
"""

from __future__ import annotations

import os
import secrets
import time
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[1]  # services/api


def _dotenv(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def _settings() -> dict[str, str | None]:
    api_env = _dotenv(ROOT / ".env")
    app_env = _dotenv(ROOT.parents[1] / "apps" / "mobile" / ".env.local")
    return {
        "api": os.environ.get("E2E_API_URL", "").rstrip("/") or None,
        "supabase": (os.environ.get("E2E_SUPABASE_URL") or api_env.get("SUPABASE_URL", "")).rstrip(
            "/"
        )
        or None,
        "service": os.environ.get("E2E_SUPABASE_SERVICE_KEY")
        or api_env.get("SUPABASE_SERVICE_ROLE_KEY"),
        "anon": os.environ.get("E2E_SUPABASE_ANON_KEY")
        or app_env.get("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
        "env": os.environ.get("E2E_ENV", "staging"),
        "database": os.environ.get("E2E_DATABASE_URL"),
    }


CONFIG = _settings()


def pytest_collection_modifyitems(config, items):
    if not CONFIG["api"]:
        skip = pytest.mark.skip(reason="E2E_API_URL is not set")
        for item in items:
            item.add_marker(skip)
        return
    if not (CONFIG["supabase"] and CONFIG["service"] and CONFIG["anon"]):
        skip = pytest.mark.skip(reason="Supabase URL, service key or anon key missing")
        for item in items:
            if "smoke" not in item.keywords:
                item.add_marker(skip)


@pytest.fixture(scope="session")
def api() -> Iterator[httpx.Client]:
    with httpx.Client(base_url=CONFIG["api"], timeout=60) as client:
        yield client


@dataclass
class Student:
    id: str
    email: str
    password: str
    token: str
    api: httpx.Client
    deleted: bool = field(default=False)

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def get(self, path: str, **kw) -> httpx.Response:
        return self.api.get(path, headers=self.headers, **kw)

    def post(self, path: str, **kw) -> httpx.Response:
        return self.api.post(path, headers=self.headers, **kw)

    def put(self, path: str, **kw) -> httpx.Response:
        return self.api.put(path, headers=self.headers | kw.pop("extra_headers", {}), **kw)

    def patch(self, path: str, **kw) -> httpx.Response:
        return self.api.patch(path, headers=self.headers, **kw)

    def delete(self, path: str, **kw) -> httpx.Response:
        return self.api.delete(path, headers=self.headers, **kw)

    def onboard(self, name: str = "Ada Test") -> None:
        r = self.patch(
            "/v1/me",
            json={
                "full_name": name,
                "institution_other": "E2E University",
                "level": "200L",
                "accept_terms": True,
                "country": "NG",
                "timezone": "Africa/Lagos",
            },
        )
        assert r.status_code == 200, r.text


class Supabase:
    """The parts of Supabase the tests need: admin (make/delete students) and the app's view."""

    def __init__(self) -> None:
        self.url = CONFIG["supabase"]
        self.http = httpx.Client(timeout=60)
        self.admin = {"apikey": CONFIG["service"], "Authorization": f"Bearer {CONFIG['service']}"}
        self.anon = CONFIG["anon"]

    def create(self, email: str, password: str) -> str:
        r = self.http.post(
            f"{self.url}/auth/v1/admin/users",
            headers=self.admin,
            json={"email": email, "password": password, "email_confirm": True},
        )
        assert r.status_code in (200, 201), r.text
        return r.json()["id"]

    def sign_in(self, email: str, password: str) -> str:
        r = self.http.post(
            f"{self.url}/auth/v1/token?grant_type=password",
            headers={"apikey": self.anon},
            json={"email": email, "password": password},
        )
        assert r.status_code == 200, r.text
        return r.json()["access_token"]

    def remove(self, user_id: str) -> None:
        self.http.delete(f"{self.url}/auth/v1/admin/users/{user_id}", headers=self.admin)

    def as_app(self, token: str) -> dict[str, str]:
        """Headers the app itself would send to Supabase (anon key + the student's session)."""
        return {"apikey": self.anon, "Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def supabase() -> Iterator[Supabase]:
    s = Supabase()
    yield s
    s.http.close()


@pytest.fixture(scope="session")
def make_student(api, supabase) -> Iterator[Callable[..., Student]]:
    """Makes throwaway students; every one is deleted at the end of the run."""
    made: list[Student] = []

    def make(onboard: bool = True, email: str | None = None, name: str = "Ada Test") -> Student:
        email = email or f"e2e-{secrets.token_hex(5)}@example.com"
        password = secrets.token_urlsafe(16)
        uid = supabase.create(email, password)
        student = Student(uid, email, password, supabase.sign_in(email, password), api)
        made.append(student)
        if onboard:
            student.onboard(name)
        return student

    yield make
    for s in made:
        supabase.remove(s.id)


def wait_for(fetch: Callable[[], dict], done: Callable[[dict], bool], timeout: float, what: str):
    """Polls `fetch` until `done` (or a failed status), like the app does."""
    deadline = time.monotonic() + timeout
    last: dict = {}
    while time.monotonic() < deadline:
        last = fetch()
        if done(last):
            return last
        if last.get("status") == "failed":
            pytest.fail(f"{what} failed: {last}")
        time.sleep(3)
    pytest.fail(f"{what} not ready after {timeout:.0f}s; last seen: {last}")


def notes_pdf() -> bytes:
    """A small three-page lecture note, written by hand so no PDF library is needed."""
    pages = [
        [
            "BIO 101: Cell Biology. Lecture 1: The Cell Membrane",
            "The cell membrane is a phospholipid bilayer that surrounds every cell.",
            "It is selectively permeable: it lets some substances through and keeps others out.",
            "Proteins in the membrane act as channels, carriers and receptors.",
            "Cholesterol in animal cell membranes keeps the membrane fluid but stable.",
        ],
        [
            "Lecture 2: Diffusion and Osmosis",
            "Diffusion is the net movement of particles from a region of higher concentration",
            "to a region of lower concentration. It needs no energy from the cell.",
            "Osmosis is the diffusion of water across a selectively permeable membrane,",
            "from a dilute solution to a more concentrated solution.",
            "A red blood cell placed in pure water swells and may burst (haemolysis).",
        ],
        [
            "Lecture 3: Active Transport",
            "Active transport moves substances against their concentration gradient.",
            "It uses energy from ATP and carrier proteins in the membrane.",
            "The sodium-potassium pump moves three sodium ions out of the cell",
            "and two potassium ions into the cell for each ATP used.",
            "Root hair cells use active transport to take up mineral ions from the soil.",
        ],
    ]
    objects: list[bytes] = []
    kids = []
    font_id = 3
    next_id = 4
    page_objs = []
    for lines in pages:
        text = (
            "BT /F1 12 Tf 60 760 Td 16 TL "
            + " ".join(
                "(" + line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ") '"
                for line in lines
            )
            + " ET"
        )
        content_id, page_id = next_id, next_id + 1
        next_id += 2
        stream = text.encode("latin-1")
        page_objs.append(
            (
                content_id,
                b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
            )
        )
        page_objs.append(
            (
                page_id,
                b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                b"/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>"
                % (font_id, content_id),
            )
        )
        kids.append(page_id)
    objects.append((1, b"<< /Type /Catalog /Pages 2 0 R >>"))
    objects.append(
        (
            2,
            b"<< /Type /Pages /Kids [%s] /Count %d >>"
            % (b" ".join(b"%d 0 R" % k for k in kids), len(kids)),
        )
    )
    objects.append((font_id, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"))
    objects.extend(page_objs)
    objects.sort()
    out = bytearray(b"%PDF-1.4\n")
    offsets = {}
    for num, body in objects:
        offsets[num] = len(out)
        out += b"%d 0 obj\n" % num + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for num in range(1, len(objects) + 1):
        out += b"%010d 00000 n \n" % offsets[num]
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        xref,
    )
    return bytes(out)


def upload(student: Student, course_id: str | None = None, data: bytes | None = None) -> dict:
    """The app's upload: register, PUT the bytes to the signed URL, then say it's uploaded."""
    data = data or notes_pdf()
    r = student.post(
        "/v1/documents",
        json={"filename": "bio101-notes.pdf", "size_bytes": len(data), "course_id": course_id},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    (url,) = body["upload_urls"]
    put = httpx.put(url, content=data, headers={"content-type": "application/pdf"}, timeout=120)
    assert put.status_code in (200, 201), put.text
    r = student.post(f"/v1/documents/{body['document']['id']}/uploaded")
    assert r.status_code == 200, r.text
    return r.json()


def new_id() -> str:
    return str(uuid.uuid4())
