"""CMR service: drafting (Q5, A2), submit with Review Checker (A3), reviews (Q6, Q7, Q9), filing (Q8), mark block (Q15)."""
from __future__ import annotations

import difflib
import re

from sqlalchemy.orm import Session

from agents.assistants import SECTIONS, a2_draft, a2_recommendation, a3_check
from agents.runtime import agent_run, rewrite, step, suggest
from connectors import writeback
from connectors.object_store import get_store
from domain.models import (AgentSuggestion, Adjustment, Cmr, CmrEvidence, CmrFile, CmrRecommendation, CmrReview,
                           CmrReviewComment, CmrSection, CycleLoan, Document, DocumentPage, ValuationCycle)
from domain.services.core import (Actor, BusinessRuleError, audit, bump_loop, notify, now, require, rule, snapshot)
from domain.services.cycle import complete_tasks, refresh_step, step_index
from domain.services.intake import loan_documents
from domain.services.spreads import covenant_result, current_spread, metric_values
from synth.portfolio import RATING_LABELS

STAGES = ["ac_manager", "pm_team", "sct"]


def get_or_create_cmr(session: Session, actor: Actor, cycle_loan_id: str) -> Cmr:
    cl = session.get(CycleLoan, cycle_loan_id)
    cmr = latest_cmr(session, cycle_loan_id)
    if cmr:
        return cmr
    require(actor, "cmr.edit", team=cl.deal_team_id)
    cyc = session.get(ValuationCycle, cl.cycle_id)
    sp = current_spread(session, cl.id)
    cmr = Cmr(cycle_loan_id=cl.id, facility_id=cl.facility_id, period=cyc.period, version=1, cmr_type=cl.cmr_type,
              status="draft", author_user_id=actor.email, spread_id=sp.id if sp else None, mark_block_json={},
              created_by=actor.email)
    session.add(cmr)
    session.flush()
    for i, (code, title) in enumerate(SECTIONS):
        session.add(CmrSection(cmr_id=cmr.id, section_code=code, title=title, sort_order=i, body_markdown="",
                               status="empty"))
    session.add(CmrRecommendation(cmr_id=cmr.id, previous_rating=cl.previous_rating))
    session.flush()
    audit(session, actor, "cmr.created", "cmr", cmr.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after={"version": 1, "type": cl.cmr_type})
    return cmr


def latest_cmr(session: Session, cycle_loan_id: str) -> Cmr | None:
    return session.query(Cmr).filter_by(cycle_loan_id=cycle_loan_id).order_by(Cmr.version.desc()).first()


def _note_facts(session: Session, cl: CycleLoan) -> dict:
    """Pull cited sentences from the package (notes, sponsor letter, waiver request)."""
    facts: dict[str, tuple[str, list]] = {}
    for d in loan_documents(session, cl):
        for p in session.query(DocumentPage).filter_by(document_id=d.id):
            flat = " ".join((p.text or "").split())
            cite = [{"doc_id": d.id, "file": d.file_name, "page": p.page_no}]

            def grab(pattern: str, key: str, fmt):
                m = re.search(pattern, flat, re.I)
                if m and key not in facts:
                    facts[key] = (fmt(m), cite)

            grab(r"largest customer, representing (\d+) percent of revenue", "customer",
                 lambda m: f"The Company lost its largest customer ({m.group(1)} percent of revenue) effective 1 July 2026.")
            grab(r"eliminated (\d+) driver positions and incurred one-off severance costs of \$([\d.]+) million",
                 "restructuring", lambda m: f"Management cut {m.group(1)} driver positions; one-off severance of "
                                            f"${m.group(2)}M is added back.")
            grab(r"Two replacement contracts were signed in (\w+ \d{4})", "replacement",
                 lambda m: f"Two replacement contracts were signed in {m.group(1)}.")
            grab(r"operates (\d+) trucks with an appraised collateral value of approximately \$([\d.]+) million",
                 "collateral", lambda m: f"Collateral: {m.group(1)} trucks with an appraised value of about "
                                         f"${m.group(2)}M.")
            if d.doc_type == "sponsor_letter":
                grab(r"([A-Z][\w]*(?: [A-Z][\w]*){0,3}) hereby confirms its commitment to contribute \$([\d.]+) million",
                     "sponsor", lambda m: f"{m.group(1).strip()} has committed ${m.group(2)}M of new equity "
                                          f"(letter dated 6 October 2026; funds due 30 October).")
            if d.doc_type == "waiver_request":
                grab(r"requests a waiver of the maximum total leverage covenant \(([\d.]+)x\)", "waiver",
                     lambda m: f"The Company has requested a waiver of the {m.group(1)}x leverage covenant, "
                               f"proposing monthly reporting and a 3.25x step-down by 30 June 2027.")
    return facts


def draft_sections(session: Session, actor: Actor, cmr_id: str, codes: list[str] | None = None) -> list[CmrSection]:
    cmr = session.get(Cmr, cmr_id)
    cl = session.get(CycleLoan, cmr.cycle_loan_id)
    require(actor, "cmr.edit", team=cl.deal_team_id)
    sp = current_spread(session, cl.id)
    if not sp or sp.status != "approved":
        raise BusinessRuleError("Approve the spread before drafting the CMR")
    mets = metric_values(session, cl.id)
    cov = covenant_result(session, cl.id)
    notes = _note_facts(session, cl)
    fin_docs = [d for d in loan_documents(session, cl) if d.doc_type == "financial_statements"]
    fs_cite = [{"doc_id": d.id, "file": d.file_name, "page": 1, "spread_id": sp.id} for d in fin_docs]
    rec_hint = a2_recommendation(mets, cov, cl.previous_rating or 2, bool(cl.previous_watchlist), "sponsor" in notes)
    with agent_run(session, "A2", "cmr_drafting", cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
                   input_summary=f"{cl.borrower} sections {codes or 'all'}") as run:
        step(run, "gather_facts", {"metrics": list(mets), "notes": list(notes)})
        drafts = a2_draft({"borrower": cl.borrower, "metrics": mets, "covenant": cov, "notes": notes,
                           "cites": {"financials": fs_cite}, "sponsor": cl.sponsor, "recommendation_hint": rec_hint})
        out = []
        for s in session.query(CmrSection).filter_by(cmr_id=cmr.id).order_by(CmrSection.sort_order):
            if codes and s.section_code not in codes:
                continue
            d = drafts.get(s.section_code)
            if not d:
                continue
            body = rewrite(run, d["body"], "Tighten the wording for a credit memo section.", heavy=True)
            s.draft_body_markdown, s.citations_json, s.drafted_by_agent_run_id = body, d["citations"], run.id
            if not s.body_markdown:
                s.status = "ai_draft"
            suggest(session, run, "cmr_section", "cmr_section", s.id, {"body": body, "citations": d["citations"]}, 0.85)
            step(run, "draft_section", s.section_code)
            out.append(s)
        rec = session.query(CmrRecommendation).filter_by(cmr_id=cmr.id).first()
        sug = suggest(session, run, "recommendation", "cmr_recommendation", rec.id, rec_hint, 0.8)
        rec.agent_suggestion_id = sug.id
        run.output_summary = f"{len(out)} sections drafted"
    audit(session, actor, "cmr.section_drafted", "cmr", cmr.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after={"sections": [s.section_code for s in out]}, agent_run_id=run.id)
    return out


def _kept_ratio(draft: str, final: str) -> float:
    ds = [s.strip() for s in re.split(r"(?<=[.!?])\s+", draft or "") if s.strip()]
    if not ds:
        return 0.0
    fs = set(s.strip() for s in re.split(r"(?<=[.!?])\s+", final or ""))
    return round(sum(1 for s in ds if s in fs) / len(ds), 3)


def decide_section(session: Session, actor: Actor, section_id: str, action: str, body: str | None = None) -> CmrSection:
    """action: accept | edit | reject (of the TIQ draft) or save (manual text)."""
    s = session.get(CmrSection, section_id)
    cmr = session.get(Cmr, s.cmr_id)
    cl = session.get(CycleLoan, cmr.cycle_loan_id)
    require(actor, "cmr.edit", team=cl.deal_team_id)
    if cmr.status not in ("draft",):
        raise BusinessRuleError("The CMR is not editable in its current status")
    before = {"body": s.body_markdown, "status": s.status}
    if action == "accept":
        s.body_markdown, s.status = s.draft_body_markdown, "final"
    elif action in ("edit", "save"):
        s.body_markdown, s.status = body or "", "edited"
    elif action == "reject":
        s.status = "empty" if not s.body_markdown else s.status
    if s.draft_body_markdown:
        s.kept_sentence_ratio = _kept_ratio(s.draft_body_markdown, s.body_markdown)
        sug = session.query(AgentSuggestion).filter_by(target_entity_type="cmr_section", target_entity_id=s.id,
                                                       status="proposed").first()
        if sug:
            sug.status = {"accept": "accepted", "edit": "edited", "save": "edited", "reject": "rejected"}[action]
            sug.decided_by, sug.decided_at = actor.email, now()
            sug.edit_distance = round(1 - difflib.SequenceMatcher(None, s.draft_body_markdown, s.body_markdown or "").ratio(), 3)
    audit(session, actor, "cmr.edited", "cmr_section", s.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id, before=before,
          after={"section": s.section_code, "action": action, "kept_sentence_ratio": s.kept_sentence_ratio})
    return s


def set_recommendation(session: Session, actor: Actor, cmr_id: str, data: dict) -> CmrRecommendation:
    cmr = session.get(Cmr, cmr_id)
    cl = session.get(CycleLoan, cmr.cycle_loan_id)
    require(actor, "cmr.edit", team=cl.deal_team_id)
    rec = session.query(CmrRecommendation).filter_by(cmr_id=cmr_id).first()
    fields = ["proposed_rating", "watchlist_action", "waiver_requested", "waiver_conditions",
              "expected_mark_direction", "rationale"]
    before = snapshot(rec, fields)
    for f in fields:
        if f in data:
            setattr(rec, f, data[f])
    if not rec.rationale:
        raise BusinessRuleError("A rationale is required for the recommendation")
    if rec.agent_suggestion_id:
        sug = session.get(AgentSuggestion, rec.agent_suggestion_id)
        if sug and sug.status == "proposed":
            same = all(sug.payload_json.get(k) == getattr(rec, k) for k in ("proposed_rating", "watchlist_action",
                                                                             "expected_mark_direction"))
            sug.status, sug.decided_by, sug.decided_at = ("accepted" if same else "edited"), actor.email, now()
    audit(session, actor, "cmr.recommendation_set", "cmr_recommendation", rec.id, cycle_id=cl.cycle_id,
          cycle_loan_id=cl.id, before=before, after=snapshot(rec, fields))
    return rec


def attach_evidence(session: Session, actor: Actor, cmr_id: str, document_id: str, supports: str = "other",
                    note: str = "") -> CmrEvidence:
    cmr = session.get(Cmr, cmr_id)
    cl = session.get(CycleLoan, cmr.cycle_loan_id)
    require(actor, "cmr.edit", team=cl.deal_team_id)
    ev = session.query(CmrEvidence).filter_by(cmr_id=cmr_id, document_id=document_id).first()
    if not ev:
        ev = CmrEvidence(cmr_id=cmr_id, document_id=document_id, supports=supports, note=note)
        session.add(ev)
        session.flush()
        audit(session, actor, "cmr.evidence_attached", "cmr", cmr_id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
              after={"document_id": document_id, "supports": supports})
    return ev


def run_review_checker(session: Session, cmr: Cmr, stage: str = "pm_team") -> list[dict]:
    cl = session.get(CycleLoan, cmr.cycle_loan_id)
    sections = {s.section_code: s.body_markdown or "" for s in session.query(CmrSection).filter_by(cmr_id=cmr.id)}
    ev_types = [session.get(Document, e.document_id).doc_type for e in session.query(CmrEvidence).filter_by(cmr_id=cmr.id)]
    rec = session.query(CmrRecommendation).filter_by(cmr_id=cmr.id).first()
    sp = current_spread(session, cl.id)
    addbacks = [{"accepted": a.accepted, "allowed": a.allowed} for a in session.query(Adjustment).filter_by(spread_id=sp.id)] if sp else []
    with agent_run(session, "A3", "review_checker", cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
                   input_summary=f"{cl.borrower} CMR v{cmr.version} {stage}") as run:
        findings = a3_check({"sections": sections, "evidence_types": ev_types,
                             "recommendation": snapshot(rec, ["proposed_rating", "previous_rating",
                                                              "expected_mark_direction"]),
                             "metrics": metric_values(session, cl.id), "addbacks": addbacks,
                             "covenant_result": covenant_result(session, cl.id).get("result")})
        step(run, "checklist", findings)
        for f in findings:
            if f["result"] != "pass":
                suggest(session, run, "review_finding", "cmr", cmr.id, f, 0.9)
        run.output_summary = f"{sum(1 for f in findings if f['result'] != 'pass')} findings"
    cmr.review_findings_json = findings
    return findings


def submit(session: Session, actor: Actor, cmr_id: str, acknowledge_warnings: bool = False) -> dict:
    cmr = session.get(Cmr, cmr_id)
    cl = session.get(CycleLoan, cmr.cycle_loan_id)
    require(actor, "cmr.edit", team=cl.deal_team_id)
    if cmr.status != "draft":
        raise BusinessRuleError("Only a draft CMR can be submitted")
    rec = session.query(CmrRecommendation).filter_by(cmr_id=cmr.id).first()
    if not rec.proposed_rating or not rec.rationale:
        raise BusinessRuleError("Set the recommendation (rating and rationale) before submitting")
    empty = [s.title for s in session.query(CmrSection).filter_by(cmr_id=cmr.id) if not (s.body_markdown or "").strip()
             and s.section_code not in ("mark_direction", "evidence")]
    if empty:
        raise BusinessRuleError(f"Sections still empty: {', '.join(empty)}")
    findings = run_review_checker(session, cmr)
    warnings = [f for f in findings if f["result"] != "pass"]
    if warnings and not acknowledge_warnings:
        return {"submitted": False, "findings": findings}
    loop = sum(1 for _ in session.query(CmrReview).filter_by(cmr_id=cmr.id, outcome="sent_back"))
    cmr.status, cmr.current_stage, cmr.submitted_at = "in_review", "ac_manager", now()
    session.add(CmrReview(cmr_id=cmr.id, stage="ac_manager", reviewer_user_id=cl.ac_manager_email, started_at=now(),
                          checklist_results_json=[], loop_no=loop))
    cl.deal_team_track_status, cl.status = "in_review", "in_review"
    if step_index(cl.dt_step) < step_index("Q6"):
        cl.dt_step = "Q6"
    refresh_step(cl)
    complete_tasks(session, cl.id, "Q5", actor)
    notify(session, [cl.ac_manager_email], "review", f"{cl.borrower} CMR ready for A/C Manager review",
           entity_type="cmr", entity_id=cmr.id, cycle_id=cl.cycle_id)
    audit(session, actor, "cmr.submitted", "cmr", cmr.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after={"version": cmr.version, "warnings_acknowledged": [w["item"] for w in warnings]})
    return {"submitted": True, "findings": findings}


def open_review(session: Session, cmr: Cmr) -> CmrReview | None:
    return session.query(CmrReview).filter_by(cmr_id=cmr.id, stage=cmr.current_stage, outcome=None).order_by(
        CmrReview.created_at.desc()).first()


def add_comment(session: Session, actor: Actor, review_id: str, section_code: str, text: str) -> CmrReviewComment:
    rv = session.get(CmrReview, review_id)
    require(actor, f"cmr.review.{rv.stage}")
    if not text:
        raise BusinessRuleError("A comment needs text")
    c = CmrReviewComment(cmr_review_id=rv.id, section_code=section_code, text=text)
    session.add(c)
    session.flush()
    cmr = session.get(Cmr, rv.cmr_id)
    cl = session.get(CycleLoan, cmr.cycle_loan_id)
    notify(session, [cl.analyst_email], "review_comment", f"{cl.borrower}: new {rv.stage} comment", text,
           entity_type="cmr", entity_id=cmr.id, cycle_id=cl.cycle_id)
    audit(session, actor, "cmr.review_comment", "cmr_review", rv.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after={"section": section_code, "text": text})
    return c


def decide_review(session: Session, actor: Actor, review_id: str, outcome: str,
                  checklist: list[dict] | None = None) -> CmrReview:
    rv = session.get(CmrReview, review_id)
    require(actor, f"cmr.review.{rv.stage}")
    cmr = session.get(Cmr, rv.cmr_id)
    cl = session.get(CycleLoan, cmr.cycle_loan_id)
    if rv.outcome:
        raise BusinessRuleError("This review is already decided")
    comments = session.query(CmrReviewComment).filter_by(cmr_review_id=rv.id).all()
    checklist = checklist if checklist is not None else (rv.checklist_results_json or [])
    if outcome == "passed":
        failed = [c for c in checklist if c.get("result") == "fail"]
        if failed and not comments:
            raise BusinessRuleError("A failed checklist item needs a comment before Pass")
    elif outcome == "sent_back":
        if not comments:
            raise BusinessRuleError("Send back requires at least one comment")
    elif outcome == "deferred":
        if rv.stage != "sct":
            raise BusinessRuleError("Only the SCT can defer a deal to a follow-up session")
        if not comments:
            raise BusinessRuleError("Say why the deal is deferred (add a comment)")
        rv.outcome, rv.decided_at, rv.reviewer_user_id = "deferred", now(), actor.email
        from domain.services.sct import defer_to_follow_up

        target = defer_to_follow_up(session, cl)
        session.add(CmrReview(cmr_id=cmr.id, stage="sct", started_at=now(), loop_no=rv.loop_no))
        audit(session, actor, "cmr.review_outcome", "cmr_review", rv.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
              after={"stage": "sct", "outcome": "deferred", "follow_up_session": target})
        return rv
    else:
        raise BusinessRuleError("Outcome must be passed, sent_back or deferred")
    rv.outcome, rv.decided_at, rv.reviewer_user_id, rv.checklist_results_json = outcome, now(), actor.email, checklist
    if outcome == "sent_back":
        bump_loop(cl, "QB")
        cmr.status, cmr.current_stage = "draft", None
        cl.deal_team_track_status, cl.status, cl.dt_step = "cmr_draft", "sent_back", "Q5"
        refresh_step(cl)
        notify(session, [cl.analyst_email], "sent_back", f"{cl.borrower} CMR sent back by {rv.stage}",
               entity_type="cmr", entity_id=cmr.id, cycle_id=cl.cycle_id)
    elif rv.stage == "ac_manager":
        cmr.current_stage = "pm_team"
        session.add(CmrReview(cmr_id=cmr.id, stage="pm_team", started_at=now(), loop_no=rv.loop_no,
                              checklist_results_json=run_review_checker(session, cmr)))
        cl.dt_step = "Q7"
    elif rv.stage == "pm_team":
        cmr.current_stage = "file"
        cl.dt_step = "Q8"
    elif rv.stage == "sct":
        cmr.current_stage = None
        unresolved_sct = [c for c in comments if not c.resolved]
        cmr.status = "filed" if unresolved_sct else "agreed"
        cl.deal_team_track_status = "refile" if unresolved_sct else "agreed"
        cl.dt_step = "Q9" if unresolved_sct else "Q13"
    if outcome == "passed" and cl.status in ("in_review", "sent_back"):
        cl.status = "in_review" if rv.stage != "sct" else "in_progress"
    refresh_step(cl)
    audit(session, actor, "cmr.review_outcome", "cmr_review", rv.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after={"stage": rv.stage, "outcome": outcome, "comments": len(comments),
                 "checklist": [(c.get("item"), c.get("result")) for c in checklist]})
    return rv


def resolve_comment(session: Session, actor: Actor, comment_id: str, note: str) -> CmrReviewComment:
    c = session.get(CmrReviewComment, comment_id)
    rv = session.get(CmrReview, c.cmr_review_id)
    cmr = session.get(Cmr, rv.cmr_id)
    cl = session.get(CycleLoan, cmr.cycle_loan_id)
    require(actor, "cmr.edit", team=cl.deal_team_id)
    c.resolved, c.resolved_by, c.resolution_note = True, actor.email, note
    audit(session, actor, "cmr.comment_resolved", "cmr_review_comment", c.id, cycle_id=cl.cycle_id,
          cycle_loan_id=cl.id, after={"note": note})
    return c


def file_cmr(session: Session, actor: Actor, cmr_id: str) -> CmrFile:
    """Q8 (and re-file after SCT): render the PDF, save it to SharePoint, write the CMR and rating to Everest."""
    require(actor, "cmr.file")
    cmr = session.get(Cmr, cmr_id)
    cl = session.get(CycleLoan, cmr.cycle_loan_id)
    refile = cmr.status in ("filed",) and cmr.current_stage is None
    if not refile and cmr.current_stage != "file":
        raise BusinessRuleError("The CMR must pass the A/C Manager and PM Team reviews before filing")
    if refile:
        open_sct = [c for rv in session.query(CmrReview).filter_by(cmr_id=cmr.id, stage="sct")
                    for c in session.query(CmrReviewComment).filter_by(cmr_review_id=rv.id, resolved=False)]
        if open_sct:
            raise BusinessRuleError("Resolve the SCT comments before re-filing")
        cmr.version += 1
    from domain.render_cmr import render_cmr_pdf

    cyc = session.get(ValuationCycle, cl.cycle_id)
    pdf = render_cmr_pdf(session, cmr)
    from domain.services.lincoln import slug

    path = f"PrivateCredit/Valuation/{cyc.period}/CMRs/{slug(cl.borrower)}-{cl.facility_id}-v{cmr.version}.pdf"
    digest = get_store().put("sharepoint", path, pdf)
    f = CmrFile(cmr_id=cmr.id, version=cmr.version, pdf_path=path, sha256=digest, filed_by=actor.email, filed_at=now())
    session.add(f)
    cmr.sharepoint_path = path
    rec = session.query(CmrRecommendation).filter_by(cmr_id=cmr.id).first()
    everest_id = f"CMR-{cl.facility_id[2:]}-{cyc.period}"
    writeback.upsert(session, "EVEREST", "CMR", {"CMR_ID": everest_id},
                     {"FACILITY_ID": cl.facility_id, "PERIOD": cyc.period, "VERSION": cmr.version,
                      "CMR_TYPE": cmr.cmr_type, "STATUS": "filed", "AUTHOR": cmr.author_user_id,
                      "FILED_AT": now().isoformat(timespec="seconds")[:19], "SHAREPOINT_PATH": path},
                     actor=actor.email, tiq_entity_type="cmr", tiq_entity_id=cmr.id, tiq_entity_version=cmr.version)
    wl = (rec.watchlist_action in ("add", "keep"))
    writeback.upsert(session, "EVEREST", "RISK_RATING", {"FACILITY_ID": cl.facility_id, "PERIOD": cyc.period},
                     {"RATING": rec.proposed_rating, "RATING_LABEL": RATING_LABELS.get(rec.proposed_rating, ""),
                      "PREVIOUS_RATING": cl.previous_rating, "WATCHLIST_FLAG": wl,
                      "WAIVER_STATUS": "requested" if rec.waiver_requested else "none",
                      "WAIVER_CONDITIONS": rec.waiver_conditions, "SET_BY": cmr.author_user_id,
                      "SET_AT": now().isoformat(timespec="seconds")[:19]},
                     actor=actor.email, tiq_entity_type="cmr_recommendation", tiq_entity_id=rec.id,
                     tiq_entity_version=cmr.version)
    cmr.everest_cmr_id = everest_id
    if refile:
        cmr.status = "agreed"
        cl.deal_team_track_status, cl.dt_step = "agreed", "Q13"
    else:
        cmr.status, cmr.current_stage = "filed", "sct"
        session.add(CmrReview(cmr_id=cmr.id, stage="sct", started_at=now()))
        cl.deal_team_track_status, cl.dt_step = "filed", "Q9"
    refresh_step(cl)
    audit(session, actor, "cmr.filed", "cmr", cmr.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after={"version": cmr.version, "path": f"sharepoint/{path}", "sha256": digest})
    audit(session, actor, "everest.cmr_written", "cmr", cmr.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after={"cmr_id": everest_id, "rating": rec.proposed_rating})
    return f


def attach_mark(session: Session, actor: Actor, cycle_loan_id: str, decision) -> Cmr:
    """Q15: the approved G1 mark goes into the CMR mark block and Everest."""
    cmr = latest_cmr(session, cycle_loan_id)
    if not cmr:
        return None
    cl = session.get(CycleLoan, cycle_loan_id)
    from domain.services.lincoln import latest_valuation

    lv = latest_valuation(session, cl.id)
    block = dict(cmr.mark_block_json or {})
    block.update({"mark": decision.approved_mark, "range_low": lv.range_low if lv else None,
                  "range_high": lv.range_high if lv else None, "approved_by": decision.decided_by,
                  "approved_at": decision.decided_at.isoformat(), "lincoln_version": lv.version if lv else None})
    cmr.mark_block_json = block
    cyc = session.get(ValuationCycle, cl.cycle_id)
    writeback.upsert(session, "EVEREST", "CMR", {"CMR_ID": cmr.everest_cmr_id or f"CMR-{cl.facility_id[2:]}-{cyc.period}"},
                     {"MARK": decision.approved_mark, "MARK_RANGE_LOW": block["range_low"],
                      "MARK_RANGE_HIGH": block["range_high"], "MARK_APPROVED_BY": decision.decided_by,
                      "MARK_APPROVED_AT": decision.decided_at.isoformat(timespec="seconds")[:19]},
                     actor=actor.email, tiq_entity_type="cmr_mark_block", tiq_entity_id=cmr.id,
                     tiq_entity_version=decision.loop_no + 1)
    audit(session, actor, "cmr.mark_attached", "cmr", cmr.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          after=block)
    return cmr


def cmr_view(session: Session, cycle_loan_id: str) -> dict | None:
    cmr = latest_cmr(session, cycle_loan_id)
    if not cmr:
        return None
    rec = session.query(CmrRecommendation).filter_by(cmr_id=cmr.id).first()
    reviews = session.query(CmrReview).filter_by(cmr_id=cmr.id).order_by(CmrReview.created_at).all()
    rec_sug = session.get(AgentSuggestion, rec.agent_suggestion_id) if rec.agent_suggestion_id else None
    return {
        "cmr": {"id": cmr.id, "version": cmr.version, "status": cmr.status, "stage": cmr.current_stage,
                "type": cmr.cmr_type, "mark_block": cmr.mark_block_json, "sharepoint_path": cmr.sharepoint_path,
                "findings": cmr.review_findings_json, "author": cmr.author_user_id},
        "sections": [{"id": s.id, "code": s.section_code, "title": s.title, "body": s.body_markdown,
                      "draft": s.draft_body_markdown, "citations": s.citations_json, "status": s.status,
                      "kept_ratio": s.kept_sentence_ratio,
                      "comments": sum(1 for rv in reviews for c in session.query(CmrReviewComment).filter_by(
                          cmr_review_id=rv.id, section_code=s.section_code) if not c.resolved)}
                     for s in session.query(CmrSection).filter_by(cmr_id=cmr.id).order_by(CmrSection.sort_order)],
        "recommendation": snapshot(rec, ["id", "proposed_rating", "previous_rating", "watchlist_action",
                                         "waiver_requested", "waiver_conditions", "expected_mark_direction",
                                         "rationale"]),
        "recommendation_suggestion": {"id": rec_sug.id, "payload": rec_sug.payload_json, "status": rec_sug.status}
        if rec_sug else None,
        "evidence": [{"id": e.id, "document_id": e.document_id, "supports": e.supports,
                      "file_name": session.get(Document, e.document_id).file_name,
                      "doc_type": session.get(Document, e.document_id).doc_type}
                     for e in session.query(CmrEvidence).filter_by(cmr_id=cmr.id)],
        "reviews": [{"id": rv.id, "stage": rv.stage, "outcome": rv.outcome, "reviewer": rv.reviewer_user_id,
                     "loop_no": rv.loop_no, "checklist": rv.checklist_results_json,
                     "decided_at": rv.decided_at.isoformat() if rv.decided_at else None,
                     "comments": [{"id": c.id, "section": c.section_code, "text": c.text, "resolved": c.resolved,
                                   "resolution_note": c.resolution_note}
                                  for c in session.query(CmrReviewComment).filter_by(cmr_review_id=rv.id)]}
                    for rv in reviews],
        "files": [{"version": f.version, "path": f.pdf_path, "filed_by": f.filed_by, "filed_at": f.filed_at.isoformat()}
                  for f in session.query(CmrFile).filter_by(cmr_id=cmr.id).order_by(CmrFile.version)],
        "rating_labels": RATING_LABELS,
        "checklist_rule": rule(session, "review.checklist.pm_team"),
    }


def review_queue(session: Session, actor: Actor, cycle_id: str) -> list[dict]:
    stage_for = {"ac_manager": "ac_manager", "pm_team": "pm_team", "sct": "sct"}
    out = []
    for cmr in session.query(Cmr).join(CycleLoan, CycleLoan.id == Cmr.cycle_loan_id).filter(CycleLoan.cycle_id == cycle_id):
        cl = session.get(CycleLoan, cmr.cycle_loan_id)
        stage = cmr.current_stage
        mine = (stage == stage_for.get(actor.role)) or (stage == "file" and actor.role == "pm_team") or \
               (actor.role in ("deal_analyst", "deal_lead") and cl.deal_team_id == actor.deal_team_id) or \
               actor.role == "admin"
        if not stage and actor.role not in ("deal_analyst", "deal_lead", "admin"):
            continue
        if not mine:
            continue
        rv = open_review(session, cmr)
        out.append({"cmr_id": cmr.id, "cycle_loan_id": cl.id, "borrower": cl.borrower, "facility_id": cl.facility_id,
                    "team": cl.team_name, "stage": stage, "status": cmr.status, "version": cmr.version,
                    "review_id": rv.id if rv else None, "loops": (cl.loop_counts_json or {}).get("QB", 0),
                    "due_day": {"ac_manager": 19, "pm_team": 21, "file": 24, "sct": 26}.get(stage)})
    return out
