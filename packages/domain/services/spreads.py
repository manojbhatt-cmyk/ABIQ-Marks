"""Spreading (Q4): run A1, review cells and add-backs, metrics and covenant tests, A11, approve."""
from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from agents.a1_spreading import DocInput, propose
from agents.assistants import a11_check_certificate
from agents.runtime import agent_run, step, suggest
from connectors import writeback
from connectors.warehouse import get_warehouse
from domain import metrics as M
from domain.models import (AgentSuggestion, Adjustment, CovenantTest, CycleLoan, Document, DocumentPage,
                           DocumentTable, FinancialSpread, Metric, SpreadLineItem, ValuationCycle)
from domain.services.core import Actor, BusinessRuleError, audit, now, require, rule
from domain.services.cycle import refresh_step, step_index
from domain.services.intake import loan_documents
from pipeline.parse import ParsedDoc, ParsedTable


def current_spread(session: Session, cycle_loan_id: str) -> FinancialSpread | None:
    return session.query(FinancialSpread).filter_by(cycle_loan_id=cycle_loan_id).filter(
        FinancialSpread.status != "superseded").order_by(FinancialSpread.version.desc()).first()


def _parsed(session: Session, doc: Document) -> ParsedDoc:
    pages = [(p.page_no, p.text, p.has_text_layer) for p in
             session.query(DocumentPage).filter_by(document_id=doc.id).order_by(DocumentPage.page_no)]
    tables = [ParsedTable(t.page_no, t.table_index, t.caption, t.header_json, t.rows_json) for t in
              session.query(DocumentTable).filter_by(document_id=doc.id).order_by(DocumentTable.table_index)]
    return ParsedDoc(pages=pages, tables=tables)


def run_spreading(session: Session, actor: Actor, cycle_loan_id: str, instructions: str = "") -> FinancialSpread:
    require(actor, "spread.edit")
    cl = session.get(CycleLoan, cycle_loan_id)
    require(actor, "spread.edit", team=cl.deal_team_id)
    docs = [d for d in loan_documents(session, cl) if d.doc_type == "financial_statements"]
    if not docs:
        raise BusinessRuleError("No financial statements received for this loan")
    prev = current_spread(session, cl.id)
    if prev and prev.status == "approved":
        raise BusinessRuleError("The spread is already approved; supersede it with a reason first")
    version = 1 + session.query(FinancialSpread).filter_by(cycle_loan_id=cl.id).count()
    if prev:
        prev.status = "superseded"
    with agent_run(session, "A1", "spreading_agent", cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
                   input_summary=f"{cl.borrower}: {', '.join(d.file_name for d in docs)} {instructions}") as run:
        result = propose([DocInput(d.id, d.file_name, _parsed(session, d)) for d in docs],
                         log=lambda name, detail=None: step(run, name, detail))
        sp = FinancialSpread(cycle_loan_id=cl.id, facility_id=cl.facility_id, period_end=date(2026, 9, 30),
                             version=version, status="proposed", proposed_by_agent_run_id=run.id,
                             source_document_ids=[d.id for d in docs], not_found_lines=result["not_found"],
                             created_by=actor.email)
        session.add(sp)
        session.flush()
        for ln in result["lines"]:
            session.add(SpreadLineItem(spread_id=sp.id, line_code=ln["line_code"], period_type=ln["period_type"],
                                       value=ln["value"], proposed_value=ln["value"], confidence=ln["confidence"],
                                       evidence_json=ln["evidence"], source_label=ln["source_label"]))
        allow = rule(session, "spread.addback_allowlist", [])
        for a in result["adjustments"]:
            session.add(Adjustment(spread_id=sp.id, adj_type=a["adj_type"], amount=a["amount"],
                                   description=a["description"], allowed=a["adj_type"] in allow,
                                   evidence_json=a["evidence"], proposed_by="agent", accepted=None))
        session.flush()
        suggest(session, run, "spread", "financial_spread", sp.id,
                {"lines": len(result["lines"]), "adjustments": len(result["adjustments"]),
                 "not_found": result["not_found"], "self_check": result["self_check"]},
                round(sum(l["confidence"] for l in result["lines"]) / max(1, len(result["lines"])), 3))
        run.output_summary = f"{len(result['lines'])} values, {len(result['adjustments'])} add-backs, " \
                             f"not found: {result['not_found'] or 'none'}"
    recompute_metrics(session, sp)
    cl.deal_team_track_status, cl.status = "spreading", "in_progress"
    if step_index(cl.dt_step) < step_index("Q4"):
        cl.dt_step = "Q4"
    refresh_step(cl)
    audit(session, actor, "spread.proposed", "financial_spread", sp.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after={"version": version, "lines": len(result["lines"]), "not_found": result["not_found"]},
          agent_run_id=sp.proposed_by_agent_run_id)
    return sp


def _values(session: Session, sp: FinancialSpread) -> dict:
    return {(l.line_code, l.period_type): l.value for l in session.query(SpreadLineItem).filter_by(spread_id=sp.id)}


def recompute_metrics(session: Session, sp: FinancialSpread) -> dict:
    cl = session.get(CycleLoan, sp.cycle_loan_id)
    accepted = sum(a.amount for a in session.query(Adjustment).filter_by(spread_id=sp.id, accepted=True))
    pending = sum(a.amount for a in session.query(Adjustment).filter_by(spread_id=sp.id, accepted=None)
                  if a.allowed)
    # Proposed allow-listed add-backs count in the preview until a person rejects them.
    undrawn = sum(r["U"] or 0 for r in get_warehouse().reference(
        "select sum(p.UNFUNDED_AMOUNT) U from SENTRY.POSITION p join DEALCLOUD.FACILITY f on f.FACILITY_ID = p.FACILITY_ID "
        "where f.DEAL_ID = ? and f.FACILITY_TYPE = 'revolver' and p.AS_OF_DATE = cast('2026-09-30' as date)", [cl.deal_id]))
    res = M.compute(_values(session, sp), {"quarter": accepted + pending}, revolver_undrawn=undrawn)
    session.query(Metric).filter_by(spread_id=sp.id).delete()
    session.query(CovenantTest).filter_by(spread_id=sp.id).delete()
    for code, m in res.items():
        session.add(Metric(spread_id=sp.id, line_code=code, value=m["value"], formula_text=m["formula"],
                           inputs_json=m["inputs"]))
    for cov in get_warehouse().reference("select * from DEALCLOUD.COVENANT where FACILITY_ID = ?", [cl.facility_id]):
        t = M.covenant_test(res, cov)
        session.add(CovenantTest(spread_id=sp.id, covenant_id=cov["COVENANT_ID"], covenant_type=cov["COVENANT_TYPE"], **t))
        if cov["COVENANT_TYPE"] == "max_leverage":
            res["COVENANT_CUSHION"] = {"value": t["headroom"], "formula": M.FORMULAS["COVENANT_CUSHION"],
                                       "inputs": {"threshold": t["threshold"], "actual": t["actual"]}}
            session.add(Metric(spread_id=sp.id, line_code="COVENANT_CUSHION", value=t["headroom"],
                               formula_text=M.FORMULAS["COVENANT_CUSHION"], inputs_json=res["COVENANT_CUSHION"]["inputs"]))
    session.flush()
    return res


def spread_view(session: Session, cycle_loan_id: str) -> dict | None:
    sp = current_spread(session, cycle_loan_id)
    if not sp:
        return None
    cl = session.get(CycleLoan, cycle_loan_id)
    lines = session.query(SpreadLineItem).filter_by(spread_id=sp.id).all()
    mets = {m.line_code: {"value": m.value, "formula": m.formula_text, "inputs": m.inputs_json}
            for m in session.query(Metric).filter_by(spread_id=sp.id)}
    covs = [{"covenant_id": c.covenant_id, "type": c.covenant_type, "metric": c.metric_line_code, "actual": c.actual,
             "threshold": c.threshold, "operator": c.operator, "result": c.result, "headroom": c.headroom,
             "note": c.note} for c in session.query(CovenantTest).filter_by(spread_id=sp.id)]
    cert = certificate_check(session, cl, mets.get("LEVERAGE", {}).get("value"), covs)
    prior = previous_quarter_metrics(cl)
    return {
        "spread": {"id": sp.id, "version": sp.version, "status": sp.status, "approved_by": sp.approved_by,
                   "approved_at": sp.approved_at.isoformat() if sp.approved_at else None,
                   "not_found": sp.not_found_lines, "agent_run_id": sp.proposed_by_agent_run_id,
                   "written_back": sp.written_back_spread_id},
        "lines": [{"id": l.id, "line_code": l.line_code, "period_type": l.period_type, "value": l.value,
                   "proposed_value": l.proposed_value, "confidence": l.confidence, "evidence": l.evidence_json,
                   "source_label": l.source_label, "edited": l.edited, "edit_reason": l.edit_reason} for l in lines],
        "adjustments": [{"id": a.id, "adj_type": a.adj_type, "amount": a.amount, "description": a.description,
                         "allowed": a.allowed, "evidence": a.evidence_json, "accepted": a.accepted,
                         "decided_by": a.decided_by} for a in session.query(Adjustment).filter_by(spread_id=sp.id)],
        "metrics": mets, "covenants": covs, "certificate": cert, "prior": prior,
        "template": [r for r in get_warehouse().reference(
            "select LINE_CODE, LINE_LABEL, LINE_GROUP, SORT_ORDER, IS_CALCULATED, FORMULA, UNIT "
            "from EVEREST.SPREAD_TEMPLATE order by SORT_ORDER")],
    }


def previous_quarter_metrics(cl: CycleLoan) -> dict:
    rows = get_warehouse().reference("select LTM_LEVERAGE, LTM_INTEREST_COVER from SIGMA.PORTFOLIO_SNAPSHOT where "
                                 "FACILITY_ID = ?", [cl.facility_id])
    return rows[0] if rows else {}


def certificate_check(session: Session, cl: CycleLoan, tiq_leverage: float | None, covs: list[dict]) -> dict:
    cert = next((d for d in loan_documents(session, cl) if d.doc_type == "covenant_certificate"), None)
    if not cert:
        return {"status": "missing", "finding": "No covenant certificate received."}
    text = "\n".join(p.text for p in session.query(DocumentPage).filter_by(document_id=cert.id))
    thr = next((c["threshold"] for c in covs if c["type"] == "max_leverage"), 99)
    res = a11_check_certificate(text, tiq_leverage, float(rule(session, "cert.tolerance", 0.05)), thr)
    res["document_id"] = cert.id
    return res


def edit_cell(session: Session, actor: Actor, line_id: str, value: float, reason: str) -> SpreadLineItem:
    require(actor, "spread.edit")
    if not reason:
        raise BusinessRuleError("A reason is required to edit a spread cell")
    li = session.get(SpreadLineItem, line_id)
    sp = session.get(FinancialSpread, li.spread_id)
    if sp.status == "approved":
        raise BusinessRuleError("The spread is approved")
    before = {"value": li.value}
    li.value, li.edited, li.edit_reason = value, True, reason
    recompute_metrics(session, sp)
    cl = session.get(CycleLoan, sp.cycle_loan_id)
    audit(session, actor, "spread.cell_edited", "spread_line_item", li.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          before=before, after={"value": value, "line": li.line_code, "period": li.period_type, "reason": reason})
    return li


def add_line(session: Session, actor: Actor, spread_id: str, line_code: str, period_type: str, value: float,
             reason: str) -> SpreadLineItem:
    """Analyst keys a line the agent could not read (for example from a scanned page). Reason mandatory."""
    require(actor, "spread.edit")
    if not reason:
        raise BusinessRuleError("A reason is required to enter a line by hand")
    sp = session.get(FinancialSpread, spread_id)
    if sp.status == "approved":
        raise BusinessRuleError("The spread is approved")
    li = SpreadLineItem(spread_id=sp.id, line_code=line_code, period_type=period_type, value=value, proposed_value=None,
                        confidence=None, evidence_json=None, edited=True, edit_reason=reason)
    session.add(li)
    session.flush()
    recompute_metrics(session, sp)
    cl = session.get(CycleLoan, sp.cycle_loan_id)
    audit(session, actor, "spread.cell_edited", "spread_line_item", li.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          before=None, after={"line": line_code, "period": period_type, "value": value, "reason": reason})
    return li


def decide_adjustment(session: Session, actor: Actor, adjustment_id: str, accept: bool) -> Adjustment:
    require(actor, "spread.edit")
    a = session.get(Adjustment, adjustment_id)
    sp = session.get(FinancialSpread, a.spread_id)
    before = {"accepted": a.accepted}
    a.accepted, a.decided_by = accept, actor.email
    recompute_metrics(session, sp)
    cl = session.get(CycleLoan, sp.cycle_loan_id)
    audit(session, actor, "spread.addback_decided", "adjustment", a.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          before=before, after={"accepted": accept, "type": a.adj_type, "amount": a.amount, "allowed": a.allowed})
    return a


def accept_above(session: Session, actor: Actor, spread_id: str, threshold: float = 0.9) -> int:
    require(actor, "spread.edit")
    n = 0
    for li in session.query(SpreadLineItem).filter_by(spread_id=spread_id):
        if (li.confidence or 0) >= threshold:
            n += 1
    sp = session.get(FinancialSpread, spread_id)
    cl = session.get(CycleLoan, sp.cycle_loan_id)
    audit(session, actor, "spread.accepted_above", "financial_spread", spread_id, cycle_id=cl.cycle_id,
          cycle_loan_id=cl.id, after={"threshold": threshold, "lines": n})
    return n


def approve_spread(session: Session, actor: Actor, spread_id: str) -> FinancialSpread:
    sp = session.get(FinancialSpread, spread_id)
    cl = session.get(CycleLoan, sp.cycle_loan_id)
    require(actor, "spread.approve", team=cl.deal_team_id)
    if sp.status == "approved":
        raise BusinessRuleError("Already approved")
    lines = session.query(SpreadLineItem).filter_by(spread_id=sp.id).all()
    if any(not l.evidence_json and not l.edit_reason for l in lines):
        raise BusinessRuleError("A line without evidence needs a note before approval")
    for a in session.query(Adjustment).filter_by(spread_id=sp.id, accepted=None):
        if a.allowed:
            a.accepted, a.decided_by = True, actor.email
    res = recompute_metrics(session, sp)
    sp.status, sp.approved_by, sp.approved_at = "approved", actor.email, now()
    everest_id = f"SPR-{cl.facility_id[2:]}-v{sp.version}"
    cyc = session.get(ValuationCycle, cl.cycle_id)
    writeback.upsert(session, "EVEREST", "SPREAD_MODEL", {"SPREAD_ID": everest_id},
                     {"FACILITY_ID": cl.facility_id, "PERIOD_END_DATE": "2026-09-30", "PERIOD_TYPE": "quarter",
                      "VERSION": sp.version, "STATUS": "approved", "CREATED_BY": sp.created_by,
                      "APPROVED_BY": actor.email, "APPROVED_AT": sp.approved_at.isoformat(timespec="seconds")[:19],
                      "SOURCE_SYSTEM": "tiq"}, actor=actor.email, tiq_entity_type="financial_spread",
                     tiq_entity_id=sp.id, tiq_entity_version=sp.version)
    wh = get_warehouse()
    wh.execute("delete from EVEREST.SPREAD_VALUE where SPREAD_ID = ?", [everest_id])
    vals = [(everest_id, l.line_code, l.value, "USD", (l.evidence_json or {}).get("file", ""), l.edit_reason)
            for l in lines if l.period_type == "quarter"]
    vals += [(everest_id, code, m["value"], "USD", "tiq metrics engine", m["formula"]) for code, m in res.items()
             if m["value"] is not None]
    wh.insert_rows("EVEREST.SPREAD_VALUE", ["SPREAD_ID", "LINE_CODE", "VALUE", "CURRENCY", "SOURCE_DOC_REF", "NOTE"], vals)
    sp.written_back_spread_id = everest_id
    for s in session.query(AgentSuggestion).filter_by(target_entity_type="financial_spread", target_entity_id=sp.id):
        s.status = "edited" if any(l.edited for l in lines) else "accepted"
        s.decided_by, s.decided_at = actor.email, now()
    cl.deal_team_track_status = "cmr_draft"
    if step_index(cl.dt_step) < step_index("Q5"):
        cl.dt_step = "Q5"
    refresh_step(cl)
    audit(session, actor, "spread.approved", "financial_spread", sp.id, cycle_id=cyc.id, cycle_loan_id=cl.id,
          after={"version": sp.version, "lines": len(lines), "everest_spread_id": everest_id,
                 "leverage": res["LEVERAGE"]["value"]})
    audit(session, actor, "everest.spread_written", "financial_spread", sp.id, cycle_id=cyc.id, cycle_loan_id=cl.id,
          after={"spread_id": everest_id})
    return sp


def metric_values(session: Session, cycle_loan_id: str) -> dict:
    sp = current_spread(session, cycle_loan_id)
    if not sp:
        return {}
    out = {m.line_code: m.value for m in session.query(Metric).filter_by(spread_id=sp.id)}
    for l in session.query(SpreadLineItem).filter_by(spread_id=sp.id, period_type="quarter"):
        out[l.line_code] = l.value
    return out


def covenant_result(session: Session, cycle_loan_id: str) -> dict:
    sp = current_spread(session, cycle_loan_id)
    if not sp:
        return {}
    c = session.query(CovenantTest).filter_by(spread_id=sp.id).first()
    return {} if not c else {"result": c.result, "actual": c.actual, "threshold": c.threshold, "operator": c.operator,
                             "headroom": c.headroom, "type": c.covenant_type}
