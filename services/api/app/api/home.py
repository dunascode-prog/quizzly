"""Today, Daily 5, reading time, weekly recap and settings (BUILD_PLAN C4)."""

from datetime import date, datetime, time
from typing import Any, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator

from app.api.deps import Conn, User
from app.domain import home, settings

router = APIRouter(tags=["home"])

NOTHING_TO_PRACTISE = "Nothing to practise yet. Upload your notes first."
THEME_LOCKED = "That theme isn't unlocked yet."


class Countdown(BaseModel):
    course_id: UUID
    code: str
    title: str | None
    accent: str
    exam_date: date | None  # None: no exam date, the card asks for one (FR-HOME-02)
    days_left: int | None
    readiness: float
    change_this_week: float | None  # None when there was no value 7 days ago


class Day(BaseModel):
    day: date
    studied: bool
    questions: int


class Week(BaseModel):
    days: list[Day]
    study_days: int
    goal: int
    weeks_in_a_row: int


class PlanRow(BaseModel):
    # daily5, weak_topic, learn, practise_any; new students: upload, join_shared (FR-HOME-05)
    kind: Literal["daily5", "weak_topic", "learn", "practise_any", "upload", "join_shared"]
    due: int | None = None
    minutes: int | None = None
    topic_id: UUID | None = None
    title: str | None = None
    document_id: UUID | None = None
    mastery: float | None = None


class Achievement(BaseModel):
    id: UUID
    kind: str
    ref: dict[str, Any]


class HomeOut(BaseModel):
    today: date
    countdown: Countdown | None
    week: Week
    plan: list[PlanRow]
    unread_notifications: int
    # Not celebrated yet (FR-HAB-05); the app marks them seen.
    achievements: list[Achievement]


class SeenIn(BaseModel):
    ids: list[UUID] = Field(max_length=50)


class Daily5Out(BaseModel):
    quiz_id: UUID  # played like any practice quiz
    day: date
    size: int
    attempt_id: UUID | None
    done: bool


class ReadingEvent(BaseModel):
    topic_id: UUID
    seconds: int = Field(ge=1, le=home.MAX_READING_EVENT_SECONDS)
    at: datetime  # when the reading happened, so offline reading counts on the right day


class ReadingIn(BaseModel):
    events: list[ReadingEvent] = Field(min_length=1, max_length=50)


class RecapReadiness(BaseModel):
    course_id: UUID
    code: str
    accent: str
    value: float
    change: float | None


class RecapOut(BaseModel):
    week_start: date
    week_end: date
    ready: bool  # Sunday 6 PM local (FR-HAB-06)
    questions_answered: int
    study_days: int
    goal: int
    weeks_in_a_row: int
    topics_mastered: int
    readiness: RecapReadiness | None
    name: str | None
    institution: str | None
    level: str | None
    show_identity: bool
    invite_code: str | None


Theme = Literal["ink", "lagoon", "ankara", "palm", "lavender"]


class SettingsOut(BaseModel):
    weekly_goal_days: int
    accent: Theme
    night_mode: bool
    low_data_mode: bool
    share_permission: Literal["coursemates", "code", "nobody"]
    show_identity_on_links: bool
    timezone: str
    unlocked_themes: list[Theme]


class SettingsIn(BaseModel):
    weekly_goal_days: int | None = Field(default=None, ge=1, le=7)
    accent: Theme | None = None
    night_mode: bool | None = None
    low_data_mode: bool | None = None
    share_permission: Literal["coursemates", "code", "nobody"] | None = None
    show_identity_on_links: bool | None = None
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("timezone")
    @classmethod
    def _zone(cls, v: str | None) -> str | None:
        if v is not None:
            try:
                ZoneInfo(v)
            except (ZoneInfoNotFoundError, ValueError) as exc:
                raise ValueError("Unknown time zone") from exc
        return v


class NotificationTypes(BaseModel):
    exam: bool | None = None
    due: bool | None = None
    recap: bool | None = None
    mates: bool | None = None
    ready: bool | None = None


class NotificationSettingsOut(BaseModel):
    daily_reminder: bool
    daily_reminder_time: time
    quiet_start: time
    quiet_end: time
    types: dict[str, bool]


class NotificationSettingsIn(BaseModel):
    daily_reminder: bool | None = None
    daily_reminder_time: time | None = None
    quiet_start: time | None = None
    quiet_end: time | None = None
    types: NotificationTypes | None = None


@router.get("/v1/home")
async def get_home(user: User, conn: Conn) -> HomeOut:
    """Everything Today shows, in one small payload (FR-HOME-01..05, NFR-02)."""
    data = await home.home(conn, user.id)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    return HomeOut(**data)


@router.post("/v1/achievements/seen", status_code=status.HTTP_204_NO_CONTENT)
async def achievements_seen(body: SeenIn, user: User, conn: Conn) -> Response:
    await home.mark_achievements_seen(conn, user.id, body.ids)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/v1/daily5")
async def get_daily5(user: User, conn: Conn) -> Daily5Out:
    """Today's 5 questions: due for review, then weak topics, then new (FR-HAB-01). Doesn't count
    against the daily quiz limit: no questions are generated."""
    d5 = await home.daily5(conn, user.id)
    if d5 is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOTHING_TO_PRACTISE)
    return Daily5Out(**d5)


@router.post("/v1/events/reading")
async def reading(body: ReadingIn, user: User, conn: Conn) -> dict[str, int]:
    """Batched reading time from explanation screens (FR-HAB-02)."""
    counted = await home.record_reading(conn, user.id, [e.model_dump() for e in body.events])
    return {"counted": counted}


@router.get("/v1/recap/{week}")
async def get_recap(week: date, user: User, conn: Conn) -> RecapOut:
    """The week starting on Monday `week` (FR-HAB-06). The app draws the shareable image."""
    if week.weekday() != 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A week starts on a Monday")
    data = await home.recap(conn, user.id, week)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    return RecapOut(**data)


@router.get("/v1/me/settings", tags=["account"])
async def get_settings(user: User, conn: Conn) -> SettingsOut:
    data = await settings.get_settings(conn, user.id)
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    return SettingsOut(**data)


@router.patch("/v1/me/settings", tags=["account"])
async def update_settings(body: SettingsIn, user: User, conn: Conn) -> SettingsOut:
    """Weekly goal, theme, night and low-data modes, share permission, identity on links."""
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    try:
        data = await settings.update_settings(conn, user.id, fields)
    except settings.ThemeLocked as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, THEME_LOCKED) from exc
    if data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    return SettingsOut(**data)


@router.get("/v1/me/notification-settings", tags=["account"])
async def get_notification_settings(user: User, conn: Conn) -> NotificationSettingsOut:
    return NotificationSettingsOut(**await settings.get_notification_settings(conn, user.id))


@router.patch("/v1/me/notification-settings", tags=["account"])
async def update_notification_settings(
    body: NotificationSettingsIn, user: User, conn: Conn
) -> NotificationSettingsOut:
    """Daily reminder and its time, quiet hours, and per-type toggles (FR-HAB-08)."""
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "types" in fields:
        fields["types"] = {k: v for k, v in fields["types"].items() if v is not None}
    data = await settings.update_notification_settings(conn, user.id, fields)
    return NotificationSettingsOut(**data)
