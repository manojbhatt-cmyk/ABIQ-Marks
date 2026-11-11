"""Application schema (Transorg Data Spec.md section 5).

Every table carries id, created_at, created_by, updated_at, updated_by. Enumerations
are stored as short strings so the rules configuration can extend them without a
migration; the allowed values are listed in the comments and enforced by services.
Business entities are never deleted, only superseded (Data Spec section 9).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text,
                        UniqueConstraint)
from sqlalchemy.orm import DeclarativeBase, relationship


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Entity(Base):
    __abstract__ = True
    id = Column(String(36), primary_key=True, default=new_id)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    created_by = Column(String(120))
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    updated_by = Column(String(120))


def fk(table: str, nullable: bool = True) -> Column:
    return Column(String(36), ForeignKey(f"{table}.id"), nullable=nullable, index=True)


# ---------- 5.1 Identity and configuration ----------
class AppUser(Entity):
    __tablename__ = "app_user"
    email = Column(String(200), unique=True, nullable=False)
    display_name = Column(String(200), nullable=False)
    role = Column(String(40), nullable=False)  # pm_team, deal_analyst, deal_lead, ac_manager, sct, lincoln,
    # committee_member, committee_chair, governance, finance_ir, admin
    deal_team_id = Column(String(20))
    active = Column(Boolean, default=True)


class DealTeamRef(Entity):
    __tablename__ = "deal_team_ref"
    deal_team_id = Column(String(20), unique=True)
    team_name = Column(String(100))
    members = Column(JSON, default=list)


class RuleConfig(Entity):
    __tablename__ = "rule_config"
    key = Column(String(120), nullable=False)
    value_json = Column(JSON)
    value_type = Column(String(20))
    description = Column(Text)
    confirmed_by_client = Column(Boolean, default=False)
    confirmed_source = Column(String(200))
    discovery_question = Column(String(20))
    version = Column(Integer, default=1)
    effective_from = Column(DateTime(timezone=True), default=utcnow)
    is_current = Column(Boolean, default=True)
    change_reason = Column(Text)


class EmailTemplate(Entity):
    __tablename__ = "email_template"
    code = Column(String(60), nullable=False)
    subject = Column(Text)
    body_text = Column(Text)
    body_html = Column(Text)
    version = Column(Integer, default=1)


class CalendarTemplate(Entity):
    __tablename__ = "calendar_template"
    cycle_type = Column(String(20))
    phase = Column(Integer)
    phase_name = Column(String(80))
    step_codes = Column(JSON)
    start_day_offset = Column(Integer)
    end_day_offset = Column(Integer)
    assumed = Column(Boolean, default=True)


class SctSession(Entity):
    """SCT review sessions, shaped like the client's CMR Delivery Deadlines file."""
    __tablename__ = "sct_session"
    cycle_id = fk("valuation_cycle")
    session_date = Column(Date)
    session_name = Column(String(80))  # e.g. "Services", "DIS #1", "Healthcare Follow Up"
    reviewer = Column(String(80))
    requested_review_time = Column(String(20))  # "1BD", "1.5BD", "2BD"
    deadline = Column(String(40))
    delivery_to_sct = Column(String(40))
    minutes_per_deal = Column(JSON)  # from the Master Agenda "Timing" sheet


# ---------- 5.2 Cycle and workflow ----------
class ValuationCycle(Entity):
    __tablename__ = "valuation_cycle"
    cycle_type = Column(String(20), nullable=False)  # quarterly, monthly
    period = Column(String(20), nullable=False)  # 2026-Q3, 2026-10
    day0_date = Column(Date, nullable=False)
    deadline_date = Column(Date)
    current_day = Column(Integer, default=0)  # demo clock
    status = Column(String(20), default="draft")  # draft, open, closed, reopened
    opened_by = Column(String(120))
    closed_at = Column(DateTime(timezone=True))
    final_portfolio_value = Column(Float)
    previous_portfolio_value = Column(Float)
    __table_args__ = (UniqueConstraint("cycle_type", "period"),)


class CycleLoan(Entity):
    __tablename__ = "cycle_loan"
    cycle_id = fk("valuation_cycle", False)
    facility_id = Column(String(20), nullable=False)
    deal_id = Column(String(20))
    borrower_id = Column(String(20))
    borrower = Column(String(200))
    deal_name = Column(String(200))
    sector = Column(String(80))
    sponsor = Column(String(200))
    facility_type = Column(String(20))
    deal_team_id = Column(String(20))
    team_name = Column(String(80))
    analyst_email = Column(String(200))
    lead_email = Column(String(200))
    ac_manager_email = Column(String(200))
    email_domain = Column(String(120))
    cmr_type = Column(String(20))  # standard, watchlist
    commitment_amount = Column(Float)
    coupon_rate = Column(Float)
    maturity_date = Column(Date)
    previous_mark = Column(Float)
    previous_rating = Column(Integer)
    previous_watchlist = Column(Boolean)
    funded_amount = Column(Float)
    unfunded_amount = Column(Float)
    sct_session = Column(String(80))
    current_step = Column(String(10), default="Q1")
    status = Column(String(30), default="not_started")
    lincoln_track_status = Column(String(30), default="not_started")
    deal_team_track_status = Column(String(30), default="not_started")
    dt_step = Column(String(10), default="Q1")  # furthest step on the Deal Team track (Q4 to Q9)
    lincoln_step = Column(String(10), default="Q1")  # furthest step on the Lincoln track (Q10 to Q13)
    on_agenda = Column(Boolean, default=False)
    valuation_method = Column(String(30), default="Lincoln")  # Lincoln, AB proposal, Sponsor value, Cost
    loop_counts_json = Column(JSON, default=dict)
    late_addition = Column(Boolean, default=False)
    package_status = Column(String(30), default="not_received")  # not_received, incomplete, complete, late
    package_missing = Column(JSON, default=list)
    in_scope = Column(Boolean, default=True)
    __table_args__ = (UniqueConstraint("cycle_id", "facility_id"),)


class Deadline(Entity):
    __tablename__ = "deadline"
    cycle_id = fk("valuation_cycle", False)
    cycle_loan_id = fk("cycle_loan")
    step_code = Column(String(10))
    label = Column(String(200))
    due_day = Column(Integer)
    due_date = Column(Date)
    assumed = Column(Boolean, default=True)
    source = Column(String(80))


class Task(Entity):
    __tablename__ = "task"
    cycle_id = fk("valuation_cycle")
    cycle_loan_id = fk("cycle_loan")
    step_code = Column(String(10))
    title = Column(String(300))
    owner_user_id = Column(String(36))
    owner_role = Column(String(40))
    due_day = Column(Integer)
    due_date = Column(Date)
    status = Column(String(20), default="open")  # open, done, overdue, cancelled
    completed_at = Column(DateTime(timezone=True))
    completed_by = Column(String(120))


class Reminder(Entity):
    __tablename__ = "reminder"
    task_id = fk("task")
    cycle_loan_id = fk("cycle_loan")
    scheduled_for = Column(Date)
    sent_at = Column(DateTime(timezone=True))
    email_message_id = Column(String(36))
    drafted_by_agent_run_id = Column(String(36))
    approved_by = Column(String(120))
    draft_subject = Column(Text)
    draft_body = Column(Text)
    status = Column(String(20), default="draft")  # draft, sent, discarded


# ---------- Documents and mail (Data Spec section 4) ----------
class Document(Entity):
    __tablename__ = "document"
    store = Column(String(20))  # uploads, box, sharepoint, onedrive
    path = Column(Text)
    sha256 = Column(String(64))
    file_name = Column(String(300))
    mime = Column(String(120))
    size = Column(Integer)
    source = Column(String(20))  # email, box_watch, upload, generated
    email_message_id = Column(String(36))
    cycle_id = Column(String(36), index=True)
    facility_id = Column(String(20), index=True)
    borrower_id = Column(String(20))
    period = Column(String(20))
    doc_type = Column(String(40))
    doc_type_confidence = Column(Float)
    doc_type_confirmed_by = Column(String(120))
    period_detected = Column(String(20))
    status = Column(String(20), default="received")  # received, parsed, classified, indexed, failed
    page_count = Column(Integer)


class DocumentPage(Entity):
    __tablename__ = "document_page"
    document_id = fk("document", False)
    page_no = Column(Integer)
    text = Column(Text)
    has_text_layer = Column(Boolean, default=True)
    token_count = Column(Integer)


class DocumentTable(Entity):
    __tablename__ = "document_table"
    document_id = fk("document", False)
    page_no = Column(Integer)
    table_index = Column(Integer)
    caption = Column(Text)
    header_json = Column(JSON)
    rows_json = Column(JSON)


class DocumentChunk(Entity):
    __tablename__ = "document_chunk"
    document_id = fk("document")
    namespace = Column(String(80), index=True)
    page_no = Column(Integer)
    chunk_index = Column(Integer)
    text = Column(Text)
    metadata_json = Column(JSON)


class EmailMessage(Entity):
    __tablename__ = "email_message"
    direction = Column(String(5))  # in, out
    message_id = Column(String(200))
    thread_id = Column(String(200))
    from_addr = Column(String(200))
    to_addrs = Column(JSON)
    cc_addrs = Column(JSON)
    subject = Column(Text)
    body_text = Column(Text)
    received_at = Column(DateTime(timezone=True))
    sent_at = Column(DateTime(timezone=True))
    cycle_day = Column(Integer)
    matched_facility_id = Column(String(20))
    matched_borrower_id = Column(String(20))
    match_method = Column(String(20))  # domain, subject, manual
    template_code = Column(String(60))
    cycle_id = Column(String(36), index=True)
    attachments = Column(JSON, default=list)
    eml_path = Column(Text)
    status = Column(String(20), default="new")


# ---------- 5.3 Spreads and metrics ----------
class FinancialSpread(Entity):
    __tablename__ = "financial_spread"
    cycle_loan_id = fk("cycle_loan", False)
    facility_id = Column(String(20))
    period_end = Column(Date)
    version = Column(Integer, default=1)
    status = Column(String(20), default="proposed")  # proposed, in_review, approved, superseded
    proposed_by_agent_run_id = Column(String(36))
    approved_by = Column(String(120))
    approved_at = Column(DateTime(timezone=True))
    template_version = Column(String(20), default="v1")
    source_document_ids = Column(JSON, default=list)
    written_back_spread_id = Column(String(40))
    not_found_lines = Column(JSON, default=list)


class SpreadLineItem(Entity):
    __tablename__ = "spread_line_item"
    spread_id = fk("financial_spread", False)
    line_code = Column(String(40))
    period_type = Column(String(30))  # quarter, ltm, prior_quarter, same_quarter_last_year
    value = Column(Float)
    proposed_value = Column(Float)
    currency = Column(String(3), default="USD")
    unit = Column(String(10), default="USD m")
    confidence = Column(Float)
    evidence_json = Column(JSON)
    source_label = Column(Text)
    edited = Column(Boolean, default=False)
    edit_reason = Column(Text)


class Adjustment(Entity):
    __tablename__ = "adjustment"
    spread_id = fk("financial_spread", False)
    adj_type = Column(String(40))
    amount = Column(Float)
    description = Column(Text)
    allowed = Column(Boolean)
    evidence_json = Column(JSON)
    proposed_by = Column(String(10))  # agent, user
    accepted = Column(Boolean)
    decided_by = Column(String(120))


class Metric(Entity):
    __tablename__ = "metric"
    spread_id = fk("financial_spread", False)
    line_code = Column(String(40))
    value = Column(Float)
    formula_text = Column(Text)
    inputs_json = Column(JSON)


class CovenantTest(Entity):
    __tablename__ = "covenant_test"
    spread_id = fk("financial_spread", False)
    covenant_id = Column(String(20))
    covenant_type = Column(String(40))
    metric_line_code = Column(String(40))
    actual = Column(Float)
    threshold = Column(Float)
    operator = Column(String(3))
    result = Column(String(10))  # pass, fail
    headroom = Column(Float)
    note = Column(Text)


# ---------- 5.4 CMR ----------
class Cmr(Entity):
    __tablename__ = "cmr"
    cycle_loan_id = fk("cycle_loan", False)
    facility_id = Column(String(20))
    period = Column(String(20))
    version = Column(Integer, default=1)
    cmr_type = Column(String(20))
    status = Column(String(20), default="draft")  # draft, in_review, filed, agreed, final
    current_stage = Column(String(20))  # ac_manager, pm_team, file, sct
    author_user_id = Column(String(120))
    template_version = Column(String(20), default="ab-cmr-2026")
    spread_id = Column(String(36))
    mark_block_json = Column(JSON, default=dict)
    sharepoint_path = Column(Text)
    everest_cmr_id = Column(String(40))
    review_findings_json = Column(JSON, default=list)
    submitted_at = Column(DateTime(timezone=True))


class CmrSection(Entity):
    __tablename__ = "cmr_section"
    cmr_id = fk("cmr", False)
    section_code = Column(String(40))
    title = Column(String(120))
    sort_order = Column(Integer)
    body_markdown = Column(Text)
    drafted_by_agent_run_id = Column(String(36))
    draft_body_markdown = Column(Text)
    kept_sentence_ratio = Column(Float)
    citations_json = Column(JSON, default=list)
    status = Column(String(20), default="empty")  # empty, ai_draft, edited, final


class CmrRecommendation(Entity):
    __tablename__ = "cmr_recommendation"
    cmr_id = fk("cmr", False)
    proposed_rating = Column(Integer)
    previous_rating = Column(Integer)
    watchlist_action = Column(String(10))  # add, keep, remove, none
    waiver_requested = Column(Boolean, default=False)
    waiver_conditions = Column(Text)
    expected_mark_direction = Column(String(10))  # down, flat, up
    rationale = Column(Text)
    agent_suggestion_id = Column(String(36))


class CmrEvidence(Entity):
    __tablename__ = "cmr_evidence"
    cmr_id = fk("cmr", False)
    document_id = fk("document")
    supports = Column(String(20))
    note = Column(Text)


class CmrReview(Entity):
    __tablename__ = "cmr_review"
    cmr_id = fk("cmr", False)
    stage = Column(String(20))  # ac_manager, pm_team, sct
    reviewer_user_id = Column(String(120))
    started_at = Column(DateTime(timezone=True))
    decided_at = Column(DateTime(timezone=True))
    outcome = Column(String(20))  # passed, sent_back
    checklist_results_json = Column(JSON, default=list)
    loop_no = Column(Integer, default=0)


class CmrReviewComment(Entity):
    __tablename__ = "cmr_review_comment"
    cmr_review_id = fk("cmr_review", False)
    section_code = Column(String(40))
    text = Column(Text)
    resolved = Column(Boolean, default=False)
    resolved_by = Column(String(120))
    resolution_note = Column(Text)


class CmrFile(Entity):
    __tablename__ = "cmr_file"
    cmr_id = fk("cmr", False)
    version = Column(Integer)
    pdf_path = Column(Text)
    sha256 = Column(String(64))
    filed_by = Column(String(120))
    filed_at = Column(DateTime(timezone=True))


# ---------- 5.5 Lincoln exchange and valuations ----------
class LincolnPackage(Entity):
    __tablename__ = "lincoln_package"
    cycle_loan_id = fk("cycle_loan", False)
    version = Column(Integer, default=1)
    manifest_path = Column(Text)
    document_ids = Column(JSON, default=list)
    shared_by = Column(String(120))
    shared_at = Column(DateTime(timezone=True))
    shared_day = Column(Integer)
    acknowledged_at = Column(DateTime(timezone=True))


class LincolnValuation(Entity):
    __tablename__ = "lincoln_valuation"
    cycle_loan_id = fk("cycle_loan", False)
    facility_id = Column(String(20))
    version = Column(Integer)
    valuation_date = Column(Date)
    point_estimate = Column(Float)
    range_low = Column(Float)
    range_high = Column(Float)
    required_yield = Column(Float)
    methodology = Column(Text)
    key_assumptions = Column(Text)
    comments = Column(Text)
    report_document_id = Column(String(36))
    marks_file_document_id = Column(String(36))
    sharepoint_copy_path = Column(Text)
    loaded_to_everest = Column(Boolean, default=False)
    extracted_by_agent_run_id = Column(String(36))
    extraction_confidence = Column(Float)
    discrepancy_flag = Column(Boolean, default=False)
    discrepancy_note = Column(Text)
    received_at = Column(DateTime(timezone=True))
    received_day = Column(Integer)
    source = Column(String(30), default="lincoln")  # lincoln, ab_proposal, sponsor_value, cost
    proposed_by = Column(String(120))


class ValuationCrosscheck(Entity):
    __tablename__ = "valuation_crosscheck"
    lincoln_valuation_id = fk("lincoln_valuation", False)
    coupon_rate = Column(Float)
    years_to_maturity = Column(Float)
    required_yield = Column(Float)
    indicative_price = Column(Float)
    method = Column(String(40), default="annual_coupon_discount")
    note = Column(Text)


# ---------- 5.6 Gate G1 and the tracker ----------
class ValuationDecision(Entity):
    __tablename__ = "valuation_decision"
    cycle_loan_id = fk("cycle_loan", False)
    lincoln_valuation_id = fk("lincoln_valuation")
    loop_no = Column(Integer, default=0)
    outcome = Column(String(30))  # approved, approved_different_mark, sent_back
    approved_mark = Column(Float)
    rationale = Column(Text)
    reason_category = Column(String(40))
    note = Column(Text)
    evidence_json = Column(JSON, default=list)
    challenge_agent_run_id = Column(String(36))
    decided_by = Column(String(120))
    co_decided_by = Column(String(120))
    decided_at = Column(DateTime(timezone=True))
    decided_day = Column(Integer)
    send_back_note_path = Column(Text)


class MarksTrackerRow(Entity):
    __tablename__ = "marks_tracker_row"
    cycle_id = fk("valuation_cycle", False)
    cycle_loan_id = fk("cycle_loan", False)
    facility_id = Column(String(20))
    borrower = Column(String(200))
    deal_team = Column(String(80))
    funded_amount = Column(Float)
    previous_mark = Column(Float)
    lincoln_draft_mark = Column(Float)
    lincoln_range_low = Column(Float)
    lincoln_range_high = Column(Float)
    lincoln_version = Column(Integer)
    deal_team_mark = Column(Float)
    committee_mark = Column(Float)
    final_mark = Column(Float)
    previous_value = Column(Float)
    draft_value = Column(Float)
    current_value = Column(Float)
    final_value = Column(Float)
    delta_value = Column(Float)
    previous_rating = Column(Integer)
    current_rating = Column(Integer)
    watchlist_flag = Column(Boolean)
    waiver_status = Column(String(40))
    status = Column(String(30))
    agenda_flag = Column(Boolean, default=False)
    agenda_reasons_json = Column(JSON, default=list)
    last_updated_from = Column(String(20))
    __table_args__ = (UniqueConstraint("cycle_id", "cycle_loan_id"),)


class ImpactSummary(Entity):
    __tablename__ = "impact_summary"
    cycle_id = fk("valuation_cycle", False)
    version = Column(Integer)
    portfolio_previous_value = Column(Float)
    portfolio_current_value = Column(Float)
    delta = Column(Float)
    drivers_json = Column(JSON)
    body_text = Column(Text)
    drafted_by_agent_run_id = Column(String(36))
    sent_to = Column(JSON)
    sent_at = Column(DateTime(timezone=True))
    email_message_id = Column(String(36))


# ---------- 5.7 Committee ----------
class AgendaTestResult(Entity):
    __tablename__ = "agenda_test_result"
    cycle_loan_id = fk("cycle_loan", False)
    run_id = Column(String(36), index=True)
    test_code = Column(String(40))
    result = Column(Boolean)
    inputs_json = Column(JSON)
    rule_version = Column(Integer)
    assumed = Column(Boolean, default=True)


class CommitteeAgenda(Entity):
    __tablename__ = "committee_agenda"
    cycle_id = fk("valuation_cycle", False)
    version = Column(Integer)
    run_id = Column(String(36))
    meeting_date = Column(Date)
    built_by = Column(String(120))
    built_at = Column(DateTime(timezone=True))


class CommitteeAgendaItem(Entity):
    __tablename__ = "committee_agenda_item"
    agenda_id = fk("committee_agenda", False)
    cycle_loan_id = fk("cycle_loan", False)
    reasons_json = Column(JSON, default=list)
    source = Column(String(20))  # rules, manual_add
    manual_reason = Column(Text)
    sort_order = Column(Integer)
    removed = Column(Boolean, default=False)
    status = Column(String(20), default="pending")  # pending, decided, deferred


class CommitteePack(Entity):
    __tablename__ = "committee_pack"
    agenda_id = fk("committee_agenda", False)
    version = Column(Integer)
    cover_note = Column(Text)
    pdf_path = Column(Text)
    document_ids = Column(JSON, default=list)
    built_at = Column(DateTime(timezone=True))
    sent_email_message_id = Column(String(36))
    stale = Column(Boolean, default=False)


class CommitteeMeeting(Entity):
    """The committee meeting the PM Team organises in TIQ (Q17 to Q18). Each update is a new version."""
    __tablename__ = "committee_meeting"
    cycle_id = fk("valuation_cycle", False)
    agenda_id = fk("committee_agenda", False)
    version = Column(Integer)
    uid = Column(String(80))
    title = Column(String(200))
    meeting_date = Column(String(10))
    start_time = Column(String(5))
    timezone = Column(String(40))
    duration_minutes = Column(Integer)
    mode = Column(String(20))  # online, in_person, hybrid
    join_link = Column(Text)
    location = Column(Text)
    attendees_json = Column(JSON)
    slots_json = Column(JSON)
    note = Column(Text)
    organiser = Column(String(120))
    ics_path = Column(Text)
    message_id = Column(String(36))
    status = Column(String(20))  # sent, superseded


class CommitteePackSummary(Entity):
    __tablename__ = "committee_pack_summary"
    pack_id = fk("committee_pack", False)
    cycle_loan_id = fk("cycle_loan", False)
    body_markdown = Column(Text)
    questions_json = Column(JSON, default=list)
    drafted_by_agent_run_id = Column(String(36))
    edited = Column(Boolean, default=False)


class CommitteeDecision(Entity):
    __tablename__ = "committee_decision"
    agenda_item_id = fk("committee_agenda_item", False)
    cycle_loan_id = fk("cycle_loan", False)
    outcome = Column(String(30))  # approve, change, send_back, defer, request_information
    proposed_mark = Column(Float)
    decided_mark = Column(Float)
    rating = Column(Integer)
    watchlist_action = Column(String(10))
    waiver_decision = Column(String(30))
    conditions = Column(Text)
    rationale = Column(Text)
    members_present_json = Column(JSON, default=list)
    recorded_by = Column(String(120))
    recorded_at = Column(DateTime(timezone=True))
    send_back_to = Column(String(20))
    loop_qf_no = Column(Integer, default=0)


# ---------- 5.8 Reconciliation, approvals, governance, distribution ----------
class ReconciliationRun(Entity):
    __tablename__ = "reconciliation_run"
    cycle_id = fk("valuation_cycle", False)
    run_no = Column(Integer)
    started_at = Column(DateTime(timezone=True))
    status = Column(String(20))  # mismatches, clean
    item_count = Column(Integer)
    mismatch_count = Column(Integer)


class ReconciliationItem(Entity):
    __tablename__ = "reconciliation_item"
    run_id = fk("reconciliation_run", False)
    cycle_loan_id = fk("cycle_loan", False)
    check_code = Column(String(40))
    field = Column(String(40))
    source_a = Column(String(80))
    value_a = Column(String(40))
    source_b = Column(String(80))
    value_b = Column(String(40))
    status = Column(String(20))  # match, mismatch, resolved, explained
    resolution_action = Column(String(30))
    explanation = Column(Text)
    explainer_agent_run_id = Column(String(36))
    resolved_by = Column(String(120))
    resolved_at = Column(DateTime(timezone=True))


class ApprovalRequest(Entity):
    __tablename__ = "approval_request"
    cycle_id = fk("valuation_cycle", False)
    kind = Column(String(20))  # final_marks, monthly_marks
    schedule_json = Column(JSON)
    changes_json = Column(JSON)
    sent_email_message_id = Column(String(36))
    requested_by = Column(String(120))
    requested_at = Column(DateTime(timezone=True))
    status = Column(String(20), default="pending")


class Approval(Entity):
    __tablename__ = "approval"
    approval_request_id = fk("approval_request", False)
    approver_user_id = Column(String(120))
    decision = Column(String(20))
    comments = Column(Text)
    decided_at = Column(DateTime(timezone=True))
    reply_email_message_id = Column(String(36))
    evidence_path = Column(Text)


class GovernanceSignoff(Entity):
    __tablename__ = "governance_signoff"
    cycle_id = fk("valuation_cycle", False)
    signed_by = Column(String(120))
    signed_at = Column(DateTime(timezone=True))
    schedule_hash = Column(String(64))
    evidence_path = Column(Text)
    everest_signoff_id = Column(String(40))
    status = Column(String(20))  # signed, returned
    return_reasons = Column(Text)


class Distribution(Entity):
    __tablename__ = "distribution"
    cycle_id = fk("valuation_cycle", False)
    recipient_group = Column(String(30))
    recipients_json = Column(JSON)
    document_ids = Column(JSON)
    sent_at = Column(DateTime(timezone=True))
    email_message_id = Column(String(36))


# ---------- 5.9 Monthly ----------
class MonthlyUpdateRow(Entity):
    __tablename__ = "monthly_update_row"
    cycle_id = fk("valuation_cycle", False)
    facility_id = Column(String(20))
    borrower = Column(String(200))
    deal_team_id = Column(String(20))
    team_name = Column(String(80))
    facility_type = Column(String(20))
    current_mark = Column(Float)
    pacing_json = Column(JSON)
    sigma_json = Column(JSON)
    watchlist_notes_json = Column(JSON)
    completeness_status = Column(String(30))
    status = Column(String(20), default="not_started")  # not_started, requested, proposed, pushed_back, monthly_final
    version = Column(Integer, default=1)


class MonthlyMarkProposal(Entity):
    __tablename__ = "monthly_mark_proposal"
    cycle_id = fk("valuation_cycle", False)
    facility_id = Column(String(20))
    version = Column(Integer)
    proposed_mark = Column(Float)
    rationale = Column(Text)
    evidence_json = Column(JSON)
    assistant_agent_run_id = Column(String(36))
    proposed_by = Column(String(120))
    proposed_at = Column(DateTime(timezone=True))
    status = Column(String(20))  # draft, submitted, pushed_back, approved


class DdtlRebalance(Entity):
    __tablename__ = "ddtl_rebalance"
    cycle_id = fk("valuation_cycle", False)
    facility_id = Column(String(20))
    total_commitment = Column(Float)
    drawn_before = Column(Float)
    draws_in_month = Column(Float)
    funded_after = Column(Float)
    unfunded_after = Column(Float)
    mark_applied_to = Column(String(30))
    confirmed_by = Column(String(120))
    confirmed_at = Column(DateTime(timezone=True))
    assumed_rule = Column(Boolean, default=True)


class MonthlyMarksFile(Entity):
    __tablename__ = "monthly_marks_file"
    cycle_id = fk("valuation_cycle", False)
    version = Column(Integer)
    rows_json = Column(JSON)
    xlsx_path = Column(Text)
    consolidated_by = Column(String(120))
    consolidated_at = Column(DateTime(timezone=True))


class MonthlyDecision(Entity):
    __tablename__ = "monthly_decision"
    cycle_id = fk("valuation_cycle", False)
    facility_id = Column(String(20))
    outcome = Column(String(20))
    approved_mark = Column(Float)
    rationale = Column(Text)
    decided_by = Column(String(120))
    decided_at = Column(DateTime(timezone=True))


# ---------- 5.10 Audit and agents ----------
class AuditEvent(Entity):
    __tablename__ = "audit_event"
    occurred_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    actor_user_id = Column(String(120))
    actor_role = Column(String(40))
    action = Column(String(80), index=True)
    entity_type = Column(String(60))
    entity_id = Column(String(60), index=True)
    cycle_id = Column(String(36), index=True)
    cycle_loan_id = Column(String(36), index=True)
    before_json = Column(JSON)
    after_json = Column(JSON)
    evidence_json = Column(JSON)
    agent_run_id = Column(String(36))
    cycle_day = Column(Integer)
    request_id = Column(String(40))


class AgentRun(Entity):
    __tablename__ = "agent_run"
    component = Column(String(5), index=True)
    graph_name = Column(String(80))
    cycle_loan_id = Column(String(36), index=True)
    cycle_id = Column(String(36), index=True)
    thread_id = Column(String(120))
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))
    status = Column(String(20))
    engine = Column(String(20))  # rules, llm
    input_summary = Column(Text)
    output_summary = Column(Text)
    model_names_json = Column(JSON)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
    steps = Column(Integer, default=0)
    trajectory_json = Column(JSON, default=list)
    error = Column(Text)


class AgentSuggestion(Entity):
    __tablename__ = "agent_suggestion"
    agent_run_id = fk("agent_run", False)
    kind = Column(String(30))
    target_entity_type = Column(String(40))
    target_entity_id = Column(String(60))
    payload_json = Column(JSON)
    confidence = Column(Float)
    status = Column(String(20), default="proposed")  # proposed, accepted, edited, rejected
    decided_by = Column(String(120))
    decided_at = Column(DateTime(timezone=True))
    edit_distance = Column(Float)


# ---------- 5.11 Platform ----------
class IngestionRun(Entity):
    __tablename__ = "ingestion_run"
    source = Column(String(20))
    dataset = Column(String(80))
    as_of = Column(String(40))
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))
    rows = Column(Integer)
    status = Column(String(20))
    error = Column(Text)


class WritebackChange(Entity):
    __tablename__ = "writeback_change"
    target_schema = Column(String(40))
    target_table = Column(String(60))
    target_key_json = Column(JSON)
    payload_json = Column(JSON)
    before_json = Column(JSON)
    mode = Column(String(20))
    status = Column(String(20))
    requested_by = Column(String(120))
    requested_at = Column(DateTime(timezone=True))
    applied_by = Column(String(120))
    applied_at = Column(DateTime(timezone=True))
    tiq_entity_type = Column(String(60))
    tiq_entity_id = Column(String(60))
    tiq_entity_version = Column(Integer)
    error = Column(Text)


class Notification(Entity):
    __tablename__ = "notification"
    user_email = Column(String(200), index=True)
    link = Column(String(300))
    kind = Column(String(40))
    entity_type = Column(String(60))
    entity_id = Column(String(60))
    cycle_id = Column(String(36))
    title = Column(String(300))
    body = Column(Text)
    read_at = Column(DateTime(timezone=True))


class Message(Entity):
    """In-platform message between internal users (kickoff, impact note, pack, approvals, distribution).
    Email is used only for third parties (borrowers, Lincoln)."""
    __tablename__ = "message"
    cycle_id = Column(String(36), index=True)
    cycle_day = Column(Integer)
    sender_email = Column(String(200))
    sender_role = Column(String(40))
    recipients = Column(JSON, default=list)
    subject = Column(Text)
    body = Column(Text)
    kind = Column(String(40))  # kickoff, impact_note, committee_pack, approval_request, distribution, monthly_request, ...
    link = Column(String(300))  # screen where the recipient acts
    entity_type = Column(String(60))
    entity_id = Column(String(60))
    attachments = Column(JSON, default=list)  # [{store, path, name}]
    read_by = Column(JSON, default=list)


class Job(Entity):
    __tablename__ = "job"
    kind = Column(String(40))
    payload_json = Column(JSON)
    natural_key = Column(String(200))
    status = Column(String(20), default="queued")
    attempts = Column(Integer, default=0)
    last_error = Column(Text)


class EvalResult(Entity):
    __tablename__ = "eval_result"
    component = Column(String(5))
    eval_set = Column(String(80))
    metric = Column(String(80))
    value = Column(Float)
    detail_json = Column(JSON)
