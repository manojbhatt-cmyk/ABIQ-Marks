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
            log.append(f"Day {day}: {len(got)} borrower email(s) received and classified")
        intake.refresh_packages(session, cycle_id)
        if day in (8, 10):
            drafted = intake.draft_chases(session, cycle_id)
            if drafted:
                log.append(f"Day {day}: TIQ drafted {len(drafted)} borrower chase(s) for the PM Team")
        if day >= LINCOLN_V1_DAY and not _has_v1(session, cycle_id) and not _shared(session, cycle_id):
            log.append(f"Day {day}: Lincoln is waiting for every package to be shared in Box before drafting")
        if day >= LINCOLN_V1_DAY and _shared(session, cycle_id) and not _has_v1(session, cycle_id):
            generator.deliver_lincoln(1)
            got = lincoln.ingest_lincoln(session, cycle_id)
            log.append(f"Day {day}: Lincoln delivered draft marks for {len(got)} loans to Box")
        for d in _pending_send_backs(session, cycle_id, day):
            cl = session.get(CycleLoan, d.cycle_loan_id)
            current = lincoln.latest_valuation(session, cl.id).version
            if cl.facility_id == "F-0002" and current == 1:
                generator.deliver_lincoln(2)
            else:
                generator.deliver_revision(cl.facility_id, current + 1)
            lincoln.ingest_lincoln(session, cycle_id)
            log.append(f"Day {day}: Lincoln delivered a revised valuation for {cl.borrower}")
    if not log:
        log.append(f"Moved to day {session.get(ValuationCycle, cycle_id).current_day}; nothing arrived from outside")
    return log


def _shared(session: Session, cycle_id: str) -> bool:
    """Lincoln drafts once every in-scope package is in its Box folder."""
    loans = session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).all()
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
