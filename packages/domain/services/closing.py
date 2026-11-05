"""Finalise: reconciliation (Q19, A7), written approval (G2, Q20), governance sign-off (G3, Q21), distribution (Q22)."""
from __future__ import annotations

import hashlib
import json

from sqlalchemy.orm import Session

from agents.assistants import a7_explain
from agents.runtime import agent_run, step, suggest
from connectors import writeback
from connectors.mailbox import mailbox
from connectors.object_store import get_store
from connectors.warehouse import get_warehouse
from domain.models import (Approval, ApprovalRequest, AuditEvent, Cmr, CmrFile, CmrRecommendation, CommitteeDecision,
                           CycleLoan, Distribution, EmailMessage, GovernanceSignoff, MarksTrackerRow,
                           ReconciliationItem, ReconciliationRun, ValuationCycle)
from domain.pdf import BODY, H1, Spacer, build, grid, inch, para
from domain.services.core import (Actor, BusinessRuleError, audit, bump_loop, now, require, rule, users_by_role)
from domain.services.tracker import finalise_marks, recompute


def _eff_mark(r: MarksTrackerRow) -> float | None:
    return next((m for m in (r.final_mark, r.committee_mark, r.deal_team_mark) if m is not None), None)


def _fmt(v) -> str:
    return "" if v is None else (f"{v:.4f}".rstrip("0").rstrip(".") if isinstance(v, float) else str(v))


def run_reconciliation(session: Session, actor: Actor, cycle_id: str) -> ReconciliationRun:
    require(actor, "reconciliation.resolve")
    cyc = session.get(ValuationCycle, cycle_id)
    rows = {r.cycle_loan_id: r for r in recompute(session, cycle_id, "reconciliation")}
    wh = get_warehouse()
    pp = {r["FACILITY_ID"]: r for r in wh.query("select * from EVEREST.PRICING_PANEL where PERIOD = ?", [cyc.period])}
    rr = {r["FACILITY_ID"]: r for r in wh.query("select * from EVEREST.RISK_RATING where PERIOD = ?", [cyc.period])}
    sen = {r["FACILITY_ID"]: r["F"] for r in wh.query(
        "select FACILITY_ID, sum(FUNDED_AMOUNT) F from SENTRY.POSITION where AS_OF_DATE = ? group by FACILITY_ID",
        [cyc.day0_date])}
    tol = float(rule(session, "reconciliation.mark_tolerance", 0.0))
    checks = rule(session, "reconciliation.checks", [])
    n = session.query(ReconciliationRun).filter_by(cycle_id=cycle_id).count() + 1
    run = ReconciliationRun(cycle_id=cycle_id, run_no=n, started_at=now())
    session.add(run)
    session.flush()
    items = []
    for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).order_by(CycleLoan.facility_id):
        r = rows[cl.id]
        mark = _eff_mark(r)
        cmr = session.query(Cmr).filter_by(cycle_loan_id=cl.id).order_by(Cmr.version.desc()).first()
        block = (cmr.mark_block_json or {}) if cmr else {}
        cmr_mark = block.get("committee_mark") if block.get("committee_mark") is not None else block.get("mark")
        rec = session.query(CmrRecommendation).filter_by(cmr_id=cmr.id).first() if cmr else None
        cdec = session.query(CommitteeDecision).filter(CommitteeDecision.cycle_loan_id == cl.id,
                                                       CommitteeDecision.rating.isnot(None)).order_by(
            CommitteeDecision.recorded_at.desc()).first()
        cmr_rating = cdec.rating if cdec else (rec.proposed_rating if rec else None)
        candidates = {
            "mark_tracker_vs_everest": ("final_mark", "tracker", mark, "everest.pricing_panel",
                                        pp.get(cl.facility_id, {}).get("FINAL_MARK"), True),
            "rating_everest_vs_cmr": ("rating", "everest.risk_rating", rr.get(cl.facility_id, {}).get("RATING"),
                                      "cmr", cmr_rating, False),
            "funded_tracker_vs_sentry": ("funded_amount", "tracker", r.funded_amount, "sentry.position",
                                         sen.get(cl.facility_id), True),
            "mark_cmr_vs_tracker": ("mark", "cmr.mark_block", cmr_mark, "tracker", mark, True),
        }
        for code in checks:
            field, sa, va, sb, vb, numeric = candidates[code]
            if numeric:
                ok = va is not None and vb is not None and abs(float(va) - float(vb)) <= tol + 1e-9
            else:
                ok = va is not None and vb is not None and int(va) == int(vb)
            it = ReconciliationItem(run_id=run.id, cycle_loan_id=cl.id, check_code=code, field=field, source_a=sa,
                                    value_a=_fmt(va), source_b=sb, value_b=_fmt(vb), status="match" if ok else "mismatch")
            session.add(it)
            items.append(it)
    session.flush()
    mism = [i for i in items if i.status == "mismatch"]
    for i in mism:
        cl = session.get(CycleLoan, i.cycle_loan_id)
        hist = [{"action": e.action, "day": e.cycle_day, "actor": e.actor_user_id}
                for e in session.query(AuditEvent).filter_by(cycle_loan_id=cl.id).order_by(AuditEvent.occurred_at.desc())]
        with agent_run(session, "A7", "reconciliation_explainer", cycle_id=cycle_id, cycle_loan_id=cl.id,
                       input_summary=f"{cl.borrower} {i.check_code}") as arun:
            i.explanation = a7_explain({"check_code": i.check_code, "value_a": i.value_a, "value_b": i.value_b,
                                        "source_a": i.source_a, "source_b": i.source_b}, hist)
            i.explainer_agent_run_id = arun.id
            step(arun, "read_history", len(hist))
            suggest(session, arun, "explanation", "reconciliation_item", i.id, {"explanation": i.explanation}, 0.85)
    run.item_count, run.mismatch_count = len(items), len(mism)
    run.status = "clean" if not mism else "mismatches"
    if not mism:
        for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True):
            if cl.status in ("approved", "decided", "on_agenda", "reconciled"):
                cl.status, cl.current_step = "reconciled", "Q20"
    audit(session, actor, "reconciliation.run", "reconciliation_run", run.id, cycle_id=cycle_id,
          after={"run_no": n, "items": len(items), "mismatches": len(mism), "status": run.status})
    return run


def resolve_item(session: Session, actor: Actor, item_id: str, action: str, note: str = "") -> ReconciliationItem:
    require(actor, "reconciliation.resolve")
    it = session.get(ReconciliationItem, item_id)
    if it.status != "mismatch":
        raise BusinessRuleError("Only a mismatch can be resolved")
    cl = session.get(CycleLoan, it.cycle_loan_id)
    cyc = session.get(ValuationCycle, cl.cycle_id)
    if action == "corrected_target":
        if it.check_code == "mark_tracker_vs_everest":
            writeback.upsert(session, "EVEREST", "PRICING_PANEL", {"FACILITY_ID": cl.facility_id, "PERIOD": cyc.period},
                             {"FINAL_MARK": float(it.value_a)}, actor=actor.email,
                             tiq_entity_type="reconciliation_item", tiq_entity_id=it.id)
        elif it.check_code == "rating_everest_vs_cmr":
            writeback.upsert(session, "EVEREST", "RISK_RATING", {"FACILITY_ID": cl.facility_id, "PERIOD": cyc.period},
                             {"RATING": int(float(it.value_b))}, actor=actor.email,
                             tiq_entity_type="reconciliation_item", tiq_entity_id=it.id)
        else:
            raise BusinessRuleError("This check has no target to correct; explain it instead")
    elif action == "explained":
        if not note:
            raise BusinessRuleError("An explanation is required")
    elif action != "corrected_tracker":
        raise BusinessRuleError("Unknown resolution action")
    it.status, it.resolution_action, it.resolved_by, it.resolved_at = (
        "explained" if action == "explained" else "resolved"), action, actor.email, now()
    if note:
        it.explanation = (it.explanation or "") + f" Resolution note: {note}"
    audit(session, actor, "reconciliation.item_resolved", "reconciliation_item", it.id, cycle_id=cyc.id,
          cycle_loan_id=cl.id, before={"status": "mismatch", source_key(it): it.value_b},
          after={"action": action, "check": it.check_code, "value": it.value_a, "note": note})
    return it


def _cycle_loop(session: Session, cycle_id: str, code: str) -> None:
    """Cycle-wide loops (QD, QE) are counted once, on the cycle's first loan, so the dashboard sum is right."""
    first = session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).order_by(CycleLoan.facility_id).first()
    bump_loop(first, code)


def source_key(it: ReconciliationItem) -> str:
    return it.source_b


def schedule(session: Session, cycle_id: str) -> dict:
    rows = session.query(MarksTrackerRow).filter_by(cycle_id=cycle_id).order_by(MarksTrackerRow.facility_id).all()
    lines = []
    for r in rows:
        mark = _eff_mark(r)
        lines.append({"facility_id": r.facility_id, "borrower": r.borrower, "funded": r.funded_amount,
                      "previous_mark": r.previous_mark, "mark": mark,
                      "value": round((r.funded_amount or 0) * (mark or 0) / 100, 4), "rating": r.current_rating,
                      "watchlist": r.watchlist_flag})
    total = round(sum(l["value"] for l in lines), 4)
    prev = round(sum(r.previous_value or 0 for r in rows), 4)
    story = [l for l in lines if l["facility_id"] in ("F-0001", "F-0002", "F-0003")]
    return {"lines": lines, "total": total, "previous_total": prev, "delta": round(total - prev, 4),
            "story_total": round(sum(l["value"] for l in story), 4),
            "story_previous": round(sum(r.previous_value or 0 for r in rows if r.facility_id in ("F-0001", "F-0002", "F-0003")), 4)}


def changes_since_committee(session: Session, cycle_id: str) -> list[dict]:
    out = []
    for r in session.query(MarksTrackerRow).filter_by(cycle_id=cycle_id):
        if r.committee_mark is not None and r.deal_team_mark is not None and r.committee_mark != r.deal_team_mark:
            out.append({"borrower": r.borrower, "facility_id": r.facility_id, "from": r.deal_team_mark,
                        "to": r.committee_mark})
    return out


def request_approval(session: Session, actor: Actor, cycle_id: str) -> ApprovalRequest:
    require(actor, "approval.request")
    last = session.query(ReconciliationRun).filter_by(cycle_id=cycle_id).order_by(ReconciliationRun.run_no.desc()).first()
    if not last or last.status != "clean":
        raise BusinessRuleError("Reconciliation must be clean before requesting written approval")
    cyc = session.get(ValuationCycle, cycle_id)
    sch = schedule(session, cycle_id)
    changes = changes_since_committee(session, cycle_id)
    chair = users_by_role(session, "committee_chair")[0]
    body = (f"Dear {chair.display_name},\n\nPlease approve the {cyc.period} final marks schedule: {len(sch['lines'])} "
            f"loans, total value ${sch['total']:,.3f}M (change ${sch['delta']:+,.3f}M).\n\nChanges since the committee:\n"
            + ("\n".join(f"- {c['borrower']}: {c['from']:.2f} to {c['to']:.2f}" for c in changes) or "- none")
            + "\n\nPM Team")
    from domain.services.messaging import post

    m = post(session, actor, [chair.email], f"{cyc.period} final marks: request for written approval", body,
             kind="approval_request", link="/approvals", cycle_id=cycle_id)
    req = ApprovalRequest(cycle_id=cycle_id, kind="final_marks", schedule_json=sch, changes_json=changes,
                          sent_email_message_id=m.id, requested_by=actor.email, requested_at=now(), status="pending")
    session.add(req)
    session.flush()
    audit(session, actor, "approval_request.sent", "approval_request", req.id, cycle_id=cycle_id,
          after={"total": sch["total"], "changes": changes, "to": chair.email})
    return req


def decide_approval(session: Session, actor: Actor, request_id: str, decision: str, comments: str = "") -> Approval:
    require(actor, "approval.decide")
    req = session.get(ApprovalRequest, request_id)
    if req.status != "pending":
        raise BusinessRuleError("This request is already decided")
    cyc = session.get(ValuationCycle, req.cycle_id)
    if decision == "rejected" and not comments:
        raise BusinessRuleError("Comments are required to reject")
    ap = Approval(approval_request_id=req.id, approver_user_id=actor.email, decision=decision, comments=comments,
                  decided_at=now())
    session.add(ap)
    req.status = decision
    if decision == "approved":
        finalise_marks(session, req.cycle_id)
        sch = req.schedule_json
        pdf = build([para(f"{cyc.period} final marks: written approval", H1),
                     para(f"Requested by {req.requested_by} on {req.requested_at:%d %b %Y %H:%M}. Approved by "
                          f"{actor.name or actor.email} on {ap.decided_at:%d %b %Y %H:%M}. {comments}", BODY), Spacer(1, 6),
                     grid([["Facility", "Borrower", "Funded", "Mark", "Value"]]
                          + [[l["facility_id"], l["borrower"], f"{l['funded']:.1f}", f"{l['mark']:.2f}",
                              f"{l['value']:.3f}"] for l in sch["lines"]]
                          + [["Total", "", "", "", f"{sch['total']:.3f}"]],
                          [0.9 * inch, 2.4 * inch, 1 * inch, 1 * inch, 1.2 * inch], font_size=7.5)],
                    title="Final marks approval", footer="Approval evidence")
        path = f"Approvals/{cyc.period}/final-marks-approval.pdf"
        get_store().put("onedrive", path, pdf)
        from domain.services.tracker import export_xlsx

        get_store().put("onedrive", f"Approvals/{cyc.period}/final-marks-schedule-v1.xlsx", export_xlsx(session, cyc.id))
        ap.evidence_path = path
        for cl in session.query(CycleLoan).filter_by(cycle_id=cyc.id, in_scope=True):
            cl.current_step = "Q21"
    else:
        _cycle_loop(session, cyc.id, "QD")
        for cl in session.query(CycleLoan).filter_by(cycle_id=cyc.id, in_scope=True):
            cl.current_step = "Q19"
    audit(session, actor, "approval.recorded", "approval", ap.id, cycle_id=cyc.id,
          after={"decision": decision, "comments": comments, "evidence": ap.evidence_path})
    return ap


def governance(session: Session, actor: Actor, cycle_id: str, decision: str, reasons: str = "") -> GovernanceSignoff:
    require(actor, "governance.sign")
    cyc = session.get(ValuationCycle, cycle_id)
    req = session.query(ApprovalRequest).filter_by(cycle_id=cycle_id, kind="final_marks", status="approved").first()
    if not req:
        raise BusinessRuleError("Written approval (G2) is required before governance sign-off")
    sch = schedule(session, cycle_id)
    h = hashlib.sha256(json.dumps(sch["lines"], sort_keys=True, default=str).encode()).hexdigest()
    ap = session.query(Approval).filter_by(approval_request_id=req.id).first()
    g = GovernanceSignoff(cycle_id=cycle_id, signed_by=actor.email, signed_at=now(), schedule_hash=h,
                          evidence_path=ap.evidence_path if ap else None, status=decision, return_reasons=reasons or None)
    session.add(g)
    session.flush()
    if decision == "signed":
        sid = f"GOV-{cyc.period}"
        writeback.upsert(session, "EVEREST", "GOVERNANCE_SIGNOFF", {"SIGNOFF_ID": sid},
                         {"PERIOD": cyc.period, "CYCLE_TYPE": "quarterly", "SIGNED_BY": actor.email,
                          "SIGNED_AT": g.signed_at.isoformat(timespec="seconds")[:19], "SCHEDULE_HASH": h,
                          "SCHEDULE_DOC_REF": f"onedrive/{g.evidence_path}", "NOTES": "Signed in TIQ"},
                         actor=actor.email, tiq_entity_type="governance_signoff", tiq_entity_id=g.id)
        g.everest_signoff_id = sid
        for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True):
            cl.status, cl.current_step = "final", "Q22"
            cmr = session.query(Cmr).filter_by(cycle_loan_id=cl.id).order_by(Cmr.version.desc()).first()
            if cmr:
                cmr.status = "final"
        audit(session, actor, "everest.governance_written", "governance_signoff", g.id, cycle_id=cycle_id,
              after={"signoff_id": sid, "hash": h})
    else:
        if not reasons:
            raise BusinessRuleError("Reasons are required to return the schedule")
        req.status = "returned"
        for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True):
            cl.current_step = "Q19"
            cl.status = "decided" if cl.status == "reconciled" else cl.status
        _cycle_loop(session, cycle_id, "QE")
    audit(session, actor, "governance_signoff.recorded", "governance_signoff", g.id, cycle_id=cycle_id,
          after={"status": decision, "reasons": reasons, "hash": h})
    return g


GROUPS = {"finance": ["wes.finance@ab-poc.local", "justin.finance@ab-poc.local"],
          "investor_relations": ["ir@ab-poc.local"]}


def distribute(session: Session, actor: Actor, cycle_id: str) -> list[Distribution]:
    require(actor, "distribution.send")
    cyc = session.get(ValuationCycle, cycle_id)
    if not session.query(GovernanceSignoff).filter_by(cycle_id=cycle_id, status="signed").first():
        raise BusinessRuleError("Governance sign-off (G3) is required before distribution")
    sch = schedule(session, cycle_id)
    files = [f for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True)
             for c in [session.query(Cmr).filter_by(cycle_loan_id=cl.id).order_by(Cmr.version.desc()).first()] if c
             for f in [session.query(CmrFile).filter_by(cmr_id=c.id).order_by(CmrFile.version.desc()).first()] if f]
    teams = sorted({e for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True)
                    for e in (cl.lead_email, cl.analyst_email)})
    out = []
    for group, to in {**GROUPS, "deal_teams": teams}.items():
        body = (f"Hello {group.replace('_', ' ').title()},\n\nThe {cyc.period} marks are final. Portfolio value "
                f"${sch['total']:,.3f}M (change ${sch['delta']:+,.3f}M). {len(files)} final CMRs are in SharePoint.\n\nPM Team")
        from domain.services.messaging import post

        m = post(session, actor, to, f"{cyc.period} final CMRs and marks", body, kind="distribution",
                 link="/distribution", cycle_id=cycle_id,
                 attachments=[{"store": "sharepoint", "path": f.pdf_path, "name": f.pdf_path.split("/")[-1]} for f in files])
        d = Distribution(cycle_id=cycle_id, recipient_group=group, recipients_json=to,
                         document_ids=[f.pdf_path for f in files], sent_at=now(), email_message_id=m.id)
        session.add(d)
        out.append(d)
        audit(session, actor, "distribution.sent", "distribution", m.id, cycle_id=cycle_id,
              after={"group": group, "recipients": to, "documents": len(files)})
    cyc.status, cyc.closed_at, cyc.final_portfolio_value = "closed", now(), sch["total"]
    audit(session, actor, "cycle.closed", "valuation_cycle", cyc.id, cycle_id=cycle_id,
          after={"final_value": sch["total"], "delta": sch["delta"], "story_final": sch["story_total"]})
    return out


def reconciliation_view(session: Session, cycle_id: str) -> dict:
    runs = session.query(ReconciliationRun).filter_by(cycle_id=cycle_id).order_by(ReconciliationRun.run_no).all()
    last = runs[-1] if runs else None
    items = []
    if last:
        for i in session.query(ReconciliationItem).filter_by(run_id=last.id):
            cl = session.get(CycleLoan, i.cycle_loan_id)
            items.append({"id": i.id, "borrower": cl.borrower, "facility_id": cl.facility_id, "check": i.check_code,
                          "field": i.field, "source_a": i.source_a, "value_a": i.value_a, "source_b": i.source_b,
                          "value_b": i.value_b, "status": i.status, "explanation": i.explanation,
                          "resolution": i.resolution_action, "resolved_by": i.resolved_by})
    items.sort(key=lambda x: (x["status"] == "match", x["facility_id"]))
    return {"runs": [{"id": r.id, "run_no": r.run_no, "status": r.status, "items": r.item_count,
                      "mismatches": r.mismatch_count} for r in runs], "items": items,
            "schedule": schedule(session, cycle_id)}


def approvals_view(session: Session, cycle_id: str) -> dict:
    reqs = session.query(ApprovalRequest).filter_by(cycle_id=cycle_id).order_by(ApprovalRequest.requested_at).all()
    gov = session.query(GovernanceSignoff).filter_by(cycle_id=cycle_id).order_by(GovernanceSignoff.signed_at).all()
    dist = session.query(Distribution).filter_by(cycle_id=cycle_id).all()
    return {"requests": [{"id": r.id, "kind": r.kind, "status": r.status, "schedule": r.schedule_json,
                          "changes": r.changes_json, "requested_by": r.requested_by,
                          "requested_at": r.requested_at.isoformat(),
                          "approvals": [{"approver": a.approver_user_id, "decision": a.decision, "comments": a.comments,
                                         "decided_at": a.decided_at.isoformat(), "evidence": a.evidence_path}
                                        for a in session.query(Approval).filter_by(approval_request_id=r.id)]}
                         for r in reqs],
            "governance": [{"status": g.status, "signed_by": g.signed_by, "signed_at": g.signed_at.isoformat(),
                            "hash": g.schedule_hash, "evidence": g.evidence_path, "everest_id": g.everest_signoff_id,
                            "reasons": g.return_reasons} for g in gov],
            "distribution": [{"group": d.recipient_group, "recipients": d.recipients_json, "documents": d.document_ids,
                              "sent_at": d.sent_at.isoformat()} for d in dist],
            "schedule": schedule(session, cycle_id), "changes": changes_since_committee(session, cycle_id)}
