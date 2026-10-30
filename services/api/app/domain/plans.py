"""What each plan allows and what a student may use right now (FR-LIM-04..07).

Two ceilings keep costs bounded: daily counts per plan (FR-LIM-01/05) and a monthly AI allowance
measured at paid-tier list prices (FR-LIM-06). A paid plan over its allowance falls back to the free
limits and models; a free account over its allowance gets no new AI work until the next month.
Cached quiz sets and explanations never count: they cost nothing."""

from uuid import UUID

from psycopg import AsyncConnection

PAID = ("student", "premium")
# Resources that start AI work; all can be refused when an account is over its allowance.
AI_RESOURCES = ("upload", "question_set", "explanation", "chat_message", "marking")

# Daily limits on paid plans. Free limits come from Settings (configurable, PRD §9).
PAID_LIMITS = {
    "student": {
        "upload": 10,
        "question_set": 30,
        "explanation": 60,
        "chat_message": 80,
        "marking": 40,
    },
    "premium": {
        "upload": 20,
        "question_set": 50,
        "explanation": 120,
        "chat_message": 150,
        "marking": 80,
    },
}
_FREE_FIELDS = {
    "upload": "daily_uploads",
    "question_set": "daily_question_sets",
    "explanation": "daily_explanations",
    "chat_message": "daily_chat_messages",
    "marking": "daily_markings",
}

CAPPED = (
    "You've used this month's AI allowance on the free plan. Everything you've already made "
    "still works, and the allowance comes back on the 1st."
)

# One round trip: the plan, whether it's active, and this month's reference spend.
STANDING_SQL = """
select p.plan::text as plan,
       (p.plan_expires_at is null or p.plan_expires_at > now()) as active,
       coalesce((select s.micro_usd from ai_spend s
                 where s.user_id = p.id and s.month = date_trunc('month', now())::date), 0)
         as spent_micro
from profiles p where p.id = %s
"""


def daily_limit(settings, plan: str, resource: str) -> int:
    """Today's limit for this resource on this (effective) plan."""
    if plan == "capped" and resource in AI_RESOURCES:
        return 0
    if plan in PAID_LIMITS:
        return PAID_LIMITS[plan][resource]
    return getattr(settings, _FREE_FIELDS[resource])


def ceiling_usd(settings, plan: str) -> float:
    return {
        "student": settings.monthly_ai_ceiling_student_usd,
        "premium": settings.monthly_ai_ceiling_premium_usd,
    }.get(plan, settings.monthly_ai_ceiling_free_usd)


def effective(settings, row: dict | None) -> str:
    """free, student or premium as the student may use them now, or capped (no new AI work)."""
    if row is None:
        return "free"
    plan = row["plan"] if row["active"] and row["plan"] in PAID else "free"
    spent = row["spent_micro"] / 1_000_000
    if plan in PAID:
        return plan if spent < ceiling_usd(settings, plan) else "free"
    return "free" if spent < ceiling_usd(settings, "free") else "capped"


async def effective_plan(conn: AsyncConnection, user_id: UUID | None, settings) -> str:
    if user_id is None:
        return "free"
    row = await (await conn.execute(STANDING_SQL, (user_id,))).fetchone()
    return effective(settings, row)


def models_for(plan: str) -> str:
    """The model tier: capped accounts' queued jobs still finish, on the free models."""
    return plan if plan in PAID else "free"
