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

    async def requeue(conn, job, delay, reason=None):
        record.append(("requeue", delay, reason))

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
    assert calls == [("requeue", worker.BUSY_REQUEUE_DELAY, "busy")]


async def test_a_spent_daily_budget_waits_longer_and_says_busy(calls, monkeypatch):
    from app.llm.gateway import BudgetReached

    async def handler(conn, job):
        raise BudgetReached("today's AI budget is spent")

    monkeypatch.setitem(worker.HANDLERS, "test_job", handler)
    await worker.run_one(None, "w1")
    assert calls == [("requeue", worker.BUDGET_REQUEUE_DELAY, "busy")]


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


# --- FR-SEC-03: crashed jobs fail the work they were doing ----------------------------------------


async def test_a_crashed_ingest_fails_the_document_and_its_file(monkeypatch):
    import uuid

    from app.worker import crashed

    doc, src = uuid.uuid4(), uuid.uuid4()
    failed = []

    async def _fail(conn, document_id, reason, source_file_id=None):
        failed.append((document_id, reason, source_file_id))

    class Conn:
        async def execute(self, sql, params=None):
            class Cur:
                async def fetchone(self):
                    return {"source_file_id": src, "file_status": "processing"}

            return Cur()

    monkeypatch.setattr(crashed.ingest, "_fail", _fail)
    await crashed.handle(
        Conn(), {"id": 1, "type": "ingest_document", "payload": {"document_id": str(doc)}}
    )
    assert failed == [(doc, "crashed", src)]


async def test_crashed_question_sets_and_explanations_are_marked_failed():
    import uuid

    from app.worker import crashed

    seen = []

    class Conn:
        async def execute(self, sql, params=None):
            seen.append((sql.split(" set ")[0], params))

    sid, eid = uuid.uuid4(), uuid.uuid4()
    await crashed.handle(
        Conn(), {"id": 1, "type": "generate_questions", "payload": {"question_set_id": str(sid)}}
    )
    await crashed.handle(
        Conn(), {"id": 2, "type": "generate_explanation", "payload": {"explanation_id": str(eid)}}
    )
    await crashed.handle(
        Conn(), {"id": 3, "type": "delete_account", "payload": {}}
    )  # nothing to fail
    assert seen == [("update question_sets", (sid,)), ("update explanations", (eid,))]


async def test_the_worker_sweep_hands_crashed_jobs_to_their_handlers(monkeypatch):
    from app.worker import crashed

    handled = []

    async def sweep_crashed(conn):
        return [{"id": 9, "type": "generate_questions", "payload": {}}]

    async def handle(conn, job):
        handled.append(job["id"])

    monkeypatch.setattr(queue, "sweep_crashed", sweep_crashed)
    monkeypatch.setattr(crashed, "handle", handle)
    assert await worker.sweep(None) == 1 and handled == [9]


async def test_a_crash_never_fails_a_shared_file_other_students_already_use(monkeypatch):
    import uuid

    from app.worker import crashed

    failed = []

    async def _fail(conn, document_id, reason, source_file_id=None):
        failed.append(source_file_id)

    class Conn:
        async def execute(self, sql, params=None):
            class Cur:
                async def fetchone(self):
                    return {"source_file_id": uuid.uuid4(), "file_status": "ready"}

            return Cur()

    monkeypatch.setattr(crashed.ingest, "_fail", _fail)
    job = {"id": 1, "type": "ingest_document", "payload": {"document_id": str(uuid.uuid4())}}
    await crashed.handle(Conn(), job)
    assert failed == [None]  # only this document is failed
