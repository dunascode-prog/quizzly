"""`credit_referral` job (FR-INV-03): credit the inviter once the new student qualifies."""

import logging
from uuid import UUID

from psycopg import AsyncConnection

from app.domain import invites

log = logging.getLogger("quizzly.invites")


async def credit_referral(conn: AsyncConnection, job: dict) -> None:
    outcome = await invites.credit(conn, UUID(job["payload"]["invitee_id"]))
    if outcome:
        log.info("referral for %s: %s", job["payload"]["invitee_id"], outcome)
