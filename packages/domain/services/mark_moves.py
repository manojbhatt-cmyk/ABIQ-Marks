"""Mark Move Monitor (A10): flags a loan whose mark moved a lot against last quarter, as soon as a mark arrives.

Deterministic, no model: move = new mark / previous mark - 1. A move of `mark_move.warn_threshold` (5 percent) or
more is a warning; `agenda.mark_move_threshold` (10 percent, the same rule as the committee agenda test) or more is
an alert. It runs when Lincoln's draft arrives, when the Deal Team approves a different mark at Gate 1 and when the
committee changes a mark. The flag only informs: it notifies the Deal Team and the PM Team and is audited; people
decide what to do with it.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from agents.runtime import agent_run, step
from domain.models import AuditEvent, CycleLoan, MarksTrackerRow
from domain.services.core import Actor, audit, notify, rule, users_by_role

SOURCES = {"lincoln_draft": "Lincoln's draft", "gate1": "the Gate 1 mark", "committee": "the committee's mark"}
SYSTEM = Actor("system@tiq", "system", "ABIQ Mark Move Monitor")


def thresholds(session: Session) -> tuple[float, float]:
    return (float(rule(session, "mark_move.warn_threshold", 0.05)),
            float(rule(session, "agenda.mark_move_threshold", 0.10)))


def assess(session: Session, previous: float | None, mark: float | None) -> dict | None:
    """The move and its level (None, 'warning' or 'alert'); None when there is nothing to compare."""
    if mark is None or not previous:
        return None
    warn, alert = thresholds(session)
    move = mark / previous - 1
    level = "alert" if abs(move) >= alert - 1e-9 else ("warning" if abs(move) >= warn - 1e-9 else None)
    return {"previous": previous, "mark": mark, "move": round(move, 4), "level": level, "warn": warn, "alert": alert}


def current(session: Session, row: MarksTrackerRow) -> dict | None:
    """The move of the loan's latest mark (committee, else Gate 1, else Lincoln's draft) against last quarter."""
    mark = next((m for m in (row.committee_mark, row.deal_team_mark, row.lincoln_draft_mark) if m is not None), None)
    return assess(session, row.previous_mark, mark)


def check(session: Session, cl: CycleLoan, mark: float | None, source: str) -> dict | None:
    """Flag a large move once per loan, source and mark. Returns the flag when one was raised."""
    a = assess(session, cl.previous_mark, mark)
    if not a or not a["level"]:
        return None
    for ev in session.query(AuditEvent).filter_by(cycle_loan_id=cl.id, action="mark_move.flagged"):
        if (ev.after_json or {}).get("source") == source and abs((ev.after_json or {}).get("mark", 0) - mark) < 1e-9:
            return None
    flag = {**a, "source": source, "facility_id": cl.facility_id}
    with agent_run(session, "A10", "mark_move_monitor", cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
                   input_summary=f"{cl.facility_id} {source} {mark}") as run:
        step(run, "compare_with_previous_mark", flag)
    pct = f"{a['move'] * 100:+.1f} percent"
    title = (f"{cl.borrower}: mark {'moved' if a['level'] == 'alert' else 'moving'} {pct} "
             f"({a['previous']:.2f} to {mark:.2f})")
    what = SOURCES.get(source, source)
    body = (f"{what[0].upper() + what[1:]} for {cl.borrower} is {mark:.2f} against {a['previous']:.2f} "
            f"last quarter ({pct}). " + (
                f"That is beyond the {a['alert'] * 100:.0f} percent agenda threshold, so the loan is likely to go to "
                "the Valuation Committee. Check the drivers before Gate 1." if a["level"] == "alert" else
                f"That is above the {a['warn'] * 100:.0f} percent warning level; worth a look before Gate 1."))
    to = [cl.lead_email, cl.analyst_email] + [u.email for u in users_by_role(session, "pm_team")]
    notify(session, [e for e in dict.fromkeys(to) if e], "mark_move", title, body, entity_type="cycle_loan",
           entity_id=cl.id, cycle_id=cl.cycle_id, link="/tracker")
    audit(session, SYSTEM, "mark_move.flagged", "cycle_loan", cl.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after=flag, agent_run_id=run.id)
    return flag
