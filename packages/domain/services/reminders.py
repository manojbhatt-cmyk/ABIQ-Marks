"""Deadline reminders inside ABIQ (decision D26).

Automatic: when the demo clock moves, every open step whose deadline is within `reminder.lead_days`
sends its owner one notification per threshold (days left, due today, overdue), so nobody is spammed.
Manual: the PM Team can remind a person, or everyone on a step, with an editable note. Every manual
reminder is an in-platform message and is audited. Reminders never change any state of the loan.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from domain.models import CycleLoan, Notification, ValuationCycle
from domain.services.core import Actor, BusinessRuleError, audit, notify, require, rule, users_by_role
from domain.services.cycle import deadlines, step_index
from domain.services.work import STEP_NAMES

# Who owns each step. Deal Team, A/C Manager are per loan; the rest are roles.
OWNER = {"Q2": "deal_team", "Q3": "pm_team", "Q4": "analyst", "Q5": "analyst", "Q6": "ac_manager",
         "Q7": "pm_team", "Q8": "pm_team", "Q9": "sct", "Q10": "lincoln", "Q11": "pm_team", "Q12": "pm_team",
         "Q13": "pm_team", "Q14": "deal_team", "Q15": "analyst", "Q16": "pm_team", "Q17": "pm_team",
         "Q18": "committee_chair", "Q19": "pm_team", "Q20": "committee_chair", "Q21": "governance", "Q22": "pm_team"}
DONE = ("final",)


def owners(session: Session, cl: CycleLoan | None, step: str) -> list[str]:
    o = OWNER.get(step, "pm_team")
    if cl is not None and o == "deal_team":
        return [cl.analyst_email, cl.lead_email]
    if cl is not None and o == "analyst":
        return [cl.analyst_email]
    if cl is not None and o == "ac_manager" and cl.ac_manager_email:
        return [cl.ac_manager_email]
    return [u.email for u in users_by_role(session, o if o not in ("deal_team", "analyst", "ac_manager") else "pm_team")]


def open_steps(cl: CycleLoan) -> list[str]:
    """The steps a loan still waits on: one per track before Gate 1, then the loan's own step."""
    if cl.status in DONE:
        return []
    if step_index(cl.current_step) >= step_index("Q14"):
        return [cl.current_step]
    out = []
    if cl.dt_step and cl.dt_step != "Q13":
        out.append(cl.dt_step)
    if cl.lincoln_step and step_index("Q10") <= step_index(cl.lincoln_step) < step_index("Q13") \
            and step_index(cl.dt_step) >= step_index("Q3"):
        out.append(cl.lincoln_step)
    return out


def status(session: Session, cycle_id: str) -> list[dict]:
    """Every open step with its owner and days left, most urgent first. Steps from Q16 are cycle-wide."""
    cyc = session.get(ValuationCycle, cycle_id)
    if cyc is None or cyc.status in ("draft", "closed"):
        return []
    dl = deadlines(session, cycle_id)
    rows: dict[tuple, dict] = {}
    for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).order_by(CycleLoan.facility_id):
        for step in open_steps(cl):
            d = dl.get(step)
            if d is None:
                continue
            per_loan = step_index(step) < step_index("Q16")
            key = (step, cl.id if per_loan else None)
            r = rows.setdefault(key, {"step": step, "step_name": STEP_NAMES.get(step, step),
                                      "cycle_loan_id": cl.id if per_loan else None,
                                      "loan": cl.borrower if per_loan else None, "loans": [],
                                      "owners": owners(session, cl if per_loan else None, step),
                                      "due_day": d.due_day, "due_date": d.due_date.isoformat(),
                                      "days_left": d.due_day - cyc.current_day})
            r["loans"].append(cl.borrower)
    return sorted(rows.values(), key=lambda r: (r["days_left"], step_index(r["step"])))


def threshold(days_left: int, lead: int) -> str | None:
    if days_left < 0:
        return "overdue"
    if days_left == 0:
        return "due_today"
    if days_left <= lead:
        return "due_soon"
    return None


def title_for(r: dict, th: str) -> str:
    what = f"{r['step']} {r['step_name']}" + (f" for {r['loan']}" if r["loan"] else "")
    if th == "overdue":
        n = -r["days_left"]
        return f"Overdue by {n} day{'s' if n != 1 else ''}: {what}"
    if th == "due_today":
        return f"Due today: {what}"
    n = r["days_left"]
    return f"{n} day{'s' if n != 1 else ''} left to complete {what}"


def send_due(session: Session, cycle_id: str) -> list[str]:
    """Send the automatic reminders that are due now; returns the titles sent. Idempotent per threshold."""
    lead = int(rule(session, "reminder.lead_days", 2))
    cyc = session.get(ValuationCycle, cycle_id)
    sent = []
    for r in status(session, cycle_id):
        th = threshold(r["days_left"], lead)
        if th is None:
            continue
        entity = f"{r['cycle_loan_id'] or cycle_id}:{r['step']}:{th}"
        if session.query(Notification).filter_by(kind="deadline_reminder", entity_id=entity).first():
            continue
        title = title_for(r, th)
        body = f"Due Day {r['due_day']} ({r['due_date']}). " + (
            f"Loans: {', '.join(r['loans'])}." if not r["loan"] else "Open the loan to continue.")
        link = f"/loans/{r['cycle_loan_id']}" if r["cycle_loan_id"] else "/work"
        notify(session, r["owners"], "deadline_reminder", title, body, entity_type="deadline", entity_id=entity,
               cycle_id=cyc.id, link=link)
        sent.append(title)
    session.flush()
    return sent


def send_manual(session: Session, actor: Actor, cycle_id: str, *, step: str, cycle_loan_id: str | None = None,
                to: list[str] | None = None, note: str = "") -> dict:
    """PM Team reminds a person or everyone on a step. An in-platform message, audited."""
    require(actor, "cycle.manage")
    cl = session.get(CycleLoan, cycle_loan_id) if cycle_loan_id else None
    if cycle_loan_id and (cl is None or cl.cycle_id != cycle_id):
        raise BusinessRuleError("Unknown loan for this cycle")
    if step not in STEP_NAMES:
        raise BusinessRuleError(f"Unknown step {step}")
    recipients = [e for e in (to or owners(session, cl, step)) if e]
    if not recipients:
        raise BusinessRuleError("Nobody to remind for this step")
    d = deadlines(session, cycle_id).get(step)
    what = f"{step} {STEP_NAMES[step]}" + (f" for {cl.borrower}" if cl else "")
    subject = f"Reminder from the PM Team: {what}"
    body = (note.strip() or f"A reminder to complete {what}.") + (
        f"\n\nDeadline: Day {d.due_day} ({d.due_date:%a %d %b %Y})." if d else "")
    from domain.services.messaging import post

    m = post(session, actor, recipients, subject, body, kind="manual_reminder",
             link=f"/loans/{cl.id}" if cl else "/work", cycle_id=cycle_id,
             entity_type="cycle_loan" if cl else "valuation_cycle", entity_id=cl.id if cl else cycle_id)
    audit(session, actor, "reminder.sent_manual", "message", m.id, cycle_id=cycle_id,
          after={"step": step, "loan": cl.facility_id if cl else None, "to": recipients})
    return {"id": m.id, "to": m.recipients, "subject": subject}
