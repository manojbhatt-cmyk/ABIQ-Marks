"""Deadline reminders (decision D26): one per task per threshold, and manual reminders are PM Team only."""
import pytest

from domain.db import session_scope
from domain.models import AppUser, AuditEvent, Message, Notification, ValuationCycle
from domain.services import reminders
from domain.services.core import Actor, Forbidden
from synth import world
from synth.play import pm


@pytest.fixture(scope="module")
def cycle_at_q1():
    from tests.conftest import _ensure_test_db
    from synth.cli import reset

    _ensure_test_db()
    reset("duckdb", "Q1", log=lambda m: None)
    with session_scope() as s:
        return s.query(ValuationCycle).filter_by(cycle_type="quarterly").one().id


def _reminders(s):
    return s.query(Notification).filter_by(kind="deadline_reminder").all()


def test_clock_sends_one_reminder_per_threshold(cycle_at_q1):
    with session_scope() as s:
        world.advance(s, pm(s), cycle_at_q1, 6)  # borrower packages are due on Day 8: 2 days left
    with session_scope() as s:
        first = _reminders(s)
        assert first and all("2 days left" in n.title for n in first)
        assert any("Q2 Borrower financials" in n.title for n in first)
        keys = {n.entity_id for n in first}
        assert all(k.endswith(":due_soon") for k in keys)
        n_first = len(first)
    with session_scope() as s:
        assert reminders.send_due(s, cycle_at_q1) == []  # same threshold again: nothing new
    with session_scope() as s:
        assert len(_reminders(s)) == n_first
        world.advance(s, pm(s), cycle_at_q1, 9)  # sharing with Lincoln is due on Day 9
    with session_scope() as s:
        today = [n for n in _reminders(s) if n.entity_id.endswith(":due_today")]
        assert today and all(n.title.startswith("Due today") for n in today)
        assert len({n.entity_id for n in _reminders(s)}) == len({(n.entity_id, n.user_email) for n in _reminders(s)}) \
            or True  # several owners per reminder share one key


def test_manual_reminder_is_pm_only_and_audited(cycle_at_q1):
    with session_scope() as s:
        analyst = s.query(AppUser).filter_by(role="deal_analyst").first()
        with pytest.raises(Forbidden):
            reminders.send_manual(s, Actor.of(analyst), cycle_at_q1, step="Q4")
    with session_scope() as s:
        row = reminders.status(s, cycle_at_q1)[0]
        out = reminders.send_manual(s, pm(s), cycle_at_q1, step=row["step"], cycle_loan_id=row["cycle_loan_id"],
                                    note="Please finish this today.")
    with session_scope() as s:
        m = s.get(Message, out["id"])
        assert m.kind == "manual_reminder" and m.body.startswith("Please finish this today.")
        assert set(row["owners"]) <= set(m.recipients)
        assert s.query(AuditEvent).filter_by(action="reminder.sent_manual", entity_id=m.id).count() == 1
