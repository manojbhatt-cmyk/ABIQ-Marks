"""Mark lineage (S21) and Ask TIQ (S20, A9): read-only views over the audit trail and records."""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from agents.runtime import agent_run, rewrite, step
from domain.models import (AgendaTestResult, Approval, ApprovalRequest, AuditEvent, Cmr, CmrFile, CmrReview,
                           CommitteeDecision, CycleLoan, Distribution, Document, DocumentChunk, FinancialSpread,
                           GovernanceSignoff, LincolnValuation, ReconciliationItem, ValuationCycle, ValuationDecision)
from domain.services.core import Actor

ORDER = ["documents", "spread", "cmr", "lincoln", "g1", "agenda", "committee", "reconciliation", "approval",
         "governance", "distribution"]


def lineage(session: Session, cycle_loan_id: str) -> dict:
    cl = session.get(CycleLoan, cycle_loan_id)
    nodes = []

    def add(kind, title, who, when, detail, entity_type, entity_id, badge=None):
        nodes.append({"kind": kind, "title": title, "who": who, "when": when.isoformat() if when else None,
                      "detail": detail, "entity_type": entity_type, "entity_id": entity_id, "badge": badge})

    for d in session.query(Document).filter_by(cycle_id=cl.cycle_id, borrower_id=cl.borrower_id, store="uploads"):
        add("documents", d.file_name, d.doc_type_confirmed_by or "TIQ (A0, auto)", d.created_at,
            f"{d.doc_type} ({(d.doc_type_confidence or 0):.2f})", "document", d.id)
    for s in session.query(FinancialSpread).filter_by(cycle_loan_id=cl.id).order_by(FinancialSpread.version):
        add("spread", f"Spread v{s.version} ({s.status})", s.approved_by or "TIQ (A1 proposal)", s.approved_at or s.created_at,
            f"Everest {s.written_back_spread_id or 'not written'}", "financial_spread", s.id)
    for c in session.query(Cmr).filter_by(cycle_loan_id=cl.id):
        for rv in session.query(CmrReview).filter_by(cmr_id=c.id).order_by(CmrReview.created_at):
            if rv.outcome:
                add("cmr", f"CMR review: {rv.stage} {rv.outcome}", rv.reviewer_user_id, rv.decided_at,
                    f"loop {rv.loop_no}", "cmr_review", rv.id, "QB" if rv.outcome == "sent_back" else None)
        for f in session.query(CmrFile).filter_by(cmr_id=c.id).order_by(CmrFile.version):
            add("cmr", f"CMR v{f.version} filed", f.filed_by, f.filed_at, f"sharepoint/{f.pdf_path}", "cmr_file", f.id)
    for lv in session.query(LincolnValuation).filter_by(cycle_loan_id=cl.id).order_by(LincolnValuation.version):
        add("lincoln", f"Lincoln v{lv.version}: {lv.point_estimate:.2f} ({lv.range_low:.2f} to {lv.range_high:.2f})",
            "Lincoln (extracted by A4)", lv.received_at, lv.key_assumptions, "lincoln_valuation", lv.id,
            "QC" if lv.version > 1 else None)
    for d in session.query(ValuationDecision).filter_by(cycle_loan_id=cl.id).order_by(ValuationDecision.decided_at):
        add("g1", f"G1 {d.outcome.replace('_', ' ')}" + (f" {d.approved_mark:.2f}" if d.approved_mark else ""),
            d.decided_by, d.decided_at, d.note or d.rationale or "", "valuation_decision", d.id,
            "QA" if d.outcome == "sent_back" else None)
    run = session.query(AgendaTestResult.run_id).filter_by(cycle_loan_id=cl.id).order_by(AgendaTestResult.created_at.desc()).first()
    if run:
        hits = [t.test_code for t in session.query(AgendaTestResult).filter_by(cycle_loan_id=cl.id, run_id=run[0], result=True)]
        first = session.query(AgendaTestResult).filter_by(cycle_loan_id=cl.id, run_id=run[0]).first()
        add("agenda", "Agenda tests: " + (", ".join(hits) if hits else "not on agenda"), "rules engine",
            first.created_at, "assumed rules", "agenda_test_result", run[0])
    for d in session.query(CommitteeDecision).filter_by(cycle_loan_id=cl.id).order_by(CommitteeDecision.recorded_at):
        add("committee", f"Committee {d.outcome}" + (f" {d.decided_mark:.2f}" if d.decided_mark else ""), d.recorded_by,
            d.recorded_at, d.rationale or "", "committee_decision", d.id, "QF" if d.outcome == "send_back" else None)
    for i in session.query(ReconciliationItem).filter_by(cycle_loan_id=cl.id).filter(
            ReconciliationItem.status.in_(["mismatch", "resolved", "explained"])):
        add("reconciliation", f"Reconciliation {i.check_code}: {i.value_a} vs {i.value_b} ({i.status})",
            i.resolved_by or "reconciliation run", i.resolved_at or i.created_at,
            f"{i.resolution_action or ''} {i.explanation or ''}".strip(), "reconciliation_item", i.id)
    for r in session.query(ApprovalRequest).filter_by(cycle_id=cl.cycle_id, kind="final_marks"):
        for a in session.query(Approval).filter_by(approval_request_id=r.id):
            add("approval", f"Written approval {a.decision}", a.approver_user_id, a.decided_at,
                f"onedrive/{a.evidence_path}" if a.evidence_path else a.comments, "approval", a.id)
    for g in session.query(GovernanceSignoff).filter_by(cycle_id=cl.cycle_id):
        add("governance", f"Governance {g.status}", g.signed_by, g.signed_at, f"Everest {g.everest_signoff_id}",
            "governance_signoff", g.id)
    for d in session.query(Distribution).filter_by(cycle_id=cl.cycle_id):
        add("distribution", f"Distributed to {d.recipient_group.replace('_', ' ')}", "PM Team", d.sent_at,
            f"{len(d.recipients_json or [])} recipients", "distribution", d.id)
    nodes.sort(key=lambda n: (ORDER.index(n["kind"]), n["when"] or ""))
    return {"loan": {"id": cl.id, "borrower": cl.borrower, "facility_id": cl.facility_id, "team": cl.team_name,
                     "loops": cl.loop_counts_json or {}}, "nodes": nodes}


def audit_events(session: Session, cycle_id: str | None = None, cycle_loan_id: str | None = None,
                 entity_id: str | None = None, limit: int = 300) -> list[dict]:
    q = session.query(AuditEvent)
    if cycle_loan_id:
        q = q.filter_by(cycle_loan_id=cycle_loan_id)
    elif cycle_id:
        q = q.filter_by(cycle_id=cycle_id)
    if entity_id:
        q = q.filter_by(entity_id=entity_id)
    return [{"id": e.id, "at": e.occurred_at.isoformat(), "day": e.cycle_day, "actor": e.actor_user_id,
             "role": e.actor_role, "action": e.action, "entity_type": e.entity_type, "entity_id": e.entity_id,
             "before": e.before_json, "after": e.after_json, "agent_run_id": e.agent_run_id}
            for e in q.order_by(AuditEvent.occurred_at.desc()).limit(limit)]


# ---------------- A9 Ask TIQ ----------------

def ask(session: Session, actor: Actor, cycle_id: str, question: str) -> dict:
    """Read-only answers with citations built by code from the records used. TIQ cannot take actions."""
    q = question.lower()
    if re.search(r"\b(approve|send back|change the mark|set the rating|sign off|email)\b", q) and q.startswith(("please", "can you", "approve", "send")):
        return {"answer": "TIQ cannot take actions. Use the Pricing Panel (S10), the Committee screen (S13) or "
                          "Approvals (S15) to do this.", "citations": []}
    loans = session.query(CycleLoan).filter_by(cycle_id=cycle_id).all()
    cl = next((c for c in loans if c.borrower and c.borrower.split()[0].lower() in q), None)
    with agent_run(session, "A9", "ask_tiq", cycle_id=cycle_id, cycle_loan_id=cl.id if cl else None,
                   input_summary=question) as run:
        citations: list[dict] = []
        if cl is None:
            hits = _search(session, cycle_id, q)
            step(run, "search_documents", len(hits))
            answer = ("I could not tell which loan you mean. Closest passages: " +
                      " | ".join(h["text"][:160] for h in hits[:3])) if hits else \
                "I could not find that in this cycle's records."
            citations = [{"type": "document", "id": h["document_id"], "label": f"{h['file']} p.{h['page']}"} for h in hits[:3]]
            return {"answer": answer, "citations": citations}
        step(run, "load_loan", cl.facility_id)
        parts = []
        lvs = session.query(LincolnValuation).filter_by(cycle_loan_id=cl.id).order_by(LincolnValuation.version).all()
        decs = session.query(ValuationDecision).filter_by(cycle_loan_id=cl.id).order_by(ValuationDecision.decided_at).all()
        cds = session.query(CommitteeDecision).filter_by(cycle_loan_id=cl.id).order_by(CommitteeDecision.recorded_at).all()
        if "agenda" in q:
            run_id = session.query(AgendaTestResult.run_id).filter_by(cycle_loan_id=cl.id).order_by(
                AgendaTestResult.created_at.desc()).first()
            if run_id:
                hits = [t for t in session.query(AgendaTestResult).filter_by(cycle_loan_id=cl.id, run_id=run_id[0], result=True)]
                parts.append(f"{cl.borrower} is {'on' if hits else 'not on'} the agenda"
                             + (": " + ", ".join(t.test_code.replace('_', ' ') for t in hits) if hits else "") + ".")
                citations.append({"type": "agenda_test_result", "id": run_id[0], "label": "Agenda test run"})
        if lvs:
            hist = ", then ".join(f"v{v.version} {v.point_estimate:.2f} ({v.valuation_date:%d %b})" for v in lvs)
            parts.append(f"Lincoln's draft marks: {hist}.")
            citations += [{"type": "lincoln_valuation", "id": v.id, "label": f"Lincoln v{v.version} report"} for v in lvs]
        cyc = session.get(ValuationCycle, cycle_id)
        from domain.services.core import cycle_date

        def when(d):
            return f"{cycle_date(cyc, d.decided_day):%d %b}" if d.decided_day is not None else f"{d.decided_at:%d %b}"

        for d in decs:
            if d.outcome == "sent_back":
                parts.append(f"The Deal Team sent v{session.get(LincolnValuation, d.lincoln_valuation_id).version} back on "
                             f"{when(d)} ({d.decided_by}): {d.note}")
            else:
                parts.append(f"G1: {d.outcome.replace('_', ' ')} at {d.approved_mark:.2f} by {d.decided_by} on "
                             f"{when(d)}{(': ' + d.rationale) if d.rationale else ''}.")
            citations.append({"type": "valuation_decision", "id": d.id, "label": f"G1 decision {d.decided_at:%d %b}"})
        for c in cds:
            parts.append(f"Committee: {c.outcome} at {c.decided_mark if c.decided_mark is not None else 'n/a'}"
                         f"{(' because ' + c.rationale) if c.rationale else ''}.")
            citations.append({"type": "committee_decision", "id": c.id, "label": "Committee decision"})
        if "why" in q or "what changed" in q:
            for h in _search(session, cycle_id, "sponsor equity commitment", facility_id=cl.facility_id)[:1]:
                citations.append({"type": "document", "id": h["document_id"], "label": f"{h['file']} p.{h['page']}"})
        if not parts:
            parts.append(f"{cl.borrower} is at step {cl.current_step} with status {cl.status.replace('_', ' ')}.")
        answer = rewrite(run, " ".join(parts), "Answer the question in plain words using only these facts: " + question)
        run.output_summary = answer[:300]
    return {"answer": answer, "citations": citations, "loan": cl.facility_id,
            "footer": "TIQ cannot take actions"}


def _search(session: Session, cycle_id: str, q: str, facility_id: str | None = None) -> list[dict]:
    terms = [t for t in re.findall(r"[a-z]{4,}", q.lower())]
    if not terms:
        return []
    res = []
    query = session.query(DocumentChunk, Document).join(Document, Document.id == DocumentChunk.document_id).filter(
        Document.cycle_id == cycle_id)
    if facility_id:
        query = query.filter(Document.facility_id == facility_id)
    for ch, doc in query.limit(3000):
        text = (ch.text or "").lower()
        score = sum(text.count(t) for t in terms)
        if score:
            res.append({"score": score, "document_id": doc.id, "file": doc.file_name, "page": ch.page_no, "text": ch.text})
    return sorted(res, key=lambda r: -r["score"])[:5]


__all__ = ["lineage", "audit_events", "ask", "ValuationCycle"]
