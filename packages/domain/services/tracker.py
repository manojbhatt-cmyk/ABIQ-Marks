"""Marks tracker (Q11, Q14, Q16, Q19): derived from its sources on every change, never hand-edited."""
from __future__ import annotations

import io

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from sqlalchemy.orm import Session

from agents.assistants import a6_impact
from agents.runtime import agent_run, rewrite, step, suggest
from connectors.mailbox import mailbox
from domain.models import (AgendaTestResult, AgentSuggestion, Cmr, CmrRecommendation, CommitteeAgendaItem,
                           CommitteeDecision, CycleLoan, EmailMessage, ImpactSummary, LincolnValuation,
                           MarksTrackerRow, ValuationCycle, ValuationDecision)
from domain.services.core import SYSTEM, Actor, BusinessRuleError, audit, now, require, rule


def _latest(session, model, cycle_loan_id, order):
    return session.query(model).filter_by(cycle_loan_id=cycle_loan_id).order_by(order.desc()).first()


def recompute(session: Session, cycle_id: str, source: str = "recompute") -> list[MarksTrackerRow]:
    rows = []
    cyc = session.get(ValuationCycle, cycle_id)
    for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True):
        r = session.query(MarksTrackerRow).filter_by(cycle_id=cycle_id, cycle_loan_id=cl.id).first()
        if r is None:
            r = MarksTrackerRow(cycle_id=cycle_id, cycle_loan_id=cl.id)
            session.add(r)
        lv = _latest(session, LincolnValuation, cl.id, LincolnValuation.version)
        dec = session.query(ValuationDecision).filter(ValuationDecision.cycle_loan_id == cl.id,
                                                      ValuationDecision.outcome != "sent_back").order_by(
            ValuationDecision.decided_at.desc()).first()
        cdec = session.query(CommitteeDecision).filter(CommitteeDecision.cycle_loan_id == cl.id,
                                                       CommitteeDecision.outcome.in_(["approve", "change"])).order_by(
            CommitteeDecision.recorded_at.desc()).first()
        cmr = _latest(session, Cmr, cl.id, Cmr.version)
        rec = session.query(CmrRecommendation).filter_by(cmr_id=cmr.id).first() if cmr else None
        f = cl.funded_amount or 0
        r.facility_id, r.borrower, r.deal_team, r.funded_amount = cl.facility_id, cl.borrower, cl.team_name, f
        r.previous_mark = cl.previous_mark
        r.lincoln_draft_mark = lv.point_estimate if lv else None
        r.lincoln_range_low, r.lincoln_range_high = (lv.range_low, lv.range_high) if lv else (None, None)
        r.lincoln_version = lv.version if lv else None
        # A send-back since the last approval means the Deal Team mark is open again.
        reopened = cl.status in ("waiting_on_lincoln", "sent_back") and dec is not None
        r.deal_team_mark = None if reopened or not dec else dec.approved_mark
        r.committee_mark = cdec.decided_mark if cdec else None
        r.previous_value = round(f * (cl.previous_mark or 0) / 100, 4)
        r.draft_value = round(f * r.lincoln_draft_mark / 100, 4) if r.lincoln_draft_mark is not None else None
        current = next((m for m in (r.final_mark, r.committee_mark, r.deal_team_mark, r.lincoln_draft_mark)
                        if m is not None), None)
        r.current_value = round(f * current / 100, 4) if current is not None else None
        r.final_value = round(f * r.final_mark / 100, 4) if r.final_mark is not None else None
        r.delta_value = round((r.current_value if r.current_value is not None else r.previous_value) - r.previous_value, 4)
        r.previous_rating = cl.previous_rating
        r.current_rating = (cdec.rating if cdec and cdec.rating else None) or (rec.proposed_rating if rec else None) \
            or cl.previous_rating
        wl_action = (cdec.watchlist_action if cdec and cdec.watchlist_action else None) or (rec.watchlist_action if rec else None)
        r.watchlist_flag = (wl_action in ("add", "keep")) if wl_action else bool(cl.previous_watchlist)
        r.waiver_status = (cdec.waiver_decision if cdec and cdec.waiver_decision else None) or (
            "requested" if rec and rec.waiver_requested else "none")
        r.status = cl.status
        r.agenda_flag = cl.on_agenda
        latest_run = session.query(AgendaTestResult.run_id).filter_by(cycle_loan_id=cl.id).order_by(
            AgendaTestResult.created_at.desc()).first()
        r.agenda_reasons_json = [t.test_code for t in session.query(AgendaTestResult).filter_by(
            cycle_loan_id=cl.id, run_id=latest_run[0], result=True)] if latest_run else []
        r.last_updated_from = source
        rows.append(r)
    session.flush()
    _ = cyc
    return rows


def finalise_marks(session: Session, cycle_id: str) -> None:
    """Called at written approval (G2): the final mark is the committee mark or the Deal Team mark."""
    for r in session.query(MarksTrackerRow).filter_by(cycle_id=cycle_id):
        r.final_mark = r.committee_mark if r.committee_mark is not None else r.deal_team_mark
    recompute(session, cycle_id, "approval")


def tracker_view(session: Session, cycle_id: str) -> dict:
    rows = session.query(MarksTrackerRow).filter_by(cycle_id=cycle_id).order_by(MarksTrackerRow.facility_id).all()
    prev = sum(r.previous_value or 0 for r in rows)
    cur = sum((r.current_value if r.current_value is not None else r.previous_value or 0) for r in rows)
    impacts = session.query(ImpactSummary).filter_by(cycle_id=cycle_id).order_by(ImpactSummary.version).all()
    story = [r for r in rows if r.facility_id in ("F-0001", "F-0002", "F-0003")]
    return {
        "kpis": {"previous": round(prev, 4), "current": round(cur, 4), "delta": round(cur - prev, 4),
                 "draft_marks": sum(1 for r in rows if r.lincoln_draft_mark is not None),
                 "on_agenda": sum(1 for r in rows if r.agenda_flag),
                 "story_previous": round(sum(r.previous_value or 0 for r in story), 4),
                 "story_current": round(sum((r.current_value if r.current_value is not None else r.previous_value or 0)
                                            for r in story), 4)},
        "rows": [row_dict(r) for r in rows],
        "impacts": [{"id": i.id, "version": i.version, "delta": i.delta, "previous": i.portfolio_previous_value,
                     "current": i.portfolio_current_value, "body": i.body_text, "sent_to": i.sent_to,
                     "sent_at": i.sent_at.isoformat() if i.sent_at else None, "drivers": i.drivers_json}
                    for i in impacts],
        "recipients": rule(session, "impact.recipients", []),
    }


def row_dict(r: MarksTrackerRow) -> dict:
    return {c: getattr(r, c) for c in (
        "id", "cycle_loan_id", "facility_id", "borrower", "deal_team", "funded_amount", "previous_mark",
        "lincoln_draft_mark", "lincoln_range_low", "lincoln_range_high", "lincoln_version", "deal_team_mark",
        "committee_mark", "final_mark", "previous_value", "draft_value", "current_value", "final_value", "delta_value",
        "previous_rating", "current_rating", "watchlist_flag", "waiver_status", "status", "agenda_flag",
        "agenda_reasons_json", "last_updated_from")}


def draft_impact(session: Session, actor: Actor, cycle_id: str) -> ImpactSummary:
    require(actor, "tracker.send")
    rows = recompute(session, cycle_id, "impact")
    cyc = session.get(ValuationCycle, cycle_id)
    prev = sum(r.previous_value or 0 for r in rows)
    cur = sum((r.current_value if r.current_value is not None else r.previous_value) for r in rows)
    drivers = sorted([{"borrower": r.borrower, "facility_id": r.facility_id, "previous_mark": r.previous_mark,
                       "current_mark": next(m for m in (r.final_mark, r.committee_mark, r.deal_team_mark,
                                                        r.lincoln_draft_mark, r.previous_mark) if m is not None),
                       "delta": r.delta_value,
                       "source": "committee" if r.committee_mark is not None else (
                           f"Deal Team (Lincoln v{r.lincoln_version})" if r.deal_team_mark is not None else
                           f"Lincoln draft v{r.lincoln_version}")}
                      for r in rows if abs(r.delta_value or 0) >= 0.005], key=lambda d: d["delta"])
    version = session.query(ImpactSummary).filter_by(cycle_id=cycle_id).count() + 1
    with agent_run(session, "A6", "impact_narrator", cycle_id=cycle_id, input_summary=f"impact v{version}") as run:
        body = a6_impact(prev, cur, drivers, version, cyc.period)
        body = rewrite(run, body, "Keep it as a short email.")
        step(run, "narrate", {"drivers": len(drivers)})
        imp = ImpactSummary(cycle_id=cycle_id, version=version, portfolio_previous_value=round(prev, 4),
                            portfolio_current_value=round(cur, 4), delta=round(cur - prev, 4), drivers_json=drivers,
                            body_text=body, drafted_by_agent_run_id=run.id)
        session.add(imp)
        session.flush()
        suggest(session, run, "narrative", "impact_summary", imp.id, {"body": body}, 0.9)
    audit(session, actor, "impact_summary.drafted", "impact_summary", imp.id, cycle_id=cycle_id,
          after={"version": version, "delta": imp.delta}, agent_run_id=run.id)
    return imp


def send_impact(session: Session, actor: Actor, impact_id: str, body: str | None = None) -> ImpactSummary:
    require(actor, "tracker.send")
    imp = session.get(ImpactSummary, impact_id)
    if imp.sent_at:
        raise BusinessRuleError("This impact note was already sent")
    cyc = session.get(ValuationCycle, imp.cycle_id)
    to = rule(session, "impact.recipients", [])
    edited = body is not None and body != imp.body_text
    imp.body_text = body or imp.body_text
    subject = f"{cyc.period} marks: early value impact (v{imp.version})"
    msg_id, path = mailbox.send(actor.email, to, subject, imp.body_text)
    m = EmailMessage(direction="out", message_id=msg_id, thread_id=msg_id, from_addr=actor.email, to_addrs=to,
                     subject=subject, body_text=imp.body_text, sent_at=now(), template_code="impact_summary",
                     cycle_id=cyc.id, cycle_day=cyc.current_day, eml_path=path, status="sent")
    session.add(m)
    session.flush()
    imp.sent_to, imp.sent_at, imp.email_message_id = to, now(), m.id
    sug = session.query(AgentSuggestion).filter_by(target_entity_type="impact_summary", target_entity_id=imp.id).first()
    if sug:
        sug.status, sug.decided_by, sug.decided_at = ("edited" if edited else "accepted"), actor.email, now()
    for cl in session.query(CycleLoan).filter_by(cycle_id=cyc.id, in_scope=True):
        if cl.lincoln_step == "Q11":
            cl.lincoln_step = "Q12"
    audit(session, actor, "impact_summary.sent", "impact_summary", imp.id, cycle_id=cyc.id,
          after={"version": imp.version, "to": to, "delta": imp.delta, "edited": edited})
    return imp


COLUMNS = [("Borrower", "borrower"), ("Facility", "facility_id"), ("Deal Team", "deal_team"),
           ("Funded Amount", "funded_amount"), ("Previous Mark", "previous_mark"),
           ("Lincoln Draft", "lincoln_draft_mark"), ("Range Low", "lincoln_range_low"),
           ("Range High", "lincoln_range_high"), ("Lincoln Version", "lincoln_version"),
           ("Deal Team Mark", "deal_team_mark"), ("Committee Mark", "committee_mark"), ("Final Mark", "final_mark"),
           ("Previous Value", "previous_value"), ("Current Value", "current_value"), ("Delta", "delta_value"),
           ("Previous Rating", "previous_rating"), ("Rating", "current_rating"), ("Watchlist", "watchlist_flag"),
           ("Waiver", "waiver_status"), ("Status", "status"), ("Agenda", "agenda_flag"),
           ("Agenda Reasons", "agenda_reasons_json")]


def export_xlsx(session: Session, cycle_id: str) -> bytes:
    cyc = session.get(ValuationCycle, cycle_id)
    wb = Workbook()
    ws = wb.active
    ws.title = f"Marks {cyc.period}"
    ws.append([c for c, _ in COLUMNS])
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="183850")
    for r in session.query(MarksTrackerRow).filter_by(cycle_id=cycle_id).order_by(MarksTrackerRow.facility_id):
        vals = []
        for _, attr in COLUMNS:
            v = getattr(r, attr)
            vals.append(", ".join(v) if isinstance(v, list) else ("Yes" if v is True else "No" if v is False else v))
        ws.append(vals)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def agenda_items_for(session: Session, cycle_loan_id: str) -> list[CommitteeAgendaItem]:
    return session.query(CommitteeAgendaItem).filter_by(cycle_loan_id=cycle_loan_id).all()


__all__ = ["recompute", "tracker_view", "draft_impact", "send_impact", "export_xlsx", "finalise_marks", "SYSTEM"]
