"""`synth seed-app`: users, rule configuration, calendar and email templates (Data Spec sections 3.5, 5.1, 8)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from domain.models import AppUser, CalendarTemplate, DealTeamRef, EmailTemplate, RuleConfig
from synth.portfolio import TEAMS, team_emails, users

# key, value, type, description, confirmed, discovery question
RULES = [
    ("cycle.length_days", 45, "int", "Quarterly cycle length in days after quarter end", False, "DQ1"),
    ("intake.required_docs.standard", ["financial_statements", "covenant_certificate"], "list",
     "Documents required for a standard CMR package", False, "DQ5"),
    ("intake.required_docs.watchlist", ["financial_statements", "covenant_certificate", "sponsor_letter"], "list",
     "Documents required for a watchlist CMR package", False, "DQ5"),
    ("reminder.lead_days", 2, "int", "Days before a deadline when TIQ reminds the task owner", False, "DQ6"),
    ("chase.cadence_days", [-3, 0, 2, 4, 6], "list", "Reminder days relative to the due date", False, "DQ6"),
    ("spread.addback_allowlist", ["severance", "restructuring", "non_recurring_legal"], "list",
     "Add-back types allowed without exception", False, "DQ8"),
    ("spread.ltm_quarters", 4, "int", "Quarters in the LTM window", False, "DQ7"),
    ("review.stage_order", ["ac_manager", "pm_team", "file", "sct"], "list", "CMR review order", False, "DQ10"),
    ("review.checklist.pm_team", ["ratios_on_ltm", "addbacks_allowed", "recommendation_consistent",
                                  "evidence_attached"], "list", "PM Team review checklist", False, "DQ11"),
    ("agenda.tests", ["watchlist", "downgrade", "mark_move_10pct", "outside_lincoln_range", "g1_unresolved"], "list",
     "Agenda tests (the fifth is a TIQ addition)", False, "DQ17"),
    ("agenda.mark_move_threshold", 0.10, "float", "Mark move that puts a loan on the agenda, either way", False, "DQ17"),
    ("agenda.manual_add_allowed", True, "bool", "PM Team may add a loan to the agenda manually", False, "DQ17"),
    ("g1.max_send_back_loops", 3, "int", "Maximum send-backs to Lincoln per loan", False, "DQ15"),
    ("g1.allow_different_mark", True, "bool", "Deal Team may approve at a mark other than Lincoln's point",
     False, "DQ15"),
    ("g1.co_decision_required", False, "bool", "Deal Team lead must co-decide G1", False, "DQ15"),
    ("committee.send_back_allowed", True, "bool", "Committee may send a loan back (loop QF)", False, "DQ18"),
    ("classify.confidence_threshold", 0.8, "float", "Below this a person confirms the document type", False, None),
    ("cert.tolerance", 0.05, "float", "Covenant certificate vs TIQ ratio tolerance (x)", False, "DQ9"),
    ("committee.outcomes", ["approve", "change", "send_back", "defer", "request_information"], "list",
     "Committee outcome set", False, "DQ18"),
    ("committee.rationale_required_for", ["change", "send_back", "defer"], "list",
     "Outcomes that need a rationale", False, "DQ18"),
    ("reconciliation.checks", ["mark_tracker_vs_everest", "rating_everest_vs_cmr", "funded_tracker_vs_sentry",
                               "mark_cmr_vs_tracker"], "list", "Reconciliation checks", False, "DQ19"),
    ("reconciliation.mark_tolerance", 0.0, "float", "Allowed mark difference", False, "DQ19"),
    ("monthly.ddtl.mark_applied_to", "funded", "str", "DDTL mark applies to funded or funded and unfunded",
     False, "DQ16"),
    ("source.dealcloud.location", "snowflake", "str", "Where DealCloud data lives", True, "DQ4"),
    ("source.everest.location", "snowflake", "str", "Where Everest data lives", True, "DQ20"),
    ("source.sentry.location", "snowflake", "str", "Where Sentry data lives", False, "DQ20"),
    ("writeback.mode", "synthetic_write", "str", "Write-back mode (production default queue)", False, None),
    ("impact.recipients", ["wes.finance@ab-poc.local", "justin.finance@ab-poc.local"], "list",
     "Finance leads who receive the impact note", False, "DQ13"),
]

# Default step deadlines (Data Spec section 8), * = from the source notes.
QUARTERLY_PHASES = [
    (1, "Kickoff and intake", ["Q1", "Q2", "Q3"], 1, 9),
    (2, "Modelling and CMR", ["Q4", "Q5", "Q6", "Q7", "Q8", "Q9"], 10, 26),
    (3, "Lincoln draft marks", ["Q10", "Q11", "Q12", "Q13"], 18, 30),
    (4, "Deal Team approval", ["Q14", "Q15"], 27, 31),
    (5, "Valuation Committee", ["Q16", "Q17", "Q18"], 36, 43),
    (6, "Finalise and distribute", ["Q19", "Q20", "Q21", "Q22"], 44, 45),
]
STEP_DEADLINES = {"Q1": (1, "Kickoff sent", True), "Q2": (8, "Borrower packages due", True),
                  "Q3": (9, "Package shared with Lincoln", True), "Q4": (18, "Spread approved", False),
                  "Q5": (18, "CMR draft submitted", False), "Q6": (19, "A/C Manager review", True),
                  "Q7": (21, "PM Team review", False), "Q8": (24, "CMR filed", False),
                  "Q9": (26, "SCT review", False), "Q10": (20, "Lincoln first draft", True),
                  "Q11": (27, "Tracker and impact note", False), "Q12": (28, "Marks loaded to Everest", False),
                  "Q13": (28, "Lincoln reports copied", False), "Q14": (31, "G1 decision", True),
                  "Q15": (31, "Mark attached to CMR", True), "Q16": (36, "Agenda built", False),
                  "Q17": (38, "Pack sent", False), "Q18": (42, "Committee meeting", False),
                  "Q19": (44, "Reconciliation clean", False), "Q20": (44, "Written approval", False),
                  "Q21": (44, "Governance sign-off", False), "Q22": (44, "Distribution, cycle closed", True)}
MONTHLY_PHASES = [(1, "Monthly marks", ["M1", "M2", "M3", "M4", "M5", "M6"], 1, 10)]

TEMPLATES = {
    "kickoff": ("{period} quarterly marks kickoff: {team_name}",
                "Hello {team_name},\n\nThe {period} quarterly marks cycle has started. Your loans this quarter:\n\n"
                "{loan_lines}\n\nKey dates:\n{date_lines}\n\nPlease make sure borrower packages reach you by the "
                "financials due date and copy the PM Team.\n\nThank you,\nPM Team"),
    "chase_borrower": ("Reminder: {borrower} Q3 2026 reporting package",
                       "Dear {borrower} finance team,\n\nWe have not yet received the following items for the "
                       "period ended 30 September 2026: {missing}. They were due on {due_date} "
                       "({days_overdue} days ago).\n\nCould you send them at your earliest convenience?\n\n"
                       "Kind regards,\nAB-PCI PM Team"),
    "chase_team": ("Reminder: {borrower} items outstanding", "Hello,\n\n{borrower}: {missing} outstanding, due "
                   "{due_date}.\n\nPM Team"),
    "impact_summary": ("{period} marks: early value impact (v{version})", "{body}"),
    "committee_pack": ("{period} Valuation Committee pack", "Dear Committee members,\n\nPlease find the pack for "
                       "the meeting on {meeting_date}. Loans on the agenda:\n{agenda_lines}\n\nPack: {pack_link}\n\n"
                       "PM Team"),
    "final_marks_approval_request": ("{period} final marks: request for written approval",
                                     "Dear {chair},\n\nPlease approve the final marks schedule below.\n\n"
                                     "{schedule}\n\nChanges since the committee:\n{changes}\n\nApproval link: "
                                     "{link}\n\nPM Team"),
    "distribution": ("{period} final CMRs and marks", "Hello {group},\n\nThe {period} marks are final. Portfolio "
                     "value {value}. Attached: {cmr_list}.\n\nPM Team"),
    "monthly_request": ("{period} monthly marks: proposals due {due_date}",
                        "Hello {team_name},\n\nPlease propose monthly marks with commentary for:\n{rows}\n\n"
                        "Due {due_date}.\n\nPM Team"),
    "monthly_approval_request": ("{period} monthly marks for approval", "Dear Committee,\n\nConsolidated "
                                 "monthly marks:\n{rows}\n\nPM Team"),
    "send_back": ("{borrower}: Deal Team send-back on Lincoln draft v{version}", "{note}"),
}


def seed(session: Session) -> dict:
    for u in users():
        if not session.query(AppUser).filter_by(email=u.email).first():
            session.add(AppUser(email=u.email, display_name=u.name, role=u.role, deal_team_id=u.team))
    for tid, name in TEAMS:
        if not session.query(DealTeamRef).filter_by(deal_team_id=tid).first():
            session.add(DealTeamRef(deal_team_id=tid, team_name=name, members=list(team_emails(tid).values())))
    for key, value, vtype, desc, confirmed, dq in RULES:
        if not session.query(RuleConfig).filter_by(key=key).first():
            session.add(RuleConfig(key=key, value_json=value, value_type=vtype, description=desc,
                                   confirmed_by_client=confirmed, discovery_question=dq,
                                   confirmed_source="user" if confirmed else None))
    if not session.query(CalendarTemplate).first():
        for phase, name, steps, start, end in QUARTERLY_PHASES:
            session.add(CalendarTemplate(cycle_type="quarterly", phase=phase, phase_name=name, step_codes=steps,
                                         start_day_offset=start, end_day_offset=end, assumed=True))
        for phase, name, steps, start, end in MONTHLY_PHASES:
            session.add(CalendarTemplate(cycle_type="monthly", phase=phase, phase_name=name, step_codes=steps,
                                         start_day_offset=start, end_day_offset=end, assumed=True))
    for code, (subject, body) in TEMPLATES.items():
        if not session.query(EmailTemplate).filter_by(code=code).first():
            session.add(EmailTemplate(code=code, subject=subject, body_text=body, body_html=None))
    session.flush()
    return {"users": session.query(AppUser).count(), "rules": session.query(RuleConfig).count()}
