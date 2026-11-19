"""Admin app data (E4, WEB.md §3): Overview (30a), AI costs (30b), System (30g), Students (30f).

Every route needs an admin token with 2FA (app.core.admin). Views of student data are written to
the audit log. Actions (reports, takedowns, limits) come in later routes."""

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.api.deps import AppSettings, Conn
from app.core.admin import Admin, audit
from app.domain import admin as stats

router = APIRouter(prefix="/admin", tags=["admin"])
RangeQ = Annotated[Literal["today", "7d", "30d"], Query()]


class Breaker(BaseModel):
    provider: str
    open: bool


class Health(BaseModel):
    waiting: int
    running: int
    failed_24h: int
    worker_beat_s: int | None  # seconds since the last heartbeat; null if no worker ever ran
    breakers: list[Breaker]


class ProviderDay(BaseModel):
    provider: str
    day: date
    cost: float


class Attention(BaseModel):
    type: str
    target_id: UUID
    note: str | None  # what the reporter wrote, never anyone's notes
    reason: str
    reports: int
    last_at: datetime
    hidden: bool


class OverviewOut(BaseModel):
    active: int
    active_month: int
    signups: int
    invited: int
    documents: int
    duplicates: int  # re-uploads of a file already processed: free
    open_reports: int
    auto_hidden: int
    cost_today: float
    daily_budget_usd: float
    providers: list[ProviderDay]
    attention: list[Attention]
    health: Health


@router.get("/overview")
async def overview(
    _: Admin, conn: Conn, settings: AppSettings, range: RangeQ = "today"
) -> OverviewOut:
    """30a: activity, sign-ups, documents, open reports, today's AI spend and system health."""
    return OverviewOut(
        **await stats.overview(conn, settings.timezone, range, settings.daily_llm_cost_budget_usd)
    )


class CostDay(BaseModel):
    day: date
    paid_usd: float


class ProviderCost(BaseModel):
    provider: str
    calls: int
    errors: int
    p50_ms: float | None
    paid_usd: float


class TaskCost(BaseModel):
    task: str
    model: str
    calls: int
    tokens_in: int
    tokens_out: int
    list_usd: float


class CostlyStudent(BaseModel):
    id: UUID  # IDs only, never names (WEB.md §3)
    school: str | None
    level: str | None
    plan: str
    list_usd: float
    quiz_sets: int


class CostsOut(BaseModel):
    calls: int
    free_calls: int  # calls that cost $0 (free tiers)
    list_usd: float  # at paid-tier list prices (the plans' AI allowance basis, FR-LIM-06)
    paid_usd: float  # what was actually paid after free tiers
    active: int
    daily: list[CostDay]  # the last 30 days, for the budget chart
    providers: list[ProviderCost]
    tasks: list[TaskCost]
    top_students: list[CostlyStudent]
    health: Health


@router.get("/costs")
async def costs(_: Admin, conn: Conn, settings: AppSettings, range: RangeQ = "30d") -> CostsOut:
    """30b: AI usage at list price and paid, per provider and task, and the costliest students."""
    return CostsOut(**await stats.costs(conn, settings.timezone, range))


class JobStats(BaseModel):
    job: str
    done: int
    failed: int
    p50_s: float | None
    p95_s: float | None


class UploadTimes(BaseModel):
    p50_s: float | None
    p95_s: float | None


class Failure(BaseModel):
    id: UUID
    job: str
    at: datetime
    attempts: int
    max_attempts: int
    reason: str


class SystemOut(BaseModel):
    health: Health
    jobs: list[JobStats]  # the last 24 hours
    upload_to_ready: UploadTimes  # the last 7 days
    failures: list[Failure]


@router.get("/system")
async def system(_: Admin, conn: Conn) -> SystemOut:
    """30g: the job queue, worker heartbeat, job times, recent failures and AI breakers."""
    return SystemOut(**await stats.system(conn))


class School(BaseModel):
    name: str
    students: int


class Source(BaseModel):
    channel: str  # link, play_referrer or share_link
    n: int


class StudentsSummaryOut(BaseModel):
    active_month: int
    active_today: int
    new_week: int
    invited_week: int
    goal_met_share: float | None
    week4_retention: float | None
    schools: list[School]
    sources: list[Source]


@router.get("/students/summary")
async def students_summary(_: Admin, conn: Conn, settings: AppSettings) -> StudentsSummaryOut:
    """30f tiles and tables: activity, weekly goals, retention, schools, how students found us."""
    return StudentsSummaryOut(**await stats.students_summary(conn, settings.timezone))


class StudentRow(BaseModel):
    id: UUID
    name: str | None  # display name ("Ada O."); null once deletion has started
    school: str | None
    level: str | None
    plan: str
    created_at: datetime
    last_active: date | None
    quiz_sets: int  # the last 30 days
    ai_cost_usd: float | None  # this month, at list price
    status: Literal["active", "paused", "deleting"]


@router.get("/students")
async def students(
    admin: Admin,
    conn: Conn,
    settings: AppSettings,
    search: Annotated[str, Query(max_length=80)] = "",
    school: Annotated[str | None, Query(max_length=80)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[StudentRow]:
    """30f table: display names, school, plan, activity, usage and status. No emails, notes or
    progress. Each view is written to the audit log."""
    rows = await stats.students(conn, settings.timezone, search.strip(), school, limit, offset)
    await audit(conn, admin, "students.list", search or None, {"school": school, "rows": len(rows)})
    return [StudentRow(**r) for r in rows]
