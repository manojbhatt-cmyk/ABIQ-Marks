"""The outside world in the demo: borrowers and Lincoln act as the clock advances.

Advancing the cycle day delivers what third parties would send that day: borrower
packages by email to the deal team (Q2) and Lincoln's drafts into Box (Q10). Lincoln works
loan by loan: a loan's first draft arrives LINCOLN_DRAFT_DAYS after its package is shared,
and a revision two days after a send-back (decision D34). ABIQ's watchers pick them up
exactly as they would in production. On each day the demo autopilot moves the loans that
are not being presented, each at its own pace.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from domain.models import AuditEvent, CycleLoan, ValuationCycle, ValuationDecision
from domain.services import cycle as cyc_svc
from domain.services import intake, lincoln
from domain.services.core import Actor
from synth import generator

LINCOLN_DRAFT_DAYS = 5  # Lincoln needs at least this many days after a loan's package is in Box
# Lincoln sends each loan's first draft around its kickoff deadline (Q10), a few days apart ("every few days")
LINCOLN_OFFSET = {"F-0001": -2, "F-0013": 0, "F-0015": 0, "F-0002": 1, "F-0003": 3}


def advance(session: Session, actor: Actor, cycle_id: str, to_day: int) -> list[str]:
    from domain.services.core import automated

    with automated():  # the outside world and the other loans, not the presenter
        return _advance(session, actor, cycle_id, to_day)


def _advance(session: Session, actor: Actor, cycle_id: str, to_day: int) -> list[str]:
    # Lock the cycle row: a second click (or a second tab) waits, then sees the new day, so no day's borrower
    # mail or Lincoln file is delivered twice.
    cyc = session.query(ValuationCycle).filter_by(id=cycle_id).with_for_update().populate_existing().one()
    if cyc.status == "draft":
        raise ValueError("Send the kickoff first")
    log: list[str] = []
    from synth import autopilot

    keep = autopilot.setting(session)
    for day in range(cyc.current_day + 1, min(to_day, 45) + 1):
        cyc_svc.move_clock(session, actor, cycle_id, day)
        n = generator.deliver_borrower_mail(day)
        if n:
            got = intake.process_inbox(session, cycle_id)
            log.append(f"{len(got)} borrower email(s) received and classified")
        intake.refresh_packages(session, cycle_id)
        if day in (8, 10):
            drafted = intake.draft_chases(session, cycle_id)
            if drafted:
                log.append(f"ABIQ drafted {len(drafted)} borrower chase(s) for the PM Team")
        due = [cl for cl, d in _lincoln_due(session, cycle_id) if d <= day]
        for cl in due:
            generator.deliver_lincoln_loan(cl.facility_id)
        if due:
            lincoln.ingest_lincoln(session, cycle_id)
            log.append(f"Lincoln sent draft marks for {', '.join(cl.borrower for cl in due)}")
        for d in _pending_send_backs(session, cycle_id, day):
            cl = session.get(CycleLoan, d.cycle_loan_id)
            current = lincoln.latest_valuation(session, cl.id).version
            if cl.facility_id == "F-0002" and current == 1:
                generator.deliver_lincoln(2)
            else:
                generator.deliver_revision(cl.facility_id, current + 1)
            lincoln.ingest_lincoln(session, cycle_id)
            log.append(f"Lincoln delivered a revised valuation for {cl.borrower}")
        if keep is not None:  # the loans not being presented do today's work
            log += autopilot.run(session, cycle_id, keep)
    from connectors import live_mail

    if live_mail.enabled():
        got = intake.process_inbox(session, cycle_id)
        if got:
            log.append(f"{len(got)} real email(s) received and classified")
    from domain.services import reminders

    sent = reminders.send_due(session, cycle_id)
    if sent:
        log.append(f"ABIQ sent {len(sent)} deadline reminder(s)")
    if not log:
        log.append("Nothing arrived from outside")
    return list(dict.fromkeys(log))


def next_event(session: Session, cycle_id: str) -> dict | None:
    """What the outside world does next, so the demo moves on without showing a clock.

    Returns the label for the button and the day the world has to reach for it to happen, or None when
    nothing outside is pending (everything waits on people in ABIQ).
    """
    cyc = session.get(ValuationCycle, cycle_id)
    if cyc is None or cyc.status != "open" or cyc.cycle_type != "quarterly":
        return None
    day = cyc.current_day
    mail_days = sorted(d for d in generator.mail_schedule() if d > day)
    if mail_days and mail_days[0] <= 10:
        return {"key": "borrowers", "to_day": 10, "label": "Borrowers send their packages",
                "detail": "Borrowers email their quarterly packages to the deal teams, PM Team copied. "
                          "ABIQ drafts reminders for anything missing."}
    if mail_days:
        return {"key": "chased", "to_day": max(mail_days[-1], day + 1), "label": "Late borrowers reply to the reminders",
                "detail": "The remaining documents arrive by email."}
    events = []
    due = _lincoln_due(session, cycle_id)
    if due:
        first = min(d for _, d in due)
        names = sorted(cl.borrower for cl, d in due if d == first)
        events.append({"key": "lincoln", "to_day": max(first, day + 1), "label": "Lincoln sends draft marks",
                       "detail": f"Lincoln's draft for {', '.join(names)} arrives in Box; ABIQ ingests it."})
    pending = [d for d in session.query(ValuationDecision).join(CycleLoan, CycleLoan.id == ValuationDecision.cycle_loan_id).filter(
        CycleLoan.cycle_id == cycle_id, ValuationDecision.outcome == "sent_back") if
        session.get(CycleLoan, d.cycle_loan_id).status == "waiting_on_lincoln"]
    if pending:
        names = sorted({session.get(CycleLoan, d.cycle_loan_id).borrower for d in pending})
        events.append({"key": "revision", "to_day": max(min((d.decided_day or 0) + 2 for d in pending), day + 1),
                       "label": "Lincoln sends the revised valuation",
                       "detail": f"Lincoln answers the send-back for {', '.join(names)}."})
    from synth import autopilot

    fixing = autopilot.waiting(session, cycle_id) if autopilot.setting(session) is not None else []
    if fixing:
        events.append({"key": "cmr_revision", "to_day": max(min(d for _, d in fixing), day + 1),
                       "label": "Analysts send the revised CMRs",
                       "detail": f"The Deal Team fixes the comments for {', '.join(sorted(b for b, _ in fixing))} "
                                 "and resubmits."})
    # Stop at the next kickoff deadline; everything due before it (Lincoln's drafts, revisions, the other loans'
    # work) happens on its own day on the way, so the presenter clicks once per deadline, not once per event.
    nxt = min(((d, step) for step, d in autopilot.deadlines(session, cycle_id).items() if d > day), default=None)
    if nxt:
        on_way = [e["label"] for e in sorted(events, key=lambda e: e["to_day"]) if e["to_day"] <= nxt[0]]
        label = on_way[0] if on_way else NEXT_LABEL.get(nxt[1], "The teams keep working")
        return {"key": "deadline", "to_day": nxt[0], "label": label,
                "detail": "; ".join(dict.fromkeys(on_way + [NEXT_LABEL.get(nxt[1], "")])).strip("; ")
                + ". The other loans keep working, each at its own pace."}
    return min(events, key=lambda e: e["to_day"]) if events else None


# What the teams deliver by each kickoff date, in plain words for the next-event button.
NEXT_LABEL = {
    "Q2": "Borrowers send their packages", "Q3": "Packages go to Lincoln", "Q4": "Analysts finish their spreads",
    "Q5": "Analysts submit their CMRs", "Q6": "A/C Managers review the CMRs", "Q7": "The PM Team reviews the CMRs",
    "Q8": "CMRs are filed", "Q9": "SCT reviews the CMRs", "Q10": "Lincoln sends draft marks",
    "Q11": "The marks tracker fills in", "Q12": "Lincoln's marks go into Everest",
    "Q13": "Lincoln's reports are copied to SharePoint", "Q14": "Deal Teams decide on Lincoln's marks",
    "Q15": "Approved marks go on the CMRs", "Q16": "Time to build the committee agenda",
    "Q17": "The committee pack goes out", "Q18": "The Valuation Committee meets", "Q19": "Time to reconcile",
    "Q20": "Written approval", "Q21": "Governance sign-off", "Q22": "Distribution",
}


def run_next_event(session: Session, actor: Actor, cycle_id: str) -> list[str]:
    ev = next_event(session, cycle_id)
    if not ev or not ev.get("to_day"):
        from synth import autopilot

        keep = autopilot.setting(session)
        return (autopilot.run(session, cycle_id, keep) if keep is not None else []) or ["Nothing is pending from outside"]
    return advance(session, actor, cycle_id, ev["to_day"])


def _lincoln_due(session: Session, cycle_id: str) -> list[tuple[CycleLoan, int]]:
    """Loans shared with Lincoln that have no draft yet, with the day Lincoln's first draft arrives."""
    from synth import autopilot

    out = []
    for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True):
        if (cl.valuation_method or "Lincoln") != "Lincoln" or lincoln.latest_valuation(session, cl.id):
            continue
        ev = session.query(AuditEvent).filter_by(cycle_loan_id=cl.id, action="lincoln_package.shared").order_by(
            AuditEvent.occurred_at).first()
        if ev:
            q10 = autopilot.deadlines(session, cycle_id).get("Q10", 0) + LINCOLN_OFFSET.get(cl.facility_id, 0)
            out.append((cl, max((ev.cycle_day or 0) + LINCOLN_DRAFT_DAYS, q10)))
    return out


def _pending_send_backs(session: Session, cycle_id: str, day: int):
    out = []
    for d in session.query(ValuationDecision).join(CycleLoan, CycleLoan.id == ValuationDecision.cycle_loan_id).filter(
            CycleLoan.cycle_id == cycle_id, ValuationDecision.outcome == "sent_back"):
        cl = session.get(CycleLoan, d.cycle_loan_id)
        if cl.status == "waiting_on_lincoln" and (d.decided_day or 0) + 2 <= day:
            out.append(d)
    return out
