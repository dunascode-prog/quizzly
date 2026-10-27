"""FR-MOD-02: a question reported by 3 different students is hidden from quizzes."""

import uuid

from app.domain import study


class Conn:
    def __init__(self):
        self.sql = []

    async def execute(self, sql, params=None):
        self.sql.append(" ".join(sql.split()))

        class Cur:
            async def fetchone(self):
                return None

        return Cur()


async def test_reporting_a_question_checks_whether_to_hide_it():
    conn = Conn()
    await study.report(conn, uuid.uuid4(), "question", uuid.uuid4(), "wrong", None)
    hide = [s for s in conn.sql if s.startswith("update questions set hidden = true")]
    assert len(hide) == 1 and "count(distinct user_id)" in hide[0]


async def test_reporting_an_explanation_never_hides_questions():
    conn = Conn()
    await study.report(conn, uuid.uuid4(), "explanation", uuid.uuid4(), "unclear", None)
    assert not any(s.startswith("update questions") for s in conn.sql)
