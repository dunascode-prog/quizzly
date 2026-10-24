from datetime import timedelta

import pytest

from app.llm.gateway import AllProvidersBusy
from app.worker import main as worker
from app.worker import queue


def test_backoff_doubles_and_caps():
    assert queue.backoff_for(1) == timedelta(seconds=15)
    assert queue.backoff_for(2) == timedelta(seconds=30)
    assert queue.backoff_for(3) == timedelta(seconds=60)
    assert queue.backoff_for(20) == timedelta(minutes=30)


@pytest.fixture
def calls(monkeypatch):
    """Replace queue functions with recorders so run_one can be tested without Postgres."""
    record: list[tuple] = []
    job = {"id": "job-1", "type": "test_job", "attempts": 1, "max_attempts": 5}

    async def claim(conn, worker_id, types):
        return dict(job)

    async def succeed(conn, job_id):
        record.append(("succeed", job_id))

    async def fail(conn, job, error, retry=True):
        record.append(("fail", retry))

    async def requeue(conn, job, delay):
        record.append(("requeue", delay))

    monkeypatch.setattr(queue, "claim", claim)
    monkeypatch.setattr(queue, "succeed", succeed)
    monkeypatch.setattr(queue, "fail", fail)
    monkeypatch.setattr(queue, "requeue", requeue)
    return record


async def test_run_one_success(calls, monkeypatch):
    async def handler(conn, job):
        pass

    monkeypatch.setitem(worker.HANDLERS, "test_job", handler)
    assert await worker.run_one(None, "w1") is True
    assert calls == [("succeed", "job-1")]


async def test_run_one_failure_retries(calls, monkeypatch):
    async def handler(conn, job):
        raise RuntimeError("boom")

    monkeypatch.setitem(worker.HANDLERS, "test_job", handler)
    await worker.run_one(None, "w1")
    assert calls == [("fail", True)]


async def test_run_one_requeues_when_llm_busy(calls, monkeypatch):
    async def handler(conn, job):
        raise AllProvidersBusy("all 429")

    monkeypatch.setitem(worker.HANDLERS, "test_job", handler)
    await worker.run_one(None, "w1")
    assert calls == [("requeue", worker.BUSY_REQUEUE_DELAY)]


async def test_run_one_unknown_type_fails_without_retry(calls):
    await worker.run_one(None, "w1")
    assert calls == [("fail", False)]


async def test_run_one_empty_queue(monkeypatch):
    async def claim(conn, worker_id, types):
        return None

    monkeypatch.setattr(queue, "claim", claim)
    assert await worker.run_one(None, "w1") is False


async def test_workers_claim_only_job_types_they_handle(monkeypatch):
    seen = []

    async def claim(conn, worker_id, types):
        seen.extend(types)
        return None

    monkeypatch.setattr(queue, "claim", claim)
    await worker.run_one(None, "w1")
    assert "mark_answers" in seen and "generate_questions" in seen
