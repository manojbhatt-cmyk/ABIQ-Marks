"""The outside world in the demo: borrowers and Lincoln act as the clock advances.

Advancing the cycle day delivers what third parties would send that day: borrower
packages by email to the deal team (Q2) and Lincoln's drafts into Box (Q10, from day
20; a revision two days after a send-back). TIQ's watchers pick them up exactly as they
would in production. Every internal step stays with the people in the UI.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from domain.models import CycleLoan, Document, LincolnPackage, ValuationCycle, ValuationDecision
from domain.services import cycle as cyc_svc
from domain.services import intake, lincoln
from domain.services.core import Actor
from synth import generator

LINCOLN_V1_DAY = 20


def advance(session: Session, actor: Actor, cycle_id: str, to_day: int) -> list[str]:
    cyc = session.get(ValuationCycle, cycle_id)
    if cyc.status == "draft":
        raise ValueError("Send the kickoff first")
    log: list[str] = []
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
                log.append(f"TIQ drafted {len(drafted)} borrower chase(s) for the PM Team")
        if day >= LINCOLN_V1_DAY and not _has_v1(session, cycle_id) and not _shared(session, cycle_id):
            log.append(f"Lincoln is waiting for every package to be shared in Box before drafting")
        if day >= LINCOLN_V1_DAY and _shared(session, cycle_id) and not _has_v1(session, cycle_id):
            generator.deliver_lincoln(1)
            got = lincoln.ingest_lincoln(session, cycle_id)
            log.append(f"Lincoln delivered draft marks for {len(got)} loans to Box")
        for d in _pending_send_backs(session, cycle_id, day):
            cl = session.get(CycleLoan, d.cycle_loan_id)
            current = lincoln.latest_valuation(session, cl.id).version
            if cl.facility_id == "F-0002" and current == 1:
                generator.deliver_lincoln(2)
            else:
                generator.deliver_revision(cl.facility_id, current + 1)
            lincoln.ingest_lincoln(session, cycle_id)
            log.append(f"Lincoln delivered a revised valuation for {cl.borrower}")
    from connectors import live_mail

    if live_mail.enabled():
        got = intake.process_inbox(session, cycle_id)
        if got:
            log.append(f"{len(got)} real email(s) received and classified")
    from synth import autopilot

    keep = autopilot.setting(session)
    if keep is not None:
        log += autopilot.run(session, cycle_id, keep)
    from domain.services import reminders

    sent = reminders.send_due(session, cycle_id)
    if sent:
        log.append(f"TIQ sent {len(sent)} deadline reminder(s)")
    if not log:
        log.append("Nothing arrived from outside")
    return list(dict.fromkeys(log))


def next_event(session: Session, cycle_id: str) -> dict | None:
    """What the outside world does next, so the demo moves on without showing a clock.

    Returns the label for the button and the day the world has to reach for it to happen, or None when
    nothing outside is pending (everything waits on people in TIQ).
    """
    cyc = session.get(ValuationCycle, cycle_id)
    if cyc is None or cyc.status != "open" or cyc.cycle_type != "quarterly":
        return None
    day = cyc.current_day
    mail_days = sorted(d for d in generator.mail_schedule() if d > day)
    if mail_days and mail_days[0] <= 10:
        return {"key": "borrowers", "to_day": 10, "label": "Borrowers send their packages",
                "detail": "Borrowers email their quarterly packages to the deal teams, PM Team copied. "
                          "TIQ drafts reminders for anything missing."}
    if mail_days:
        return {"key": "chased", "to_day": max(mail_days[-1], day + 1), "label": "Late borrowers reply to the reminders",
                "detail": "The remaining documents arrive by email."}
    if not _has_v1(session, cycle_id):
        if not _shared(session, cycle_id):
            return {"key": "waiting", "to_day": None, "label": "Lincoln is waiting for the packages",
                    "detail": "Lincoln drafts once every package is shared (Lincoln Exchange)."}
        return {"key": "lincoln", "to_day": max(LINCOLN_V1_DAY, day + 1), "label": "Lincoln sends draft marks",
                "detail": "Lincoln's draft marks and reports arrive in Box; TIQ ingests them."}
    pending = [d for d in session.query(ValuationDecision).join(CycleLoan, CycleLoan.id == ValuationDecision.cycle_loan_id).filter(
        CycleLoan.cycle_id == cycle_id, ValuationDecision.outcome == "sent_back") if
        session.get(CycleLoan, d.cycle_loan_id).status == "waiting_on_lincoln"]
    if pending:
        names = sorted({session.get(CycleLoan, d.cycle_loan_id).borrower for d in pending})
        return {"key": "revision", "to_day": max(max((d.decided_day or 0) + 2 for d in pending), day + 1),
                "label": "Lincoln sends the revised valuation", "detail": f"Lincoln answers the send-back for {', '.join(names)}."}
    return None


def run_next_event(session: Session, actor: Actor, cycle_id: str) -> list[str]:
    ev = next_event(session, cycle_id)
    if not ev or not ev.get("to_day"):
        from synth import autopilot

        keep = autopilot.setting(session)
        return (autopilot.run(session, cycle_id, keep) if keep is not None else []) or ["Nothing is pending from outside"]
    return advance(session, actor, cycle_id, ev["to_day"])


def _shared(session: Session, cycle_id: str) -> bool:
    """Lincoln drafts once every in-scope package is in its Box folder."""
    loans = [cl for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True)
             if (cl.valuation_method or "Lincoln") == "Lincoln"]
    return bool(loans) and all(session.query(LincolnPackage).filter_by(cycle_loan_id=cl.id).first() for cl in loans)


def _has_v1(session: Session, cycle_id: str) -> bool:
    return session.query(Document).filter_by(cycle_id=cycle_id, doc_type="lincoln_marks").count() > 0


def _pending_send_backs(session: Session, cycle_id: str, day: int):
    out = []
    for d in session.query(ValuationDecision).join(CycleLoan, CycleLoan.id == ValuationDecision.cycle_loan_id).filter(
            CycleLoan.cycle_id == cycle_id, ValuationDecision.outcome == "sent_back"):
        cl = session.get(CycleLoan, d.cycle_loan_id)
        if cl.status == "waiting_on_lincoln" and (d.decided_day or 0) + 2 <= day:
            out.append(d)
    return out
