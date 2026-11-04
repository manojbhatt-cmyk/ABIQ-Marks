"""Evaluation harness (Master Spec section 2.3 measures; Agentic AI Spec section 16).

Runs against the current database after `synth play` and the generator's ground truth.
"""
from __future__ import annotations

import json

from sqlalchemy import func
from sqlalchemy.orm import Session

from domain.config import REPO_ROOT
from domain.models import (AgendaTestResult, AgentRun, AgentSuggestion, AuditEvent, CmrSection, Cmr, CycleLoan,
                           Document, EvalResult, FinancialSpread, ReconciliationItem, ReconciliationRun, SpreadLineItem)

INPUT_LINES = ["REVENUE", "COGS", "OPEX", "REPORTED_EBITDA", "CASH", "TOTAL_DEBT", "INTEREST_EXPENSE_LTM"]
DECISION_ACTIONS = ["valuation_decision.approved", "valuation_decision.sent_back", "committee_decision.recorded",
                    "approval.recorded", "governance_signoff.recorded", "spread.approved", "cmr.recommendation_set",
                    "monthly_decision.recorded"]


def _gt() -> tuple[dict, dict]:
    base = REPO_ROOT / "local-data" / "ground_truth"
    return json.loads((base / "spreads.json").read_text()), json.loads((base / "expected.json").read_text())


def run_all(session: Session) -> dict:
    spreads_gt, expected = _gt()
    res: dict[str, dict] = {}

    # A1 spreading: agent's proposed value (before any human edit) vs ground truth, per template line
    by_fac = {}
    from synth.portfolio import borrowers

    for b in borrowers():
        for f in b.facilities:
            by_fac[f.facility_id] = spreads_gt[b.borrower_id]["spread"]
    total = right = 0
    misses = []
    for sp in session.query(FinancialSpread).filter(FinancialSpread.version == 1):
        lines = {l.line_code: l for l in session.query(SpreadLineItem).filter_by(spread_id=sp.id, period_type="quarter")}
        for code in INPUT_LINES:
            total += 1
            li = lines.get(code)
            ok = li is not None and li.proposed_value is not None and abs(li.proposed_value - by_fac[sp.facility_id][code]) < 0.051
            right += ok
            if not ok:
                misses.append(f"{sp.facility_id}:{code}")
    res["A1.spreading_accuracy"] = {"component": "A1", "value": round(right / total, 4) if total else None,
                                    "detail": {"right": right, "total": total, "misses": misses[:30], "target": 0.95}}

    # A0 classification
    exp_types = {name: t for b in spreads_gt.values() for name, t in b["classifications"].items()}
    tot = ok = 0
    for d in session.query(Document).filter_by(store="uploads"):
        if d.file_name in exp_types:
            tot += 1
            ok += (d.doc_type == exp_types[d.file_name])
    auto = session.query(AgentSuggestion).join(AgentRun, AgentRun.id == AgentSuggestion.agent_run_id).filter(
        AgentRun.component == "A0").all()
    res["A0.classification_accuracy"] = {"component": "A0", "value": round(ok / tot, 4) if tot else None,
                                         "detail": {"right": ok, "total": tot,
                                                    "below_threshold": sum(1 for s in auto if (s.confidence or 0) < 0.8)}}

    # Agenda tests: agreement with hand-computed results
    agree = tot = 0
    wrong = []
    for cl in session.query(CycleLoan).filter_by(in_scope=True):
        last = session.query(AgendaTestResult.run_id).filter_by(cycle_loan_id=cl.id).order_by(
            AgendaTestResult.created_at.desc()).first()
        if not last:
            continue
        got = sorted(t.test_code for t in session.query(AgendaTestResult).filter_by(cycle_loan_id=cl.id, run_id=last[0], result=True))
        want = sorted(expected["agenda"].get(cl.facility_id, []))
        tot += 1
        agree += got == want
        if got != want:
            wrong.append({"facility": cl.facility_id, "got": got, "want": want})
    res["rules.agenda_agreement"] = {"component": "rules", "value": round(agree / tot, 4) if tot else None,
                                     "detail": {"agree": agree, "total": tot, "wrong": wrong}}

    # Reconciliation: seeded mismatches found, zero false positives (first run)
    first = session.query(ReconciliationRun).order_by(ReconciliationRun.created_at).first()
    if first:
        mism = [(session.get(CycleLoan, i.cycle_loan_id).facility_id, i.check_code)
                for i in session.query(ReconciliationItem).filter_by(run_id=first.id, status="mismatch")]
        mism += [(session.get(CycleLoan, i.cycle_loan_id).facility_id, i.check_code)
                 for i in session.query(ReconciliationItem).filter_by(run_id=first.id).filter(
                     ReconciliationItem.status.in_(["resolved", "explained"]))]
        seeded = {(m["facility_id"], m["check"]) for m in expected["reconciliation_mismatches"]}
        found = seeded & set(mism)
        res["recon.seeded_found"] = {"component": "rules", "value": len(found) / len(seeded),
                                     "detail": {"false_positives": sorted(set(mism) - seeded)}}

    # A5 challenge quality on Harbor
    harbor = session.query(CycleLoan).filter_by(facility_id="F-0002").first()
    ch = session.query(AgentSuggestion).filter_by(kind="challenge", target_entity_id=harbor.id).first() if harbor else None
    text = json.dumps(ch.payload_json) if ch else ""
    res["A5.harbor_case"] = {"component": "A5", "value": float("55 / 16 = 3.4x" in text and "northgate" in text.lower()),
                             "detail": {"cites_letter": "northgate" in text.lower(), "math": "55 / 16 = 3.4x" in text}}

    # A2 kept-sentence ratio on the three demo loans
    ratios = [s.kept_sentence_ratio for s in session.query(CmrSection).join(Cmr, Cmr.id == CmrSection.cmr_id).filter(
        Cmr.facility_id.in_(["F-0001", "F-0002", "F-0003"]), CmrSection.kept_sentence_ratio.isnot(None))]
    res["A2.kept_sentence_ratio"] = {"component": "A2", "value": round(sum(ratios) / len(ratios), 4) if ratios else None,
                                     "detail": {"sections": len(ratios), "target": 0.6}}

    # Cost per loan and autonomy
    cost = session.query(func.sum(AgentRun.cost_usd)).scalar() or 0.0
    loans = session.query(CycleLoan).filter_by(in_scope=True).count() or 1
    res["cost.per_loan_usd"] = {"component": "all", "value": round(cost / loans, 4), "detail": {"target": 2.0}}
    agent_decisions = session.query(AuditEvent).filter(AuditEvent.action.in_(DECISION_ACTIONS),
                                                       AuditEvent.actor_role.in_(["system", "agent"])).count()
    res["autonomy.agent_decisions"] = {"component": "all", "value": agent_decisions, "detail": {"target": 0}}

    for metric, r in res.items():
        session.add(EvalResult(component=r["component"], eval_set="synthetic-2026-Q3", metric=metric, value=r["value"],
                               detail_json=r["detail"]))
    session.flush()
    return {k: {"value": v["value"], **v["detail"]} for k, v in res.items()}
