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


# --- the catalogue and Google Play entitlements (FR-PLAN-01..03) ----------------------------------

PRICE_USD = {"free": 0.0, "student": 6.0, "premium": 10.0}
STORAGE_FIELD = {
    "free": "storage_free_mb",
    "student": "storage_student_mb",
    "premium": "storage_premium_mb",
}
EXTRAS = {
    "free": ["5 and 10-question sets", "Offline course downloads"],
    "student": [
        "All quiz sizes, timed exams and past-paper style",
        "Stronger AI model",
        "Priority processing",
        "Offline course downloads",
    ],
    "premium": [
        "All quiz sizes, timed exams and past-paper style",
        "Stronger AI model",
        "Priority processing",
        "Most room for exam season",
        "Offline course downloads",
    ],
}
# Google keeps access through these states; CANCELED means "won't renew", not "ended".
ENTITLED_STATES = (
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    "SUBSCRIPTION_STATE_CANCELED",
)


def catalogue(settings, discount_percent: int | None) -> list[dict]:
    """The three plans with their limits, prices and extras; the invite discount when unlocked."""
    out = []
    for plan in ("free", "student", "premium"):
        price = PRICE_USD[plan]
        out.append(
            {
                "id": plan,
                "price_usd": price,
                "discounted_price_usd": round(price * (100 - discount_percent) / 100, 2)
                if discount_percent and price
                else None,
                "limits": {r: daily_limit(settings, plan, r) for r in AI_RESOURCES},
                "storage_mb": getattr(settings, STORAGE_FIELD[plan]),
                "monthly_ai_usd": ceiling_usd(settings, plan),
                "extras": EXTRAS[plan],
                "quiz_sizes": list(FREE_QUIZ_SIZES) if plan == "free" else [5, 10, 20, 30],
                "trial_days": settings.trial_days if plan == "student" else None,
            }
        )
    return out


def product_plan(settings, product_id: str) -> str | None:
    return {
        settings.play_student_product: "student",
        settings.play_premium_product: "premium",
    }.get(product_id)


async def save_subscription(
    conn: AsyncConnection, user_id: UUID, token: str, plan: str, line: dict, state: str
) -> None:
    """Records the purchase and gives or takes the plan to match Google's state. Access lasts to
    the paid-up date plus a day, in case a renewal notification is late."""
    await conn.execute(
        """
        insert into subscriptions (purchase_token, user_id, product_id, plan, state, offer_id,
                                   expires_at)
        values (%(token)s, %(user)s, %(product)s, %(plan)s, %(state)s, %(offer)s, %(expires)s)
        on conflict (purchase_token) do update set state = excluded.state,
          offer_id = excluded.offer_id, expires_at = excluded.expires_at
        """,
        {
            "token": token,
            "user": user_id,
            "product": line.get("productId"),
            "plan": plan,
            "state": state,
            "offer": (line.get("offerDetails") or {}).get("offerId"),
            "expires": line.get("expiryTime"),
        },
    )
    if state in ENTITLED_STATES and line.get("expiryTime"):
        await conn.execute(
            "update profiles set plan = %s, plan_expires_at = %s::timestamptz + interval '1 day' "
            "where id = %s",
            (plan, line["expiryTime"], user_id),
        )
    else:
        await revoke(conn, user_id, token)


async def revoke(conn: AsyncConnection, user_id: UUID, token: str) -> None:
    """Ended, refunded or voided: back to free, unless another purchase still covers them."""
    await conn.execute(
        """
        update profiles set plan = 'free', plan_expires_at = null
        where id = %(user)s and not exists (
          select 1 from subscriptions s where s.user_id = %(user)s
            and s.purchase_token <> %(token)s and s.state = any(%(ok)s) and s.expires_at > now()
        )
        """,
        {"user": user_id, "token": token, "ok": list(ENTITLED_STATES)},
    )


async def subscription_owner(conn: AsyncConnection, token: str) -> dict | None:
    return await (
        await conn.execute(
            "select user_id, plan::text as plan from subscriptions where purchase_token = %s",
            (token,),
        )
    ).fetchone()


async def paid_plan(conn: AsyncConnection, user_id: UUID) -> dict | None:
    """The plan they pay for, whether it's still running, and whether the invite discount is
    unlocked."""
    return await (
        await conn.execute(
            "select plan::text as plan, plan_expires_at, "
            "(plan_expires_at is null or plan_expires_at > now()) as active, "
            "discount_unlocked_at is not null as disc from profiles where id = %s",
            (user_id,),
        )
    ).fetchone()


async def void(conn: AsyncConnection, user_id: UUID, token: str) -> None:
    """Refunded or voided by Google: the plan goes at once."""
    await conn.execute(
        "update subscriptions set state = 'VOIDED' where purchase_token = %s", (token,)
    )
    await revoke(conn, user_id, token)


# --- what free students see when something is locked or used up (FR-PLAN-04) ---------------------

NAMES = {
    "upload": "uploads",
    "question_set": "quiz sets",
    "explanation": "explanations",
    "chat_message": "chat messages",
    "marking": "markings",
}
FREE_QUIZ_SIZES = (5, 10)  # 20- and 30-question sets are on Student and Premium

LOCKED = {
    "quiz_size": "20 and 30-question sets are on Student and Premium.",
    "exam_timer": "Timed exam practice is on Student and Premium.",
    "past_paper": "Past-paper style questions are on Student and Premium.",
    "fresh_set": "A brand-new set of the same quiz is on Student and Premium.",
}


def is_free(plan: str) -> bool:
    """Free or over its monthly allowance: the padlocks apply."""
    return plan not in PAID


def used_up(settings, plan: str, resource: str) -> str:
    """The message when an allowance runs out. Kind, no countdown (DESIGN.md); for free students
    it says what Student gives, and unused allowance saves up for a week (FR-LIM-08)."""
    daily = daily_limit(settings, plan, resource)
    name = NAMES[resource]
    message = f"You've used your {name} for now. {daily} more arrive at midnight."
    if is_free(plan):
        message += f" Student gives you {PAID_LIMITS['student'][resource]} a day."
    return message
