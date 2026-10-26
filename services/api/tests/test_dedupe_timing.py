"""FR-SEC-11 / FR-DOC-06: a duplicate upload looks and times like a fresh one."""

from datetime import UTC, datetime, timedelta

import pytest

from app.worker import ingest, queue


@pytest.fixture
def clock(monkeypatch):
    slept, steps = [], []

    async def sleep(seconds):
        slept.append(seconds)

    async def set_progress(conn, job_id, progress):
        steps.append(progress)

    monkeypatch.setattr(ingest.asyncio, "sleep", sleep)
    monkeypatch.setattr(queue, "set_progress", set_progress)
    return slept, steps


async def test_a_hit_right_after_upload_waits_about_3_seconds_with_real_progress(clock):
    slept, steps = clock
    await ingest._dedupe_floor(None, {"id": 1, "created_at": datetime.now(UTC)})
    assert 2.9 < sum(slept) <= 3.0
    assert steps == [10, 30, 70, 90]


async def test_a_hit_already_3_seconds_old_does_not_wait(clock):
    slept, steps = clock
    old = datetime.now(UTC) - timedelta(seconds=10)
    await ingest._dedupe_floor(None, {"id": 1, "created_at": old})
    assert sum(slept) == 0 and steps == [10, 30, 70, 90]
