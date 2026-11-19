"""Admin app (E4, WEB.md §3): Overview, AI costs, System, Students, Reports and Takedowns.

Every route needs an admin token with 2FA (app.core.admin). Views of student data are written to
the audit log, and so is every report or takedown action. Limits and plans come later."""

import re
from datetime import date, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path, Query, Response, status
from pydantic import BaseModel, Field

from app.api.deps import AppSettings, Conn
from app.core import live_config
from app.core.admin import Admin, audit
from app.domain import admin as stats
from app.domain import moderation

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


# --- reports (30c, FR-MOD-01/02) ------------------------------------------------------------------

ReportTarget = Literal["question", "explanation", "chat_message", "course"]
TargetPath = Annotated[ReportTarget, Path()]


class ReportGroup(BaseModel):
    type: str
    target_id: UUID
    reports: int
    reporters: int
    last_at: datetime
    reason: str
    note: str | None  # the newest note a reporter wrote
    hidden: bool  # a question hidden by 3 reports (FR-MOD-02)
    preview: str  # the question, course or topic it's about


@router.get("/reports")
async def reports(
    _: Admin,
    conn: Conn,
    status_: Annotated[Literal["open", "resolved", "dismissed"], Query(alias="status")] = "open",
    type_: Annotated[ReportTarget | None, Query(alias="type")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[ReportGroup]:
    """30c queue: reports grouped by the item they're about, newest first."""
    rows = await moderation.queue_list(conn, status_, type_, limit)
    return [ReportGroup(**r) for r in rows]


class Reporter(BaseModel):
    reason: str
    note: str | None
    status: str
    created_at: datetime
    school: str | None  # no names (WEB.md §3)
    level: str | None


class ReportDetailOut(BaseModel):
    type: str
    target_id: UUID
    item: dict[str, Any] | None  # the reported item itself; null if it was deleted
    reporters: list[Reporter]


@router.get("/reports/{target_type}/{target_id}")
async def report_detail(
    admin: Admin, conn: Conn, target_type: TargetPath, target_id: UUID
) -> ReportDetailOut:
    """30c detail: the reported item, its cited source and every reporter's note. Logged."""
    data = await moderation.detail(conn, target_type, target_id)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No reports for this item")
    await audit(conn, admin, "reports.view", f"{target_type}:{target_id}")
    return ReportDetailOut(**data)


class ClosedOut(BaseModel):
    closed: int


@router.post("/reports/{target_type}/{target_id}/dismiss")
async def dismiss_reports(
    admin: Admin, conn: Conn, target_type: TargetPath, target_id: UUID
) -> ClosedOut:
    """Nothing wrong: closes the reports and brings a hidden question back into quizzes."""
    async with conn.transaction():
        closed = await moderation.dismiss(conn, target_type, target_id)
        target = f"{target_type}:{target_id}"
        await audit(conn, admin, "reports.dismiss", target, {"closed": closed})
    return ClosedOut(closed=closed)


@router.post("/reports/{target_type}/{target_id}/keep-hidden")
async def keep_hidden(
    admin: Admin, conn: Conn, target_type: TargetPath, target_id: UUID
) -> ClosedOut:
    """Really wrong: a question stays out of quizzes; the reports are resolved."""
    async with conn.transaction():
        closed = await moderation.keep_hidden(conn, target_type, target_id)
        target = f"{target_type}:{target_id}"
        await audit(conn, admin, "reports.keep_hidden", target, {"closed": closed})
    return ClosedOut(closed=closed)


class FixIn(BaseModel):
    answer: bool | int | str  # true_false: bool; mcq: option index; fill_blank: text
    explanation: str | None = Field(default=None, max_length=2000)


class FixedOut(BaseModel):
    remarked: int  # past answers re-marked
    rescored: int  # finished attempts rescored
    thanked: int  # reporters told it was fixed


@router.post("/reports/question/{question_id}/fix-answer")
async def fix_answer(admin: Admin, conn: Conn, question_id: UUID, body: FixIn) -> FixedOut:
    """Corrects the answer, re-marks every past answer and rescores those attempts, brings the
    question back and thanks the reporters."""
    try:
        async with conn.transaction():
            result = await moderation.fix_answer(conn, question_id, body.answer, body.explanation)
            detail = {"answer": body.answer, **result}
            await audit(conn, admin, "reports.fix_answer", f"question:{question_id}", detail)
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found") from exc
    except moderation.BadAnswer as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    return FixedOut(**result)


# --- takedowns (30d, FR-MOD-04/05) ----------------------------------------------------------------

SHA256 = re.compile(r"^[0-9a-f]{64}$")


class TakedownIn(BaseModel):
    target_type: Literal["file", "course"]
    target: str = Field(min_length=4, max_length=64)  # a file's SHA-256, or a share code
    reason: Literal["copyright", "inappropriate", "other"]
    requested_by: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=2000)  # internal only
    notify: bool = True  # tell students whose file it was (a course's members are always told)


class TakedownOut(BaseModel):
    id: UUID
    students_affected: int


class TakedownRow(BaseModel):
    id: UUID
    target_type: str
    target: str
    reason: str
    requested_by: str | None
    students_affected: int
    admin_id: UUID
    status: str
    created_at: datetime
    reversed_at: datetime | None


class NearUnshare(BaseModel):
    code: str
    title: str | None
    share_code: str
    member_count: int
    reporters: int  # 5 different members unshare it automatically (FR-MOD-05)


class TakedownsOut(BaseModel):
    log: list[TakedownRow]
    near_unshare: list[NearUnshare]


@router.get("/takedowns")
async def list_takedowns(_: Admin, conn: Conn) -> TakedownsOut:
    """30d: the takedown log and shared courses close to the automatic unshare."""
    return TakedownsOut(
        log=[TakedownRow(**r) for r in await moderation.takedowns(conn, 100)],
        near_unshare=[NearUnshare(**r) for r in await moderation.courses_near_unshare(conn)],
    )


@router.post("/takedowns", status_code=status.HTTP_201_CREATED)
async def take_down(admin: Admin, conn: Conn, body: TakedownIn) -> TakedownOut:
    """Blocks a file (deletes everything made from it, fails every copy, refuses re-uploads) or
    takes down a shared course (members lose access and are told)."""
    target = body.target.strip()
    async with conn.transaction():
        if body.target_type == "file":
            target = target.lower()
            if not SHA256.match(target):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That isn't a SHA-256.")
            affected = await moderation.take_down_file(conn, target, body.notify)
        else:
            found = await moderation.take_down_course(conn, target)
            if found is None:
                raise HTTPException(
                    status.HTTP_404_NOT_FOUND, "No active shared course with that code"
                )
            affected = found
        row = body.model_dump(exclude={"notify"})
        row |= {"target": target, "students_affected": affected, "admin_id": admin.id}
        takedown_id = await moderation.log_takedown(conn, row)
        detail = {"reason": body.reason, "affected": affected}
        await audit(conn, admin, "takedowns.create", f"{body.target_type}:{target}", detail)
    return TakedownOut(id=takedown_id, students_affected=affected)


@router.post("/takedowns/{takedown_id}/reverse", status_code=status.HTTP_204_NO_CONTENT)
async def reverse_takedown(admin: Admin, conn: Conn, takedown_id: UUID) -> Response:
    """Unblocks a file so it can be uploaded again. Course takedowns can't be reversed (members
    were removed; the owner can share it again)."""
    async with conn.transaction():
        row = await moderation.reverse(conn, takedown_id, admin.id)
        if row is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Only an active file takedown can be reversed."
            )
        await audit(conn, admin, "takedowns.reverse", f"file:{row['target']}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- limits and plans (30e) -----------------------------------------------------------------------


class LimitField(BaseModel):
    key: str
    label: str
    group: str
    unit: str
    min: float
    max: float
    decimals: bool
    default: float  # from the environment and code
    value: float  # in force now (the default unless an admin changed it)
    changed: bool


class LimitChange(BaseModel):
    admin_id: UUID
    key: str | None
    old: Any
    new: Any  # null: reset to the default
    created_at: datetime


class LimitsOut(BaseModel):
    fields: list[LimitField]
    changes: list[LimitChange]  # the 20 most recent
    applies_within_s: int  # every API and worker process re-reads within this


class LimitsIn(BaseModel):
    # key -> new value, or null to go back to the default. Only the keys in GET /admin/limits.
    values: dict[str, float | None] = Field(min_length=1, max_length=len(live_config.FIELDS))


async def _limits(conn, settings) -> LimitsOut:
    overrides = await live_config.load(conn)
    live = live_config.apply(settings, overrides)  # this process is current at once
    base = live_config.defaults(settings)
    changes = await (
        await conn.execute(
            "select admin_id, target as key, detail->'old' as old, detail->'new' as new, "
            "created_at from admin_audit_log where action = 'config.update' "
            "order by created_at desc limit 20"
        )
    ).fetchall()
    fields = [
        LimitField(
            key=f.key,
            label=f.label,
            group=f.group,
            unit=f.unit,
            min=f.lo,
            max=f.hi,
            decimals=f.decimals,
            default=base[f.key],
            value=live[f.key],
            changed=f.key in overrides and live[f.key] != base[f.key],
        )
        for f in live_config.FIELDS
    ]
    return LimitsOut(
        fields=fields,
        changes=[LimitChange(**c) for c in changes],
        applies_within_s=live_config.REFRESH_SECONDS,
    )


@router.get("/limits")
async def limits(_: Admin, conn: Conn, settings: AppSettings) -> LimitsOut:
    """30e: every limit an admin can change, its default, the value in force, and recent changes."""
    return await _limits(conn, settings)


@router.put("/limits")
async def update_limits(
    admin: Admin, conn: Conn, settings: AppSettings, body: LimitsIn
) -> LimitsOut:
    """Changes limits for every student within a minute. Each key is checked against its bounds;
    one bad value refuses the whole change. Every changed key is logged with its old value."""
    clean: dict[str, Any] = {}
    for key, value in body.values.items():
        field = live_config.BY_KEY.get(key)
        if field is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown limit: {key}")
        try:
            clean[key] = None if value is None else field.check(value)
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    async with conn.transaction():
        current = await live_config.load(conn)
        base = live_config.defaults(settings)
        await live_config.save(conn, admin.id, clean)
        for key, new in clean.items():
            old = current.get(key, base[key])
            if new != old:
                await audit(conn, admin, "config.update", key, {"old": old, "new": new})
    return await _limits(conn, settings)
