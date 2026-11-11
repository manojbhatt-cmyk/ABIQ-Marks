"""TIQ Marks API: REST over the domain services. Every write goes through a service that checks the role and
writes the audit event; this layer only shapes requests and responses."""
from __future__ import annotations

import mimetypes
import threading
import time
from datetime import date

from fastapi import Body, Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from api.deps import DEMO_PASSWORD, current_actor, db, quarterly_cycle, sign
from connectors.mailbox import mailbox
from connectors.object_store import get_store
from connectors.warehouse import get_warehouse
from domain.models import (AgentRun, AgentSuggestion, AppUser, CalendarTemplate, CmrReviewComment, CycleLoan, Document,
                           DocumentPage, EmailMessage, EmailTemplate, EvalResult, Notification, Reminder, RuleConfig,
                           Task, ValuationCycle, WritebackChange)
from domain.services import (closing, cmrs, committee, cycle as cyc_svc, intake, lincoln, lineage, monthly, spreads,
                             tracker, valuation)
from domain.services.core import Actor, BusinessRuleError, Forbidden, audit, now, require, rule_meta, set_rule

app = FastAPI(title="TIQ Marks API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(Forbidden)
def _forbidden(_: Request, exc: Forbidden):
    return JSONResponse({"detail": str(exc), "kind": "permission_denied"}, status_code=403)


@app.exception_handler(BusinessRuleError)
def _rule(_: Request, exc: BusinessRuleError):
    return JSONResponse({"detail": str(exc), "kind": "business_rule"}, status_code=409)


A = Depends(current_actor)
S = Depends(db)


# ---------------- auth ----------------
@app.post("/api/auth/login")
def login(body: dict = Body(...), s: Session = S):
    u = s.query(AppUser).filter_by(email=body.get("email", "").lower().strip(), active=True).first()
    if not u or body.get("password") != DEMO_PASSWORD:
        raise HTTPException(401, "Email or password is wrong")
    return {"token": sign({"sub": u.email, "exp": time.time() + 12 * 3600}), "user": _user(u)}


def _user(u: AppUser) -> dict:
    return {"email": u.email, "name": u.display_name, "role": u.role, "deal_team_id": u.deal_team_id}


@app.get("/api/auth/me")
def me(a: Actor = A, s: Session = S):
    return _user(s.query(AppUser).filter_by(email=a.email).one())


@app.get("/api/auth/demo-users")
def demo_users(s: Session = S):
    return [_user(u) for u in s.query(AppUser).order_by(AppUser.role, AppUser.email)]


@app.get("/api/health")
def health():
    return {"status": "ok", "time": now().isoformat()}


# ---------------- cycles (S01, S02, S03) ----------------
@app.get("/api/cycles")
def list_cycles(a: Actor = A, s: Session = S):
    return [cyc_svc.cycle_dict(c) for c in s.query(ValuationCycle).order_by(ValuationCycle.day0_date.desc())]


@app.get("/api/dashboard")
def get_dashboard(cycle_id: str | None = None, a: Actor = A, s: Session = S):
    return cyc_svc.dashboard(s, quarterly_cycle(s, cycle_id).id)


@app.get("/api/universe")
def universe(period: str = "2026-Q3", day0: date = date(2026, 9, 30), a: Actor = A, s: Session = S):
    rows = cyc_svc.read_universe(s, day0, period)
    runs = s.query(func.max(WritebackChange.applied_at)).scalar()
    return {"rows": [{k.lower(): (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in r.items()} for r in rows],
            "freshness": {"source": get_warehouse().name, "dealcloud": "DealCloud via Snowflake, synced 02:00",
                          "sentry": f"Sentry as of {day0:%d %b %Y}", "last_writeback": runs.isoformat() if runs else None}}


@app.post("/api/cycles")
def create_cycle(body: dict = Body(...), a: Actor = A, s: Session = S):
    c = cyc_svc.create_quarterly_cycle(s, a, body.get("period", "2026-Q3"), date.fromisoformat(body.get("day0", "2026-09-30")))
    return cyc_svc.cycle_dict(c)


@app.get("/api/cycles/{cycle_id}/loans")
def cycle_loans(cycle_id: str, a: Actor = A, s: Session = S):
    loans = s.query(CycleLoan).filter_by(cycle_id=cycle_id).order_by(CycleLoan.facility_id).all()
    if a.role in ("deal_analyst", "deal_lead"):
        loans = [l for l in loans if l.deal_team_id == a.deal_team_id]
    return [cyc_svc.loan_card(l) | {"commitment": l.commitment_amount, "coupon": l.coupon_rate, "in_scope": l.in_scope,
                                    "valuation_method": l.valuation_method or "Lincoln", "late_addition": l.late_addition,
                                    "maturity": l.maturity_date.isoformat() if l.maturity_date else None,
                                    "sponsor": l.sponsor, "previous_rating": l.previous_rating,
                                    "previous_watchlist": l.previous_watchlist} for l in loans]


@app.post("/api/loans/{cycle_loan_id}/valuation-method")
def set_method(cycle_loan_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    cl = cyc_svc.set_valuation_method(s, a, cycle_loan_id, body["method"], body.get("reason", ""))
    return {"id": cl.id, "valuation_method": cl.valuation_method}


@app.post("/api/loans/{cycle_loan_id}/internal-valuation")
def internal_valuation(cycle_loan_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    lv = valuation.record_internal_valuation(s, a, cycle_loan_id, body.get("point"), body.get("rationale", ""),
                                             body.get("document_id"))
    return lincoln.valuation_dict(lv)


@app.post("/api/cycles/{cycle_id}/refresh")
def refresh_universe(cycle_id: str, a: Actor = A, s: Session = S):
    return cyc_svc.refresh_universe(s, a, cycle_id)


@app.on_event("startup")
def nightly_refresh():
    """M1.1.2: refresh every open cycle's loan universe from Snowflake at 02:00 local time."""
    def loop():
        from datetime import datetime

        from domain.db import session_scope
        from domain.services.core import SYSTEM

        last = None
        while True:
            t = datetime.now()
            if t.hour == 2 and last != t.date():
                try:
                    with session_scope() as ss:
                        for c in ss.query(ValuationCycle).filter_by(status="open"):
                            cyc_svc.refresh_universe(ss, SYSTEM, c.id)
                    last = t.date()
                except Exception:
                    pass
            time.sleep(300)

    threading.Thread(target=loop, daemon=True).start()


@app.post("/api/loans/{cycle_loan_id}/scope")
def set_scope(cycle_loan_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    cl = cyc_svc.set_scope(s, a, cycle_loan_id, bool(body["in_scope"]), body.get("reason", ""))
    return {"id": cl.id, "in_scope": cl.in_scope}


@app.get("/api/cycles/{cycle_id}/deadlines")
def get_deadlines(cycle_id: str, a: Actor = A, s: Session = S):
    return [{"step": d.step_code, "label": d.label, "day": d.due_day, "date": d.due_date.isoformat(), "assumed": d.assumed,
             "source": d.source} for d in sorted(cyc_svc.deadlines(s, cycle_id).values(), key=lambda x: x.due_day)]


@app.put("/api/cycles/{cycle_id}/deadlines/{step}")
def put_deadline(cycle_id: str, step: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    d = cyc_svc.set_deadline(s, a, cycle_id, step, int(body["day"]))
    return {"step": d.step_code, "day": d.due_day, "date": d.due_date.isoformat()}


@app.get("/api/cycles/{cycle_id}/kickoff")
def kickoff_preview(cycle_id: str, a: Actor = A, s: Session = S):
    return cyc_svc.kickoff_preview(s, cycle_id)


@app.post("/api/cycles/{cycle_id}/kickoff")
def kickoff_send(cycle_id: str, body: dict = Body(default={}), a: Actor = A, s: Session = S):
    return [{"id": m.id, "to": m.recipients, "subject": m.subject} for m in cyc_svc.send_kickoff(s, a, cycle_id, body.get("edits"))]


@app.post("/api/cycles/{cycle_id}/clock")
def clock(cycle_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    c = cyc_svc.move_clock(s, a, cycle_id, int(body["day"]))
    intake.refresh_packages(s, cycle_id)
    return cyc_svc.cycle_dict(c)


# ---------------- intake (S04) ----------------
@app.get("/api/cycles/{cycle_id}/intake")
def intake_view(cycle_id: str, a: Actor = A, s: Session = S):
    loans = s.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).order_by(CycleLoan.facility_id).all()
    if a.role in ("deal_analyst", "deal_lead"):
        loans = [l for l in loans if l.deal_team_id == a.deal_team_id]
    due = cyc_svc.deadlines(s, cycle_id)["Q2"]
    cyc = s.get(ValuationCycle, cycle_id)
    out = []
    seen_borrowers = set()
    for cl in loans:
        docs = intake.loan_documents(s, cl) if cl.borrower_id not in seen_borrowers or True else []
        seen_borrowers.add(cl.borrower_id)
        emails = s.query(EmailMessage).filter_by(cycle_id=cycle_id, matched_borrower_id=cl.borrower_id).order_by(
            EmailMessage.created_at).all()
        out.append(cyc_svc.loan_card(cl) | {
            "days_late": max(0, cyc.current_day - due.due_day) if cl.package_status in ("late", "not_received") else 0,
            "documents": [intake.document_dict(d) for d in docs],
            "emails": [_email(e) for e in emails],
            "tasks": [{"title": t.title, "status": t.status, "step": t.step_code, "due_day": t.due_day}
                      for t in s.query(Task).filter_by(cycle_loan_id=cl.id)]})
    low = [intake.document_dict(d) | {"suggestion": _sugg(s, "document", d.id)}
           for d in s.query(Document).filter_by(cycle_id=cycle_id, store="uploads").filter(
               Document.doc_type_confirmed_by.is_(None), Document.status != "indexed")]
    reminders = [{"id": r.id, "cycle_loan_id": r.cycle_loan_id, "subject": r.draft_subject, "body": r.draft_body,
                  "status": r.status, "borrower": s.get(CycleLoan, r.cycle_loan_id).borrower}
                 for r in s.query(Reminder).join(CycleLoan, CycleLoan.id == Reminder.cycle_loan_id).filter(
                     CycleLoan.cycle_id == cycle_id).order_by(Reminder.created_at.desc())]
    unmatched = [_email(e) for e in s.query(EmailMessage).filter_by(cycle_id=cycle_id, direction="in", status="unmatched")]
    sent = [_email(e) for e in s.query(EmailMessage).filter_by(cycle_id=cycle_id, direction="out").order_by(
        EmailMessage.created_at.desc()).limit(60)]
    return {"loans": out, "low_confidence": low, "reminders": reminders, "unmatched": unmatched, "sent": sent,
            "due_day": due.due_day, "rule": rule_meta(s, "classify.confidence_threshold"),
            "required": {"standard": rule_meta(s, "intake.required_docs.standard"),
                         "watchlist": rule_meta(s, "intake.required_docs.watchlist")}}


def _email(e: EmailMessage) -> dict:
    return {"id": e.id, "direction": e.direction, "from": e.from_addr, "to": e.to_addrs, "cc": e.cc_addrs or [],
            "subject": e.subject,
            "body": e.body_text, "day": e.cycle_day, "attachments": e.attachments, "template": e.template_code,
            "match": e.match_method, "at": (e.sent_at or e.received_at or e.created_at).isoformat()}


def _sugg(s: Session, target_type: str, target_id: str) -> dict | None:
    x = s.query(AgentSuggestion).filter_by(target_entity_type=target_type, target_entity_id=target_id).order_by(
        AgentSuggestion.created_at.desc()).first()
    return {"id": x.id, "payload": x.payload_json, "confidence": x.confidence, "status": x.status,
            "decided_by": x.decided_by} if x else None


@app.post("/api/cycles/{cycle_id}/intake/process")
def process_inbox(cycle_id: str, a: Actor = A, s: Session = S):
    require(a, "intake.manage")
    return {"processed": len(intake.process_inbox(s, cycle_id))}


@app.post("/api/documents/{document_id}/classify")
def classify(document_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    return intake.document_dict(intake.confirm_classification(s, a, document_id, body["doc_type"], body.get("cycle_loan_id")))


@app.post("/api/loans/{cycle_loan_id}/complete")
def mark_complete(cycle_loan_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    return cyc_svc.loan_card(intake.mark_complete(s, a, cycle_loan_id, body.get("note", "")))


@app.post("/api/cycles/{cycle_id}/chase")
def draft_chase(cycle_id: str, a: Actor = A, s: Session = S):
    require(a, "intake.manage")
    return {"drafted": len(intake.draft_chases(s, cycle_id))}


@app.post("/api/reminders/{reminder_id}/send")
def send_reminder(reminder_id: str, body: dict = Body(default={}), a: Actor = A, s: Session = S):
    r = intake.send_chase(s, a, reminder_id, body.get("subject"), body.get("body"))
    return {"id": r.id, "status": r.status}


@app.post("/api/loans/{cycle_loan_id}/upload")
async def upload(cycle_loan_id: str, file: UploadFile = File(...), a: Actor = A, s: Session = S):
    d = intake.upload_document(s, a, cycle_loan_id, file.filename, await file.read())
    return intake.document_dict(d)


# ---------------- files ----------------
@app.get("/api/files/{store}/{path:path}")
def get_file(store: str, path: str, a: Actor = A):
    if a.role == "lincoln" and store != "box":
        raise HTTPException(403, "Lincoln can only open its Box exchange folder")
    try:
        data = get_store().get(store, path)
    except (FileNotFoundError, ValueError):
        raise HTTPException(404, "File not found")
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    return Response(data, media_type=mime, headers={"Content-Disposition": f'inline; filename="{path.split("/")[-1]}"'})


@app.get("/api/documents/{document_id}")
def document_detail(document_id: str, a: Actor = A, s: Session = S):
    d = s.get(Document, document_id)
    pages = s.query(DocumentPage).filter_by(document_id=d.id).order_by(DocumentPage.page_no).all()
    return intake.document_dict(d) | {"pages": [{"page_no": p.page_no, "text": p.text, "has_text": p.has_text_layer}
                                                for p in pages], "url": f"/api/files/{d.store}/{d.path}"}


@app.get("/api/box")
def box_tree(prefix: str = "", a: Actor = A):
    if a.role not in ("pm_team", "lincoln", "admin"):
        raise HTTPException(403, "Box exchange is for the PM Team and Lincoln")
    return get_store().list("box", prefix)


# ---------------- Lincoln exchange (S05) ----------------
@app.get("/api/cycles/{cycle_id}/lincoln")
def lincoln_view(cycle_id: str, a: Actor = A, s: Session = S):
    from domain.models import LincolnPackage, LincolnValuation, ValuationDecision

    out = []
    for cl in s.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).order_by(CycleLoan.facility_id):
        pkgs = s.query(LincolnPackage).filter_by(cycle_loan_id=cl.id).order_by(LincolnPackage.version).all()
        vals = s.query(LincolnValuation).filter_by(cycle_loan_id=cl.id).order_by(LincolnValuation.version).all()
        notes = s.query(ValuationDecision).filter_by(cycle_loan_id=cl.id, outcome="sent_back").all()
        out.append({"cycle_loan_id": cl.id, "facility_id": cl.facility_id, "borrower": cl.borrower,
                    "valuation_method": cl.valuation_method or "Lincoln",
                    "package_status": cl.package_status, "lincoln_status": cl.lincoln_track_status,
                    "packages": [{"version": p.version, "day": p.shared_day, "manifest": p.manifest_path,
                                  "files": len(p.document_ids or [])} for p in pkgs],
                    "valuations": [lincoln.valuation_dict(v) for v in vals],
                    "send_backs": [{"path": n.send_back_note_path, "note": n.note, "at": n.decided_at.isoformat()}
                                   for n in notes]})
    exceptions = [{"id": x.id, "payload": x.payload_json} for x in s.query(AgentSuggestion).join(
        AgentRun, AgentRun.id == AgentSuggestion.agent_run_id).filter(AgentRun.component == "A4", AgentRun.cycle_id == cycle_id,
                                                                       AgentSuggestion.confidence < 0.9)]
    if a.role == "lincoln":
        out = [{k: v for k, v in r.items() if k in ("facility_id", "borrower", "packages", "send_backs", "valuations")}
               for r in out]
    return {"loans": out, "exceptions": exceptions, "box": get_store().list("box", quarterly_cycle(s, cycle_id).period)}


@app.post("/api/cycles/{cycle_id}/lincoln/share-all")
def share_all(cycle_id: str, a: Actor = A, s: Session = S):
    return {"shared": len(lincoln.share_all_complete(s, a, cycle_id))}


@app.post("/api/loans/{cycle_loan_id}/share")
def share(cycle_loan_id: str, a: Actor = A, s: Session = S):
    p = lincoln.share_package(s, a, cycle_loan_id)
    return {"version": p.version, "manifest": p.manifest_path}


@app.post("/api/cycles/{cycle_id}/lincoln/ingest")
def ingest(cycle_id: str, a: Actor = A, s: Session = S):
    require(a, "lincoln.exchange")
    return {"received": len(lincoln.ingest_lincoln(s, cycle_id, a))}


@app.post("/api/cycles/{cycle_id}/lincoln/load-everest")
def load_everest(cycle_id: str, a: Actor = A, s: Session = S):
    return {"loaded": lincoln.load_to_everest(s, a, cycle_id)}


@app.post("/api/cycles/{cycle_id}/lincoln/copy-sharepoint")
def copy_sp(cycle_id: str, a: Actor = A, s: Session = S):
    return {"copied": lincoln.copy_to_sharepoint(s, a, cycle_id)}


@app.post("/api/lincoln/upload")
async def lincoln_upload(file: UploadFile = File(...), valuation_date: str = "2026-10-18", a: Actor = A, s: Session = S):
    require(a, "lincoln.upload")
    c = quarterly_cycle(s)
    key = f"{c.period}/lincoln-out/{valuation_date}/{file.filename}"
    get_store().put("box", key, await file.read())
    audit(s, a, "document.saved", "box", key, cycle_id=c.id, after={"path": f"box/{key}"})
    return {"path": key}


# ---------------- loan workspace (S06) ----------------
@app.get("/api/loans/{cycle_loan_id}")
def loan_workspace(cycle_loan_id: str, a: Actor = A, s: Session = S):
    cl = s.get(CycleLoan, cycle_loan_id)
    from domain.models import MarksTrackerRow

    tr = s.query(MarksTrackerRow).filter_by(cycle_loan_id=cl.id).first()
    cov = spreads.covenant_result(s, cl.id)
    pv = valuation.pricing_view(s, cl.id)
    return {"loan": cyc_svc.loan_card(cl, tr) | {"commitment": cl.commitment_amount, "coupon": cl.coupon_rate,
                                                  "previous_rating": cl.previous_rating, "sponsor": cl.sponsor,
                                                  "maturity": cl.maturity_date.isoformat(), "cycle_id": cl.cycle_id,
                                                  "previous_watchlist": cl.previous_watchlist,
                                                  "analyst": cl.analyst_email, "lead": cl.lead_email,
                                                  "ac_manager": cl.ac_manager_email},
            "tracker": tracker.row_dict(tr) if tr else None, "covenant": cov,
            "net_leverage_after_equity": pv["knows"]["net_leverage_after_equity"],
            "documents": [intake.document_dict(d) for d in intake.loan_documents(s, cl)],
            "timeline": lineage.audit_events(s, cycle_loan_id=cl.id, limit=200)}


# ---------------- spread (S07) ----------------
@app.get("/api/loans/{cycle_loan_id}/spread")
def get_spread(cycle_loan_id: str, a: Actor = A, s: Session = S):
    return spreads.spread_view(s, cycle_loan_id)


@app.post("/api/loans/{cycle_loan_id}/spread/run")
def run_spread(cycle_loan_id: str, body: dict = Body(default={}), a: Actor = A, s: Session = S):
    spreads.run_spreading(s, a, cycle_loan_id, body.get("instructions", ""))
    return spreads.spread_view(s, cycle_loan_id)


@app.patch("/api/spread-lines/{line_id}")
def edit_line(line_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    li = spreads.edit_cell(s, a, line_id, float(body["value"]), body.get("reason", ""))
    return {"id": li.id, "value": li.value}


@app.post("/api/spreads/{spread_id}/lines")
def add_line(spread_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    li = spreads.add_line(s, a, spread_id, body["line_code"], body.get("period_type", "quarter"), float(body["value"]),
                          body.get("reason", ""))
    return {"id": li.id}


@app.post("/api/adjustments/{adjustment_id}")
def decide_adj(adjustment_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    x = spreads.decide_adjustment(s, a, adjustment_id, bool(body["accept"]))
    return {"id": x.id, "accepted": x.accepted}


@app.post("/api/spreads/{spread_id}/approve")
def approve_spread(spread_id: str, a: Actor = A, s: Session = S):
    sp = spreads.approve_spread(s, a, spread_id)
    return {"id": sp.id, "status": sp.status, "everest": sp.written_back_spread_id}


@app.post("/api/spreads/{spread_id}/accept-above")
def accept_above(spread_id: str, body: dict = Body(default={}), a: Actor = A, s: Session = S):
    return {"lines": spreads.accept_above(s, a, spread_id, float(body.get("threshold", 0.9)))}


@app.get("/api/agent-runs/{run_id}")
def agent_run_detail(run_id: str, a: Actor = A, s: Session = S):
    r = s.get(AgentRun, run_id)
    return {"id": r.id, "component": r.component, "graph": r.graph_name, "status": r.status, "engine": r.engine,
            "input": r.input_summary, "output": r.output_summary, "trajectory": r.trajectory_json,
            "tokens": (r.prompt_tokens or 0) + (r.completion_tokens or 0), "cost": r.cost_usd,
            "started": r.started_at.isoformat() if r.started_at else None}


# ---------------- CMR (S08) and reviews (S09) ----------------
@app.get("/api/loans/{cycle_loan_id}/cmr")
def get_cmr(cycle_loan_id: str, a: Actor = A, s: Session = S):
    return cmrs.cmr_view(s, cycle_loan_id)


@app.post("/api/loans/{cycle_loan_id}/cmr")
def create_cmr(cycle_loan_id: str, a: Actor = A, s: Session = S):
    cmrs.get_or_create_cmr(s, a, cycle_loan_id)
    return cmrs.cmr_view(s, cycle_loan_id)


@app.post("/api/cmr/{cmr_id}/draft")
def draft_cmr(cmr_id: str, body: dict = Body(default={}), a: Actor = A, s: Session = S):
    secs = cmrs.draft_sections(s, a, cmr_id, body.get("codes"))
    return {"drafted": [x.section_code for x in secs]}


@app.post("/api/cmr-sections/{section_id}")
def section_action(section_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    x = cmrs.decide_section(s, a, section_id, body["action"], body.get("body"))
    return {"id": x.id, "status": x.status, "kept_ratio": x.kept_sentence_ratio}


@app.put("/api/cmr/{cmr_id}/recommendation")
def put_rec(cmr_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    r = cmrs.set_recommendation(s, a, cmr_id, body)
    return {"id": r.id}


@app.post("/api/cmr/{cmr_id}/evidence")
def add_evidence(cmr_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    e = cmrs.attach_evidence(s, a, cmr_id, body["document_id"], body.get("supports", "other"), body.get("note", ""))
    return {"id": e.id}


@app.post("/api/cmr/{cmr_id}/submit")
def submit_cmr(cmr_id: str, body: dict = Body(default={}), a: Actor = A, s: Session = S):
    return cmrs.submit(s, a, cmr_id, bool(body.get("acknowledge", False)))


@app.post("/api/cmr/{cmr_id}/file")
def file_cmr(cmr_id: str, a: Actor = A, s: Session = S):
    f = cmrs.file_cmr(s, a, cmr_id)
    return {"version": f.version, "path": f.pdf_path}


@app.get("/api/cmr/{cmr_id}/pdf")
def cmr_pdf(cmr_id: str, a: Actor = A, s: Session = S):
    from domain.models import Cmr
    from domain.render_cmr import render_cmr_pdf

    return Response(render_cmr_pdf(s, s.get(Cmr, cmr_id)), media_type="application/pdf")


@app.get("/api/cycles/{cycle_id}/reviews")
def reviews(cycle_id: str, a: Actor = A, s: Session = S):
    return cmrs.review_queue(s, a, cycle_id)


@app.post("/api/reviews/{review_id}/comments")
def comment(review_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    c = cmrs.add_comment(s, a, review_id, body.get("section", "summary"), body.get("text", ""))
    return {"id": c.id}


@app.post("/api/reviews/{review_id}/decide")
def decide_review(review_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    rv = cmrs.decide_review(s, a, review_id, body["outcome"], body.get("checklist"))
    return {"id": rv.id, "outcome": rv.outcome}


@app.post("/api/comments/{comment_id}/resolve")
def resolve_comment(comment_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    c = cmrs.resolve_comment(s, a, comment_id, body.get("note", ""))
    return {"id": c.id, "resolved": c.resolved}


# ---------------- pricing panel G1 (S10) ----------------
@app.get("/api/loans/{cycle_loan_id}/pricing")
def pricing(cycle_loan_id: str, a: Actor = A, s: Session = S):
    return valuation.pricing_view(s, cycle_loan_id)


@app.get("/api/loans/{cycle_loan_id}/crosscheck")
def crosscheck(cycle_loan_id: str, required_yield: float, a: Actor = A, s: Session = S):
    cl = s.get(CycleLoan, cycle_loan_id)
    lv = lincoln.latest_valuation(s, cl.id)
    return valuation.crosscheck(s, lv, cl, required_yield)


@app.post("/api/loans/{cycle_loan_id}/challenge")
def challenge(cycle_loan_id: str, a: Actor = A, s: Session = S):
    x = valuation.run_challenge(s, a, cycle_loan_id)
    return {"id": x.id, "payload": x.payload_json}


@app.post("/api/loans/{cycle_loan_id}/g1")
def g1(cycle_loan_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    d = valuation.decide_g1(s, a, cycle_loan_id, body["outcome"], mark=body.get("mark"), rationale=body.get("rationale", ""),
                            reason_category=body.get("reason_category"), note=body.get("note", ""),
                            evidence=body.get("evidence"), used_tiq_draft=bool(body.get("used_tiq_draft")),
                            co_decided_by=body.get("co_decided_by"))
    return {"id": d.id, "outcome": d.outcome, "mark": d.approved_mark}


# ---------------- tracker (S11) ----------------
@app.get("/api/cycles/{cycle_id}/tracker")
def get_tracker(cycle_id: str, a: Actor = A, s: Session = S):
    view = tracker.tracker_view(s, cycle_id)
    if a.role == "finance_ir" and s.get(ValuationCycle, cycle_id).status != "closed":
        view["rows"] = [r | {"note": "draft"} for r in view["rows"]]
    return view


@app.post("/api/cycles/{cycle_id}/tracker/recompute")
def recompute(cycle_id: str, a: Actor = A, s: Session = S):
    tracker.recompute(s, cycle_id)
    return tracker.tracker_view(s, cycle_id)


@app.get("/api/cycles/{cycle_id}/tracker.xlsx")
def tracker_xlsx(cycle_id: str, a: Actor = A, s: Session = S):
    return Response(tracker.export_xlsx(s, cycle_id),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": 'attachment; filename="marks-tracker.xlsx"'})


@app.get("/api/cycles/{cycle_id}/tracker/funds")
def tracker_funds(cycle_id: str, a: Actor = A, s: Session = S):
    from domain.services import sct

    return sct.by_fund(s, cycle_id)


@app.get("/api/cycles/{cycle_id}/sct")
def sct_plan(cycle_id: str, a: Actor = A, s: Session = S):
    from domain.services import sct

    return sct.plan(s, cycle_id)


@app.post("/api/cycles/{cycle_id}/sct/{session_id}/pack")
def sct_pack(cycle_id: str, session_id: str, a: Actor = A, s: Session = S):
    from domain.services import sct

    return {"path": sct.build_session_pack(s, a, cycle_id, session_id)}


@app.post("/api/cycles/{cycle_id}/impact")
def impact(cycle_id: str, a: Actor = A, s: Session = S):
    i = tracker.draft_impact(s, a, cycle_id)
    return {"id": i.id, "body": i.body_text, "delta": i.delta}


@app.post("/api/impact/{impact_id}/send")
def impact_send(impact_id: str, body: dict = Body(default={}), a: Actor = A, s: Session = S):
    i = tracker.send_impact(s, a, impact_id, body.get("body"))
    return {"id": i.id, "sent_to": i.sent_to}


# ---------------- committee (S12, S13) ----------------
@app.get("/api/cycles/{cycle_id}/committee")
def committee_view(cycle_id: str, a: Actor = A, s: Session = S):
    return committee.agenda_view(s, cycle_id)


@app.post("/api/cycles/{cycle_id}/agenda/tests")
def agenda_tests(cycle_id: str, a: Actor = A, s: Session = S):
    committee.run_agenda_tests(s, a, cycle_id)
    return committee.agenda_view(s, cycle_id)


@app.post("/api/cycles/{cycle_id}/agenda")
def agenda_build(cycle_id: str, a: Actor = A, s: Session = S):
    committee.build_agenda(s, a, cycle_id)
    return committee.agenda_view(s, cycle_id)


@app.post("/api/cycles/{cycle_id}/agenda/add")
def agenda_add(cycle_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    committee.manual_add(s, a, cycle_id, body["cycle_loan_id"], body.get("reason", ""))
    return committee.agenda_view(s, cycle_id)


@app.post("/api/agenda-items/{item_id}/remove")
def agenda_remove(item_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    committee.remove_item(s, a, item_id, body.get("reason", ""))
    return {"ok": True}


@app.post("/api/cycles/{cycle_id}/pack")
def pack_build(cycle_id: str, body: dict = Body(default={}), a: Actor = A, s: Session = S):
    p = committee.build_pack(s, a, cycle_id, body.get("cover_note"))
    return {"id": p.id, "version": p.version, "path": p.pdf_path}


@app.post("/api/packs/{pack_id}/send")
def pack_send(pack_id: str, a: Actor = A, s: Session = S):
    p = committee.send_pack(s, a, pack_id)
    return {"id": p.id, "sent": True}


@app.post("/api/agenda-items/{item_id}/decision")
def decision(item_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    d = committee.record_decision(s, a, item_id, body["outcome"], decided_mark=body.get("decided_mark"),
                                  rating=body.get("rating"), watchlist_action=body.get("watchlist_action"),
                                  waiver_decision=body.get("waiver_decision"), conditions=body.get("conditions", ""),
                                  rationale=body.get("rationale", ""), members_present=body.get("members_present"),
                                  send_back_to=body.get("send_back_to"))
    return {"id": d.id, "outcome": d.outcome, "decided_mark": d.decided_mark}


# ---------------- reconciliation, approvals, distribution (S14 to S16) ----------------
@app.get("/api/cycles/{cycle_id}/reconciliation")
def recon_view(cycle_id: str, a: Actor = A, s: Session = S):
    return closing.reconciliation_view(s, cycle_id)


@app.post("/api/cycles/{cycle_id}/reconciliation")
def recon_run(cycle_id: str, a: Actor = A, s: Session = S):
    closing.run_reconciliation(s, a, cycle_id)
    return closing.reconciliation_view(s, cycle_id)


@app.post("/api/recon-items/{item_id}/resolve")
def recon_resolve(item_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    it = closing.resolve_item(s, a, item_id, body["action"], body.get("note", ""))
    return {"id": it.id, "status": it.status}


@app.get("/api/cycles/{cycle_id}/approvals")
def approvals(cycle_id: str, a: Actor = A, s: Session = S):
    return closing.approvals_view(s, cycle_id)


@app.post("/api/cycles/{cycle_id}/approvals/request")
def approval_request(cycle_id: str, a: Actor = A, s: Session = S):
    r = closing.request_approval(s, a, cycle_id)
    return {"id": r.id}


@app.post("/api/approval-requests/{request_id}/decide")
def approval_decide(request_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    x = closing.decide_approval(s, a, request_id, body["decision"], body.get("comments", ""))
    return {"id": x.id, "decision": x.decision, "evidence": x.evidence_path}


@app.post("/api/cycles/{cycle_id}/governance")
def governance(cycle_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    g = closing.governance(s, a, cycle_id, body["decision"], body.get("reasons", ""))
    return {"id": g.id, "status": g.status}


@app.post("/api/cycles/{cycle_id}/distribute")
def distribute(cycle_id: str, a: Actor = A, s: Session = S):
    return {"sent": len(closing.distribute(s, a, cycle_id))}


@app.get("/api/inbox")
def inbox(a: Actor = A, s: Session = S):
    """External (third-party) mail: borrower packages and chases, Lincoln send-backs."""
    q = s.query(EmailMessage).order_by(EmailMessage.created_at.desc()).limit(600).all()
    if a.role == "lincoln":
        q = [m for m in q if "analyst@lincoln.example" in (m.to_addrs or []) or (m.from_addr or "").endswith("lincoln.example")]
    elif a.role in ("deal_analyst", "deal_lead"):
        mine = {l.borrower_id for l in s.query(CycleLoan).filter_by(deal_team_id=a.deal_team_id)}
        q = [m for m in q if m.matched_borrower_id in mine]
    docs: dict[str, list] = {}
    for d in s.query(Document).filter(Document.email_message_id.in_([m.id for m in q])):
        docs.setdefault(d.email_message_id, []).append({"name": d.file_name, "url": f"/api/files/{d.store}/{d.path}",
                                                        "doc_type": d.doc_type})
    return [_email(m) | {"direction": m.direction, "documents": docs.get(m.id, []),
                         "eml": f"/api/files/mail/{m.eml_path}" if m.eml_path else None} for m in q]


# ---------------- monthly (S17 to S19) ----------------
def _monthly(s: Session):
    return s.query(ValuationCycle).filter_by(cycle_type="monthly").order_by(ValuationCycle.day0_date.desc()).first()


@app.get("/api/monthly")
def monthly_get(a: Actor = A, s: Session = S):
    m = _monthly(s)
    if not m:
        return {"cycle": None}
    v = monthly.monthly_view(s, m.id)
    if a.role in ("deal_analyst", "deal_lead"):
        v["rows"] = [r for r in v["rows"] if r["deal_team_id"] == a.deal_team_id]
    return {"cycle": cyc_svc.cycle_dict(m)} | v


@app.post("/api/monthly")
def monthly_create(a: Actor = A, s: Session = S):
    return cyc_svc.cycle_dict(monthly.create_monthly_cycle(s, a))


@app.post("/api/monthly/{cycle_id}/{action}")
def monthly_action(cycle_id: str, action: str, body: dict = Body(default={}), a: Actor = A, s: Session = S):
    if action == "build":
        return {"rows": len(monthly.build_update_file(s, a, cycle_id))}
    if action == "email":
        return {"sent": len(monthly.email_teams(s, a, cycle_id))}
    if action == "draft-rationale":
        return monthly.draft_rationale(s, a, cycle_id, body["facility_id"], body.get("proposed_mark"))
    if action == "propose":
        p = monthly.submit_proposal(s, a, cycle_id, body["facility_id"], float(body["proposed_mark"]),
                                    body.get("rationale", ""), body.get("suggestion_id"))
        return {"id": p.id}
    if action == "consolidate":
        return {"version": monthly.consolidate(s, a, cycle_id).version}
    if action == "request":
        return {"id": monthly.request_monthly_approval(s, a, cycle_id).id}
    if action == "decide":
        d = monthly.decide_monthly(s, a, cycle_id, body["facility_id"], body["outcome"], body.get("rationale", ""))
        return {"id": d.id}
    if action == "approve-all":
        v = monthly.monthly_view(s, cycle_id)
        n = 0
        for r in v["rows"]:
            if r["status"] == "proposed":
                monthly.decide_monthly(s, a, cycle_id, r["facility_id"], "approved")
                n += 1
        return {"approved": n}
    raise HTTPException(404, "Unknown action")


@app.post("/api/ddtl/{rebalance_id}/confirm")
def ddtl_confirm(rebalance_id: str, a: Actor = A, s: Session = S):
    d = monthly.confirm_ddtl(s, a, rebalance_id)
    return {"id": d.id, "confirmed_by": d.confirmed_by}


# ---------------- lineage, audit, ask (S20, S21) ----------------
@app.get("/api/loans/{cycle_loan_id}/lineage")
def get_lineage(cycle_loan_id: str, a: Actor = A, s: Session = S):
    return lineage.lineage(s, cycle_loan_id)


@app.get("/api/audit")
def get_audit(cycle_id: str | None = None, cycle_loan_id: str | None = None, entity_id: str | None = None,
              a: Actor = A, s: Session = S):
    return lineage.audit_events(s, cycle_id, cycle_loan_id, entity_id)


@app.post("/api/ask")
def ask(body: dict = Body(...), a: Actor = A, s: Session = S):
    return lineage.ask(s, a, quarterly_cycle(s, body.get("cycle_id")).id, body.get("question", ""))


@app.post("/api/suggestions/{suggestion_id}")
def decide_suggestion(suggestion_id: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    x = s.get(AgentSuggestion, suggestion_id)
    if body.get("status") not in ("rejected", "accepted", "edited"):
        raise HTTPException(422, "status must be accepted, edited or rejected")
    x.status, x.decided_by, x.decided_at = body["status"], a.email, now()
    audit(s, a, "agent_suggestion.decided", "agent_suggestion", x.id, after={"status": x.status})
    return {"id": x.id, "status": x.status}


@app.get("/api/notifications")
def notifications(a: Actor = A, s: Session = S):
    return [{"id": n.id, "kind": n.kind, "title": n.title, "body": n.body, "at": n.created_at.isoformat(),
             "read": bool(n.read_at), "link": n.link} for n in s.query(Notification).filter_by(user_email=a.email).order_by(
        Notification.created_at.desc()).limit(50)]


@app.post("/api/notifications/read")
def notifications_read(a: Actor = A, s: Session = S):
    for n in s.query(Notification).filter_by(user_email=a.email, read_at=None):
        n.read_at = now()
    return {"ok": True}


# ---------------- in-platform work and messages ----------------
@app.get("/api/work")
def work(cycle_id: str | None = None, a: Actor = A, s: Session = S):
    from domain.services import work as work_svc

    c = s.get(ValuationCycle, cycle_id) if cycle_id else s.query(ValuationCycle).filter_by(
        cycle_type="quarterly").order_by(ValuationCycle.day0_date.desc()).first()
    out = work_svc.my_work(s, a, c.id if c else None)
    out["process"] = work_svc.process_map(s, c.id) if c else []
    return out


@app.get("/api/messages")
def messages(a: Actor = A, s: Session = S):
    from domain.services import messaging

    return messaging.inbox(s, a.email)


@app.post("/api/messages")
def send_message(body: dict = Body(...), a: Actor = A, s: Session = S):
    from domain.services import messaging

    if not body.get("to") or not body.get("body"):
        raise HTTPException(422, "Recipients and a message are required")
    c = quarterly_cycle(s, body.get("cycle_id")) if s.query(ValuationCycle).first() else None
    m = messaging.post(s, a, body["to"], body.get("subject") or "Message", body["body"], kind="note",
                       link=body.get("link"), cycle_id=c.id if c else None)
    return messaging.message_dict(m, a.email)


@app.post("/api/messages/{message_id}/read")
def read_message(message_id: str, a: Actor = A, s: Session = S):
    from domain.services import messaging

    messaging.mark_read(s, message_id, a.email)
    return {"ok": True}


@app.get("/api/directory")
def directory(a: Actor = A, s: Session = S):
    from synth.portfolio import TEAMS

    return {"users": [_user(u) for u in s.query(AppUser).filter(AppUser.role != "lincoln").order_by(AppUser.role)],
            "teams": [{"id": t, "name": n} for t, n in TEAMS]}


@app.get("/api/cycles/{cycle_id}/autopilot")
def autopilot_get(cycle_id: str, a: Actor = A, s: Session = S):
    from synth import autopilot

    return {"except": autopilot.setting(s)}


@app.post("/api/cycles/{cycle_id}/autopilot")
def autopilot_run(cycle_id: str, body: dict = Body(default={}), a: Actor = A, s: Session = S):
    """Demo only: complete routine steps for every loan except the ones the presenter works by hand."""
    require(a, "cycle.manage")
    from synth import autopilot

    if body.get("enabled") is False:
        autopilot.set_setting(s, None)
        return {"except": None, "log": ["Autopilot switched off"]}
    keep = body.get("except") or ["F-0002"]
    autopilot.set_setting(s, keep)
    return {"except": keep, "log": autopilot.run(s, cycle_id, keep) or ["Autopilot: nothing to do yet"]}


@app.post("/api/cycles/{cycle_id}/advance")
def advance(cycle_id: str, body: dict = Body(default={}), a: Actor = A, s: Session = S):
    """Demo clock: move forward; borrowers and Lincoln act on the days they would."""
    require(a, "cycle.manage")
    from synth import world

    c = s.get(ValuationCycle, cycle_id)
    to_day = int(body.get("to_day") or (c.current_day + int(body.get("days", 1))))
    try:
        log = world.advance(s, a, cycle_id, to_day)
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    return {"day": s.get(ValuationCycle, cycle_id).current_day, "log": log}


# ---------------- admin (S22) ----------------
@app.get("/api/admin/rules")
def rules(a: Actor = A, s: Session = S):
    out = []
    for r in s.query(RuleConfig).order_by(RuleConfig.key, RuleConfig.version):
        out.append({"key": r.key, "value": r.value_json, "type": r.value_type, "description": r.description,
                    "confirmed": r.confirmed_by_client, "dq": r.discovery_question, "version": r.version,
                    "current": r.is_current, "reason": r.change_reason, "by": r.created_by})
    return out


@app.put("/api/admin/rules/{key}")
def put_rule(key: str, body: dict = Body(...), a: Actor = A, s: Session = S):
    r = set_rule(s, a, key, body["value"], body.get("reason", ""))
    return {"key": r.key, "version": r.version}


@app.get("/api/admin/connectors")
def connectors(a: Actor = A, s: Session = S):
    from domain.config import settings
    from domain.models import IngestionRun

    last = s.query(IngestionRun).order_by(IngestionRun.created_at.desc()).first()
    return {"connectors": [get_warehouse().health(), get_store().health(), mailbox.health(),
                           {"connector": "snowflake", "status": "configured" if settings.snowflake_account else "not configured",
                            "account": settings.snowflake_account or None, "database": settings.snowflake_database}],
            "warehouse": settings.warehouse, "writeback_mode": settings.writeback_mode,
            "last_sync": {"dataset": last.dataset, "at": last.finished_at.isoformat(), "rows": last.rows} if last else None,
            "changes": [{"id": w.id, "target": f"{w.target_schema}.{w.target_table}", "key": w.target_key_json,
                         "payload": w.payload_json, "before": w.before_json, "status": w.status, "mode": w.mode,
                         "by": w.requested_by, "at": w.requested_at.isoformat()}
                        for w in s.query(WritebackChange).order_by(WritebackChange.requested_at.desc()).limit(100)]}


@app.get("/api/admin/agents")
def agents(a: Actor = A, s: Session = S):
    from domain.config import settings
    from agents.runtime import PROMPT_VERSION, llm_enabled

    rows = s.query(AgentRun.component, func.count(AgentRun.id), func.sum(AgentRun.cost_usd),
                   func.sum(AgentRun.prompt_tokens + AgentRun.completion_tokens)).group_by(AgentRun.component).all()
    sugg = s.query(AgentSuggestion.status, func.count(AgentSuggestion.id)).group_by(AgentSuggestion.status).all()
    loans = s.query(CycleLoan).filter_by(in_scope=True).count() or 1
    total = sum(r[2] or 0 for r in rows)
    return {"models": {"heavy": settings.model_heavy, "light": settings.model_light, "llm_enabled": llm_enabled(),
                       "prompt_version": PROMPT_VERSION},
            "components": [{"component": c, "runs": n, "cost": round(cst or 0, 4), "tokens": int(t or 0)} for c, n, cst, t in rows],
            "suggestions": {k: v for k, v in sugg}, "cost_total": round(total, 4), "cost_per_loan": round(total / loans, 4),
            "recent": [{"id": r.id, "component": r.component, "graph": r.graph_name, "status": r.status, "engine": r.engine,
                        "output": r.output_summary, "steps": r.steps, "at": r.started_at.isoformat()}
                       for r in s.query(AgentRun).order_by(AgentRun.started_at.desc()).limit(60)]}


@app.get("/api/admin/users")
def users(a: Actor = A, s: Session = S):
    return [_user(u) | {"active": u.active} for u in s.query(AppUser).order_by(AppUser.role)]


@app.get("/api/admin/templates")
def templates(a: Actor = A, s: Session = S):
    return {"email": [{"code": t.code, "subject": t.subject, "body": t.body_text, "version": t.version}
                      for t in s.query(EmailTemplate)],
            "calendar": [{"cycle_type": c.cycle_type, "phase": c.phase, "name": c.phase_name, "steps": c.step_codes,
                          "start": c.start_day_offset, "end": c.end_day_offset, "assumed": c.assumed}
                         for c in s.query(CalendarTemplate).order_by(CalendarTemplate.cycle_type, CalendarTemplate.phase)]}


SYNTH = {"running": False, "log": [], "error": None}


@app.post("/api/admin/synth/{action}")
def synth_action(action: str, body: dict = Body(default={}), a: Actor = A):
    require(a, "admin")
    if SYNTH["running"]:
        raise HTTPException(409, "A synthetic data job is already running")
    until = body.get("until", "Q0")

    def job():
        SYNTH.update(running=True, log=[], error=None)
        try:
            from synth.cli import reset
            from synth.play import play

            if action == "reset":
                reset(until=until, log=SYNTH["log"].append)
            elif action == "play":
                play(until, SYNTH["log"].append)
            SYNTH["log"].append("done")
        except Exception as exc:  # surfaced on S22
            SYNTH["error"] = str(exc)
        finally:
            SYNTH["running"] = False

    threading.Thread(target=job, daemon=True).start()
    return {"started": action, "until": until}


@app.get("/api/admin/synth")
def synth_status(a: Actor = A):
    return SYNTH


@app.get("/api/admin/evals")
def evals(a: Actor = A, s: Session = S):
    return [{"component": e.component, "set": e.eval_set, "metric": e.metric, "value": e.value, "detail": e.detail_json,
             "at": e.created_at.isoformat()} for e in s.query(EvalResult).order_by(EvalResult.created_at.desc()).limit(100)]


@app.post("/api/admin/evals/run")
def evals_run(a: Actor = A, s: Session = S):
    require(a, "admin")
    from evals.run import run_all

    return run_all(s)


__all__ = ["app", "CmrReviewComment"]
