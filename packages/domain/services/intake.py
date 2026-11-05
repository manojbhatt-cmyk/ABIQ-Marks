"""Intake (Q2): email pipeline, document pipeline, classification (A0), completeness, chase (A8)."""
from __future__ import annotations

import re
from datetime import timedelta

from sqlalchemy.orm import Session

from agents import a0_classifier
from agents.assistants import a8_draft
from agents.runtime import agent_run, step, suggest
from connectors.mailbox import mailbox
from connectors.object_store import get_store, sha256
from domain.models import (AgentSuggestion, CycleLoan, Document, DocumentChunk, DocumentPage, DocumentTable,
                           EmailMessage, EmailTemplate, Reminder, Task, ValuationCycle)
from domain.services.core import (SYSTEM, Actor, BusinessRuleError, audit, now, require, rule)
from domain.services.cycle import complete_tasks, deadlines, refresh_step
from pipeline.parse import parse

MIME = {".pdf": "application/pdf", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}


def process_inbox(session: Session, cycle_id: str) -> list[EmailMessage]:
    """Pick up new inbound .eml files, match them to a borrower, store and classify attachments."""
    cyc = session.get(ValuationCycle, cycle_id)
    done = {m.eml_path for m in session.query(EmailMessage.eml_path).filter_by(direction="in")}
    out = []
    for key in mailbox.inbox():
        if key in done:
            continue
        msg = mailbox.read(key)
        day = int(re.search(r"day-(\d+)", key).group(1)) if re.search(r"day-(\d+)", key) else cyc.current_day
        domain = (msg["from"] or "").split("@")[-1].strip("> ").lower()
        loans = session.query(CycleLoan).filter_by(cycle_id=cycle_id, email_domain=domain).all()
        method = "domain" if loans else None
        if not loans:
            loans = [cl for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id)
                     if cl.borrower and cl.borrower.lower() in (msg["subject"] or "").lower()]
            method = "subject" if loans else None
        em = EmailMessage(direction="in", message_id=msg["message_id"], thread_id=msg["message_id"],
                          from_addr=msg["from"], to_addrs=msg["to"], cc_addrs=msg["cc"], subject=msg["subject"],
                          body_text=msg["body"], received_at=now(), cycle_day=day, cycle_id=cycle_id,
                          matched_borrower_id=loans[0].borrower_id if loans else None,
                          matched_facility_id=loans[0].facility_id if loans else None, match_method=method,
                          eml_path=key, status="matched" if loans else "unmatched",
                          attachments=[a["file_name"] for a in msg["attachments"]])
        session.add(em)
        session.flush()
        audit(session, SYSTEM, "email.received", "email_message", em.id, cycle_id=cycle_id,
              cycle_loan_id=loans[0].id if loans else None,
              after={"from": msg["from"], "subject": msg["subject"], "match": method})
        for att in msg["attachments"]:
            ingest_document(session, cycle_id, att["file_name"], att["data"], source="email", email_message_id=em.id,
                            loan=loans[0] if loans else None, day=day)
        for cl in loans:
            check_completeness(session, cl, day)
        out.append(em)
    return out


def ingest_document(session: Session, cycle_id: str, file_name: str, data: bytes, *, source: str,
                    email_message_id: str | None = None, loan: CycleLoan | None = None, day: int | None = None,
                    store: str = "uploads", key: str | None = None, doc_type: str | None = None) -> Document:
    key = key or f"inbox/{email_message_id or 'upload'}/{file_name}"
    digest = get_store().put(store, key, data) if not get_store().exists(store, key) else sha256(data)
    cyc = session.get(ValuationCycle, cycle_id)
    doc = Document(store=store, path=key, sha256=digest, file_name=file_name,
                   mime=MIME.get(file_name[file_name.rfind("."):].lower(), "application/octet-stream"),
                   size=len(data), source=source, email_message_id=email_message_id, cycle_id=cycle_id,
                   facility_id=loan.facility_id if loan else None, borrower_id=loan.borrower_id if loan else None,
                   period=cyc.period, status="received")
    session.add(doc)
    session.flush()
    try:
        parsed = parse(file_name, data)
        doc.page_count = len(parsed.pages)
        for page_no, text, has_text in parsed.pages:
            session.add(DocumentPage(document_id=doc.id, page_no=page_no, text=text, has_text_layer=has_text,
                                     token_count=len(text.split())))
            for i, chunk in enumerate(_chunks(text)):
                session.add(DocumentChunk(document_id=doc.id, namespace=f"docs:{doc.facility_id}", page_no=page_no,
                                          chunk_index=i, text=chunk,
                                          metadata_json={"file": file_name, "period": cyc.period}))
        for t in parsed.tables:
            session.add(DocumentTable(document_id=doc.id, page_no=t.page_no, table_index=t.table_index,
                                      caption=t.caption, header_json=t.header, rows_json=_jsonable(t.rows)))
        doc.status = "parsed"
        all_text = "\n".join(p[1] for p in parsed.pages)
        if doc_type:
            doc.doc_type, doc.doc_type_confidence, doc.status = doc_type, 1.0, "classified"
        else:
            classify_document(session, doc, all_text, day)
        doc.period_detected = a0_classifier.detect_period(all_text)
        doc.status = "indexed" if doc.status == "classified" else doc.status
    except Exception as exc:  # parse failed: the file still opens
        doc.status = "failed"
        audit(session, SYSTEM, "document.parse_failed", "document", doc.id, cycle_id=cycle_id, after={"error": str(exc)[:200]})
    session.flush()
    return doc


def _jsonable(rows):
    return [[c if isinstance(c, (int, float, str)) or c is None else str(c) for c in r] for r in rows]


def _chunks(text: str, size: int = 600) -> list[str]:
    words = text.split()
    step_n = int(size * 0.85)
    return [" ".join(words[i:i + size]) for i in range(0, max(len(words), 1), step_n)] if words else []


def classify_document(session: Session, doc: Document, text: str, day: int | None = None) -> None:
    threshold = float(rule(session, "classify.confidence_threshold", 0.8))
    with agent_run(session, "A0", "document_classifier", cycle_id=doc.cycle_id, input_summary=doc.file_name) as run:
        dtype, conf, hits = a0_classifier.classify(doc.file_name, text)
        step(run, "classify", {"type": dtype, "confidence": conf, "signals": hits})
        s = suggest(session, run, "extraction", "document", doc.id, {"doc_type": dtype, "signals": hits}, conf)
        doc.doc_type, doc.doc_type_confidence = dtype, conf
        if conf >= threshold:
            doc.status = "classified"
            s.status = "accepted"
            s.decided_by = "auto (above threshold)"
        run.output_summary = f"{dtype} ({conf:.2f})"
    audit(session, SYSTEM, "document.classified", "document", doc.id, cycle_id=doc.cycle_id,
          after={"doc_type": dtype, "confidence": conf, "auto_applied": conf >= threshold}, agent_run_id=run.id)


def confirm_classification(session: Session, actor: Actor, document_id: str, doc_type: str,
                           cycle_loan_id: str | None = None) -> Document:
    require(actor, "intake.manage")
    doc = session.get(Document, document_id)
    before = {"doc_type": doc.doc_type, "facility_id": doc.facility_id}
    if doc_type not in a0_classifier.DOC_TYPES:
        raise BusinessRuleError(f"Unknown document type {doc_type}")
    doc.doc_type, doc.doc_type_confirmed_by, doc.status = doc_type, actor.email, "indexed"
    if cycle_loan_id:
        cl = session.get(CycleLoan, cycle_loan_id)
        doc.facility_id, doc.borrower_id = cl.facility_id, cl.borrower_id
    sug = session.query(AgentSuggestion).filter_by(target_entity_type="document", target_entity_id=doc.id).first()
    if sug and sug.status == "proposed":
        sug.status = "accepted" if sug.payload_json.get("doc_type") == doc_type else "edited"
        sug.decided_by, sug.decided_at = actor.email, now()
    audit(session, actor, "document.classified", "document", doc.id, cycle_id=doc.cycle_id, before=before,
          after={"doc_type": doc_type, "confirmed": True, "facility_id": doc.facility_id})
    for cl in session.query(CycleLoan).filter_by(cycle_id=doc.cycle_id, borrower_id=doc.borrower_id):
        check_completeness(session, cl)
    return doc


def loan_documents(session: Session, cl: CycleLoan) -> list[Document]:
    return session.query(Document).filter_by(cycle_id=cl.cycle_id, borrower_id=cl.borrower_id).filter(
        Document.store == "uploads").order_by(Document.created_at).all()


def check_completeness(session: Session, cl: CycleLoan, day: int | None = None) -> None:
    cyc = session.get(ValuationCycle, cl.cycle_id)
    day = cyc.current_day if day is None else day
    key = "intake.required_docs.watchlist" if cl.cmr_type == "watchlist" else "intake.required_docs.standard"
    required = rule(session, key, ["financial_statements", "covenant_certificate"])
    have = {d.doc_type for d in loan_documents(session, cl)}
    missing = [r for r in required if r not in have]
    due = deadlines(session, cl.cycle_id).get("Q2")
    before = {"package_status": cl.package_status, "missing": cl.package_missing}
    if not have:
        status = "late" if due and day > due.due_day else "not_received"
    elif missing:
        status = "incomplete"
    else:
        status = "complete"
    cl.package_status, cl.package_missing = status, missing
    if status == "complete":
        complete_tasks(session, cl.id, "Q2", SYSTEM)
        if (cl.valuation_method or "Lincoln") != "Lincoln" and cl.lincoln_step in ("Q1", "Q2", "Q3", None):
            cl.lincoln_step, cl.lincoln_track_status = "Q10", "awaiting_valuation"
        if cl.dt_step in ("Q1", "Q2"):
            cl.dt_step, cl.status = "Q3", "in_progress"
            refresh_step(cl)
        if "waiver_request" in have and not session.query(Task).filter_by(cycle_loan_id=cl.id, step_code="Q5",
                                                                          title=f"{cl.borrower}: waiver request raised").first():
            session.add(Task(cycle_id=cl.cycle_id, cycle_loan_id=cl.id, step_code="Q5",
                             title=f"{cl.borrower}: waiver request raised", owner_user_id=cl.analyst_email,
                             owner_role="deal_analyst", due_day=18, status="open"))
    if before["package_status"] != status or before["missing"] != missing:
        audit(session, SYSTEM, "package.completeness_changed", "cycle_loan", cl.id, cycle_id=cl.cycle_id,
              cycle_loan_id=cl.id, before=before, after={"package_status": status, "missing": missing, "day": day})


def refresh_packages(session: Session, cycle_id: str) -> None:
    """Re-evaluate package status after the clock moves (late packages turn red)."""
    for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).filter(
            CycleLoan.package_status.in_(["not_received", "late", "incomplete"])):
        check_completeness(session, cl)


def mark_complete(session: Session, actor: Actor, cycle_loan_id: str, note: str) -> CycleLoan:
    require(actor, "intake.manage")
    if not note:
        raise BusinessRuleError("A note is required to mark a package complete by hand")
    cl = session.get(CycleLoan, cycle_loan_id)
    before = {"package_status": cl.package_status}
    cl.package_status, cl.package_missing = "complete", []
    complete_tasks(session, cl.id, "Q2", actor)
    if cl.dt_step in ("Q1", "Q2"):
        cl.dt_step, cl.status = "Q3", "in_progress"
        refresh_step(cl)
    audit(session, actor, "package.completeness_changed", "cycle_loan", cl.id, cycle_id=cl.cycle_id,
          cycle_loan_id=cl.id, before=before, after={"package_status": "complete", "note": note})
    return cl


def draft_chases(session: Session, cycle_id: str) -> list[Reminder]:
    """A8: draft reminders for packages late or incomplete on the configured cadence. People send them."""
    cyc = session.get(ValuationCycle, cycle_id)
    due = deadlines(session, cycle_id)["Q2"]
    cadence = rule(session, "chase.cadence_days", [-3, 0, 2, 4, 6])
    offset = cyc.current_day - due.due_day
    if not any(offset >= c for c in cadence):
        return []
    tpl = session.query(EmailTemplate).filter_by(code="chase_borrower").first()
    out = []
    for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).filter(
            CycleLoan.package_status.in_(["not_received", "incomplete", "late"])):
        if cl.package_status == "not_received" and offset < 0:
            continue
        if session.query(Reminder).filter_by(cycle_loan_id=cl.id, status="draft").first():
            continue
        task = session.query(Task).filter_by(cycle_loan_id=cl.id, step_code="Q2").first()
        missing = ", ".join(m.replace("_", " ") for m in (cl.package_missing or [])) or "the full Q3 2026 package"
        with agent_run(session, "A8", "chaser", cycle_id=cycle_id, cycle_loan_id=cl.id,
                       input_summary=f"{cl.borrower} {cl.package_status}") as run:
            subject, body = a8_draft(tpl.subject, tpl.body_text, {
                "borrower": cl.borrower, "missing": missing, "due_date": f"{due.due_date:%d %b %Y}",
                "days_overdue": max(offset, 0)})
            step(run, "draft", {"missing": missing, "offset": offset})
            r = Reminder(task_id=task.id if task else None, cycle_loan_id=cl.id,
                         scheduled_for=cyc.day0_date + timedelta(days=cyc.current_day), drafted_by_agent_run_id=run.id,
                         draft_subject=subject, draft_body=body, status="draft")
            session.add(r)
            session.flush()
            suggest(session, run, "reminder", "reminder", r.id, {"subject": subject, "body": body}, 0.95)
        out.append(r)
    return out


def send_chase(session: Session, actor: Actor, reminder_id: str, subject: str | None = None,
               body: str | None = None) -> Reminder:
    require(actor, "intake.manage")
    r = session.get(Reminder, reminder_id)
    if r.status != "draft":
        raise BusinessRuleError("This reminder has already been handled")
    cl = session.get(CycleLoan, r.cycle_loan_id)
    subject, body = subject or r.draft_subject, body or r.draft_body
    to = [f"finance@{cl.email_domain}"]
    msg_id, path = mailbox.send(actor.email, to, subject, body, cc=[cl.analyst_email])
    m = EmailMessage(direction="out", message_id=msg_id, thread_id=msg_id, from_addr=actor.email, to_addrs=to,
                     cc_addrs=[cl.analyst_email], subject=subject, body_text=body, sent_at=now(),
                     template_code="chase_borrower", cycle_id=cl.cycle_id, matched_facility_id=cl.facility_id,
                     matched_borrower_id=cl.borrower_id, eml_path=path, status="sent",
                     cycle_day=session.get(ValuationCycle, cl.cycle_id).current_day)
    session.add(m)
    session.flush()
    edited = (subject != r.draft_subject) or (body != r.draft_body)
    r.sent_at, r.email_message_id, r.approved_by, r.status = now(), m.id, actor.email, "sent"
    sug = session.query(AgentSuggestion).filter_by(target_entity_type="reminder", target_entity_id=r.id).first()
    if sug:
        sug.status, sug.decided_by, sug.decided_at = ("edited" if edited else "accepted"), actor.email, now()
    audit(session, actor, "email.sent", "email_message", m.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after={"template": "chase_borrower", "to": to, "subject": subject, "edited": edited},
          agent_run_id=r.drafted_by_agent_run_id)
    return r


def upload_document(session: Session, actor: Actor, cycle_loan_id: str, file_name: str, data: bytes) -> Document:
    require(actor, "intake.manage")
    cl = session.get(CycleLoan, cycle_loan_id)
    doc = ingest_document(session, cl.cycle_id, file_name, data, source="upload", loan=cl)
    audit(session, actor, "document.saved", "document", doc.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after={"file": file_name, "doc_type": doc.doc_type})
    check_completeness(session, cl)
    return doc


def document_dict(d: Document) -> dict:
    return {"id": d.id, "file_name": d.file_name, "doc_type": d.doc_type, "confidence": d.doc_type_confidence,
            "confirmed_by": d.doc_type_confirmed_by, "period": d.period_detected or d.period, "pages": d.page_count,
            "status": d.status, "store": d.store, "path": d.path, "source": d.source, "facility_id": d.facility_id,
            "created_at": d.created_at.isoformat() if d.created_at else None}
