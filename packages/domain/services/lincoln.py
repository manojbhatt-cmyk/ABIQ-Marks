"""Lincoln exchange: share the package (Q3), receive drafts (Q10, A4), load to Everest (Q12), copy (Q13)."""
from __future__ import annotations

import io
import json
import re
from datetime import date

from openpyxl import load_workbook
from sqlalchemy.orm import Session

from agents.assistants import a4_cross_check
from agents.runtime import agent_run, step, suggest
from connectors import writeback
from connectors.object_store import get_store
from domain.models import CycleLoan, Document, DocumentPage, LincolnPackage, LincolnValuation, ValuationCycle
from domain.services.core import SYSTEM, Actor, BusinessRuleError, audit, now, require
from domain.services.cycle import complete_tasks, refresh_step, step_index
from domain.services.intake import ingest_document, loan_documents


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def share_package(session: Session, actor: Actor, cycle_loan_id: str) -> LincolnPackage:
    require(actor, "lincoln.exchange")
    cl = session.get(CycleLoan, cycle_loan_id)
    if (cl.valuation_method or "Lincoln") != "Lincoln":
        raise BusinessRuleError(f"{cl.borrower} is valued by {cl.valuation_method}, not Lincoln")
    cyc = session.get(ValuationCycle, cl.cycle_id)
    docs = [d for d in loan_documents(session, cl) if d.doc_type != "other"]
    if not docs:
        raise BusinessRuleError("No classified documents to share")
    version = session.query(LincolnPackage).filter_by(cycle_loan_id=cl.id).count() + 1
    base = f"{cyc.period}/{slug(cl.borrower)}/package-v{version}"
    store = get_store()
    manifest_docs = []
    for d in docs:
        data = store.get(d.store, d.path)
        store.put("box", f"{base}/{d.file_name}", data)
        manifest_docs.append({"doc_id": d.id, "type": d.doc_type, "file": d.file_name, "sha256": d.sha256})
    manifest = {"period": cyc.period, "facility_id": cl.facility_id, "borrower": cl.borrower,
                "package_version": version, "shared_at": now().isoformat(), "shared_by": actor.email,
                "previous_mark": cl.previous_mark, "cmr_type": cl.cmr_type, "documents": manifest_docs}
    store.put("box", f"{base}/manifest.json", json.dumps(manifest, indent=2).encode())
    pkg = LincolnPackage(cycle_loan_id=cl.id, version=version, manifest_path=f"{base}/manifest.json",
                         document_ids=[d.id for d in docs], shared_by=actor.email, shared_at=now(),
                         shared_day=cyc.current_day)
    session.add(pkg)
    cl.lincoln_track_status, cl.lincoln_step = "package_shared", "Q10"
    if step_index(cl.dt_step) < step_index("Q4"):
        cl.dt_step = "Q4"
    cl.deal_team_track_status = "spreading" if cl.deal_team_track_status in ("intake", "not_started") else cl.deal_team_track_status
    cl.status = "in_progress"
    refresh_step(cl)
    session.flush()
    audit(session, actor, "lincoln_package.shared", "lincoln_package", pkg.id, cycle_id=cl.cycle_id,
          cycle_loan_id=cl.id, after={"version": version, "files": [d["file"] for d in manifest_docs],
                                      "path": f"box/{base}"})
    return pkg


def share_all_complete(session: Session, actor: Actor, cycle_id: str) -> list[LincolnPackage]:
    """Share every complete, Lincoln-valued package that is not yet in Box (one confirmation for the PM Team)."""
    require(actor, "lincoln.exchange")
    out = []
    for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).order_by(CycleLoan.facility_id):
        if cl.package_status == "complete" and (cl.valuation_method or "Lincoln") == "Lincoln" and \
                not session.query(LincolnPackage).filter_by(cycle_loan_id=cl.id).first():
            out.append(share_package(session, actor, cl.id))
    return out


def lincoln_drops(cycle: ValuationCycle) -> list[str]:
    return [k for k in get_store().list("box", f"{cycle.period}/lincoln-out/") if k.endswith(".xlsx")]


def ingest_lincoln(session: Session, cycle_id: str, actor: Actor = SYSTEM) -> list[LincolnValuation]:
    """Box watcher: read every new marks spreadsheet and its reports (A4), one valuation row per facility."""
    cyc = session.get(ValuationCycle, cycle_id)
    seen = {d.path for d in session.query(Document).filter_by(cycle_id=cycle_id, store="box", doc_type="lincoln_marks")}
    created: list[LincolnValuation] = []
    store = get_store()
    for key in lincoln_drops(cyc):
        if key in seen:
            continue
        data = store.get("box", key)
        marks_doc = ingest_document(session, cycle_id, key.split("/")[-1], data, source="box_watch", store="box",
                                    key=key, doc_type="lincoln_marks")
        ws = load_workbook(io.BytesIO(data), data_only=True)["Marks"]
        rows = list(ws.iter_rows(values_only=True))
        head = [str(h).strip().lower() for h in rows[0]]
        folder = key.rsplit("/", 1)[0]
        for raw in rows[1:]:
            if not raw or not raw[0]:
                continue
            r = dict(zip(head, raw))
            fid = r.get("facility id")
            cl = session.query(CycleLoan).filter_by(cycle_id=cycle_id, facility_id=fid).first()
            if cl is None:
                audit(session, SYSTEM, "lincoln_valuation.unmatched", "document", marks_doc.id, cycle_id=cycle_id,
                      after={"facility_id": fid})
                continue
            if (cl.valuation_method or "Lincoln") != "Lincoln":
                audit(session, SYSTEM, "lincoln_valuation.skipped", "document", marks_doc.id, cycle_id=cycle_id,
                      cycle_loan_id=cl.id, after={"facility_id": fid, "valuation_method": cl.valuation_method})
                continue
            version = int(r.get("version") or 1)
            if session.query(LincolnValuation).filter_by(cycle_loan_id=cl.id, version=version).first():
                continue
            report_key = f"{folder}/{slug(cl.borrower)}-{fid}-v{version}.pdf"
            report_doc, report_text = None, ""
            if store.exists("box", report_key):
                report_doc = ingest_document(session, cycle_id, report_key.split("/")[-1], store.get("box", report_key),
                                             source="box_watch", store="box", key=report_key, loan=cl,
                                             doc_type="lincoln_report")
                report_text = "\n".join(p.text for p in session.query(DocumentPage).filter_by(document_id=report_doc.id))
            yield_raw = r.get("required yield")
            ry = float(str(yield_raw).strip("%")) / 100 if isinstance(yield_raw, str) else yield_raw
            sheet = {"point": float(r["point estimate"]), "low": float(r["range low"]), "high": float(r["range high"])}
            with agent_run(session, "A4", "lincoln_extractor", cycle_id=cycle_id, cycle_loan_id=cl.id,
                           input_summary=f"{fid} v{version}") as run:
                check = a4_cross_check(sheet, report_text)
                step(run, "read_sheet_row", sheet)
                step(run, "cross_check_report", check)
                lv = LincolnValuation(
                    cycle_loan_id=cl.id, facility_id=fid, version=version,
                    valuation_date=date.fromisoformat(str(r["valuation date"])[:10]), point_estimate=sheet["point"],
                    range_low=sheet["low"], range_high=sheet["high"], required_yield=ry,
                    methodology=r.get("methodology"), key_assumptions=r.get("key assumptions"),
                    comments=r.get("comments"), report_document_id=report_doc.id if report_doc else None,
                    marks_file_document_id=marks_doc.id, extracted_by_agent_run_id=run.id,
                    extraction_confidence=check["confidence"], discrepancy_flag=check["discrepancy"],
                    discrepancy_note=check["note"] or None, received_at=now(), received_day=cyc.current_day)
                session.add(lv)
                session.flush()
                suggest(session, run, "extraction", "lincoln_valuation", lv.id, {**sheet, "yield": ry, **check},
                        check["confidence"])
            created.append(lv)
            from domain.services import mark_moves

            mark_moves.check(session, cl, lv.point_estimate, "lincoln_draft")
            if version > 1:
                _loop(cl, "QC")
            cl.lincoln_track_status, cl.lincoln_step = "marks_received", "Q11"
            if cl.status == "waiting_on_lincoln":
                cl.status = "in_progress"
            complete_tasks(session, cl.id, "Q10", SYSTEM)
            refresh_step(cl)
            audit(session, actor, "lincoln_valuation.received", "lincoln_valuation", lv.id, cycle_id=cycle_id,
                  cycle_loan_id=cl.id, after={"version": version, **sheet, "required_yield": ry,
                                              "discrepancy": check["discrepancy"]},
                  agent_run_id=lv.extracted_by_agent_run_id)
    if created:
        from domain.services.tracker import recompute

        recompute(session, cycle_id, source="lincoln")
    return created


def _loop(cl: CycleLoan, code: str) -> None:
    from domain.services.core import bump_loop

    bump_loop(cl, code)


def latest_valuation(session: Session, cycle_loan_id: str) -> LincolnValuation | None:
    return session.query(LincolnValuation).filter_by(cycle_loan_id=cycle_loan_id).order_by(
        LincolnValuation.version.desc()).first()


def load_to_everest(session: Session, actor: Actor, cycle_id: str, only: list[str] | None = None) -> int:
    """Q12: write the latest Lincoln draft per loan to the Everest pricing panel through the adapter."""
    require(actor, "lincoln.exchange")
    cyc = session.get(ValuationCycle, cycle_id)
    todo = []
    for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True):
        if only is not None and cl.id not in only:
            continue
        lv = latest_valuation(session, cl.id)
        if lv and not lv.loaded_to_everest:
            todo.append((cl, lv))
    if not todo:
        return 0
    # One batched write for every loan: per-loan writes cost two Snowflake round trips each.
    changes = writeback.upsert_many(session, "EVEREST", "PRICING_PANEL", [{
        "key": {"FACILITY_ID": cl.facility_id, "PERIOD": cyc.period},
        "payload": {"LINCOLN_VERSION": lv.version, "LINCOLN_POINT": lv.point_estimate,
                    "LINCOLN_RANGE_LOW": lv.range_low, "LINCOLN_RANGE_HIGH": lv.range_high,
                    "REQUIRED_YIELD": lv.required_yield, "VALUATION_DATE": lv.valuation_date.isoformat(),
                    "DEAL_TEAM_STATUS": "pending"},
        "tiq_entity_type": "lincoln_valuation", "tiq_entity_id": lv.id, "tiq_entity_version": lv.version}
        for cl, lv in todo], actor=actor.email)
    n = 0
    for (cl, lv), change in zip(todo, changes):
        if change.status == "failed":
            continue
        lv.loaded_to_everest = True
        if cl.lincoln_step in ("Q10", "Q11", "Q12"):
            cl.lincoln_step = "Q13" if (lv.sharepoint_copy_path or (lv.source or "lincoln") != "lincoln") else "Q12"
        cl.lincoln_track_status = "loaded"
        refresh_step(cl)
        audit(session, actor, "everest.pricing_panel_written", "lincoln_valuation", lv.id, cycle_id=cycle_id,
              cycle_loan_id=cl.id, after={"version": lv.version, "point": lv.point_estimate})
        n += 1
    return n


def copy_to_sharepoint(session: Session, actor: Actor, cycle_id: str, only: list[str] | None = None) -> int:
    """Q13: copy Lincoln report PDFs to SharePoint as the official copy."""
    require(actor, "lincoln.exchange")
    cyc = session.get(ValuationCycle, cycle_id)
    store, n = get_store(), 0
    for lv in session.query(LincolnValuation).join(CycleLoan, CycleLoan.id == LincolnValuation.cycle_loan_id).filter(
            CycleLoan.cycle_id == cycle_id):
        if lv.sharepoint_copy_path or not lv.report_document_id or (only is not None and lv.cycle_loan_id not in only):
            continue
        doc = session.get(Document, lv.report_document_id)
        dest = f"PrivateCredit/Valuation/{cyc.period}/Lincoln/{doc.file_name}"
        store.put("sharepoint", dest, store.get(doc.store, doc.path))
        lv.sharepoint_copy_path = dest
        cl = session.get(CycleLoan, lv.cycle_loan_id)
        if lv.loaded_to_everest and cl.lincoln_step in ("Q11", "Q12"):
            cl.lincoln_step = "Q13"
            refresh_step(cl)
        audit(session, actor, "document.copied", "lincoln_valuation", lv.id, cycle_id=cycle_id, cycle_loan_id=cl.id,
              after={"to": f"sharepoint/{dest}"})
        n += 1
    return n


def valuation_dict(lv: LincolnValuation) -> dict:
    return {"id": lv.id, "version": lv.version, "valuation_date": lv.valuation_date.isoformat(),
            "point": lv.point_estimate, "low": lv.range_low, "high": lv.range_high, "yield": lv.required_yield,
            "methodology": lv.methodology, "assumptions": lv.key_assumptions, "comments": lv.comments,
            "report_document_id": lv.report_document_id, "loaded_to_everest": lv.loaded_to_everest,
            "sharepoint": lv.sharepoint_copy_path, "confidence": lv.extraction_confidence,
            "discrepancy": lv.discrepancy_flag, "discrepancy_note": lv.discrepancy_note, "received_day": lv.received_day}
