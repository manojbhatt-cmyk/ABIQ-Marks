"""Cycle service: Q1 loan universe, calendar, kickoff, tasks, the demo clock, the dashboard."""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session

from connectors.mailbox import mailbox
from connectors.warehouse import get_warehouse
from domain.models import (CalendarTemplate, CycleLoan, Deadline, EmailMessage, EmailTemplate, IngestionRun,
                           MarksTrackerRow, SctSession, Task, ValuationCycle)
from domain.services.core import (Actor, BusinessRuleError, audit, cycle_date, now, require, rule, rule_meta)

STEP_ORDER = [f"Q{i}" for i in range(1, 23)]


def step_index(step: str | None) -> int:
    return STEP_ORDER.index(step) if step in STEP_ORDER else 0


UNIVERSE_SQL = """
select f.FACILITY_ID, f.DEAL_ID, d.DEAL_NAME, b.BORROWER_ID, b.SHORT_NAME as BORROWER, b.EMAIL_DOMAIN,
       sp.NAME as SPONSOR, f.FACILITY_TYPE, f.ASSET_CLASS, f.SENIORITY, f.COMMITMENT_AMOUNT, f.CURRENCY,
       f.COUPON_RATE, f.MATURITY_DATE, f.CMR_TYPE, d.SECTOR, d.AGENDA as SCT_SESSION,
       dt.DEAL_TEAM_ID, dt.TEAM_NAME, dt.LEAD_USER_EMAIL, dt.ANALYST_USER_EMAIL, dt.AC_MANAGER_USER_EMAIL,
       pp.FINAL_MARK as PREVIOUS_FINAL_MARK, rr.RATING as PREVIOUS_RATING, rr.WATCHLIST_FLAG as PREVIOUS_WATCHLIST,
       pos.FUNDED_AMOUNT, pos.UNFUNDED_AMOUNT
from DEALCLOUD.FACILITY f
join DEALCLOUD.DEAL d on d.DEAL_ID = f.DEAL_ID
join DEALCLOUD.BORROWER b on b.BORROWER_ID = d.BORROWER_ID
left join DEALCLOUD.SPONSOR sp on sp.SPONSOR_ID = b.SPONSOR_ID
join DEALCLOUD.DEAL_TEAM_ASSIGNMENT a on a.FACILITY_ID = f.FACILITY_ID
     and ? between a.EFFECTIVE_FROM and coalesce(a.EFFECTIVE_TO, cast('9999-12-31' as date))
join DEALCLOUD.DEAL_TEAM dt on dt.DEAL_TEAM_ID = a.DEAL_TEAM_ID
left join EVEREST.PRICING_PANEL pp on pp.FACILITY_ID = f.FACILITY_ID and pp.PERIOD = ?
left join EVEREST.RISK_RATING rr on rr.FACILITY_ID = f.FACILITY_ID and rr.PERIOD = ?
left join (select FACILITY_ID, sum(FUNDED_AMOUNT) FUNDED_AMOUNT, sum(UNFUNDED_AMOUNT) UNFUNDED_AMOUNT
           from SENTRY.POSITION where AS_OF_DATE = ? group by FACILITY_ID) pos on pos.FACILITY_ID = f.FACILITY_ID
where f.STATUS = 'active' and d.STATUS = 'active'
order by f.FACILITY_ID
"""


def previous_period(period: str) -> str:
    y, q = period.split("-Q")
    y, q = int(y), int(q)
    return f"{y - 1}-Q4" if q == 1 else f"{y}-Q{q - 1}"


def read_universe(session: Session, day0: date, period: str) -> list[dict]:
    wh = get_warehouse()
    started = now()
    rows = wh.query(UNIVERSE_SQL, [day0, previous_period(period), previous_period(period), day0])
    session.add(IngestionRun(source=wh.name, dataset="loan_universe", as_of=day0.isoformat(), started_at=started,
                             finished_at=now(), rows=len(rows), status="success"))
    for r in rows:
        r["IN_SCOPE"] = r["FACILITY_TYPE"] != "revolver"
        r["OWNED"] = bool(r["DEAL_TEAM_ID"])
    return rows


def create_quarterly_cycle(session: Session, actor: Actor, period: str, day0: date) -> ValuationCycle:
    require(actor, "cycle.manage")
    if session.query(ValuationCycle).filter_by(cycle_type="quarterly", period=period).first():
        raise BusinessRuleError(f"A quarterly cycle for {period} already exists")
    length = int(rule(session, "cycle.length_days", 45))
    cyc = ValuationCycle(cycle_type="quarterly", period=period, day0_date=day0, deadline_date=day0 + timedelta(days=length),
                         status="draft", opened_by=actor.email, current_day=0, created_by=actor.email)
    session.add(cyc)
    session.flush()
    universe = read_universe(session, day0, period)
    unowned = [r["FACILITY_ID"] for r in universe if r["IN_SCOPE"] and not r["OWNED"]]
    if unowned:
        raise BusinessRuleError(f"Loans without a deal team owner: {', '.join(unowned)}")
    prev_total = 0.0
    for r in universe:
        cl = CycleLoan(cycle_id=cyc.id, facility_id=r["FACILITY_ID"], deal_id=r["DEAL_ID"], borrower_id=r["BORROWER_ID"],
                       borrower=r["BORROWER"], deal_name=r["DEAL_NAME"], sector=r["SECTOR"], sponsor=r["SPONSOR"],
                       facility_type=("second_lien" if r["SENIORITY"] == "second_lien" else r["FACILITY_TYPE"]),
                       deal_team_id=r["DEAL_TEAM_ID"], team_name=r["TEAM_NAME"], analyst_email=r["ANALYST_USER_EMAIL"],
                       lead_email=r["LEAD_USER_EMAIL"], ac_manager_email=r["AC_MANAGER_USER_EMAIL"],
                       email_domain=r["EMAIL_DOMAIN"], cmr_type=r["CMR_TYPE"], commitment_amount=r["COMMITMENT_AMOUNT"],
                       coupon_rate=r["COUPON_RATE"], maturity_date=r["MATURITY_DATE"],
                       previous_mark=r["PREVIOUS_FINAL_MARK"], previous_rating=r["PREVIOUS_RATING"],
                       previous_watchlist=bool(r["PREVIOUS_WATCHLIST"]), funded_amount=r["FUNDED_AMOUNT"],
                       unfunded_amount=r["UNFUNDED_AMOUNT"], sct_session=r["SCT_SESSION"], in_scope=r["IN_SCOPE"],
                       current_step="Q1", status="not_started", loop_counts_json={}, created_by=actor.email)
        session.add(cl)
        if cl.in_scope:
            prev_total += (cl.funded_amount or 0) * (cl.previous_mark or 0) / 100
    cyc.previous_portfolio_value = round(prev_total, 4)
    _set_calendar(session, cyc)
    _load_sct_sessions(session, cyc)
    session.flush()
    audit(session, actor, "cycle.created", "valuation_cycle", cyc.id, cycle_id=cyc.id,
          after={"period": period, "day0": day0, "loans": len(universe),
                 "in_scope": sum(1 for r in universe if r["IN_SCOPE"])})
    return cyc


def _set_calendar(session: Session, cyc: ValuationCycle) -> None:
    from synth.seed_app import STEP_DEADLINES

    for step, (day, label, from_notes) in STEP_DEADLINES.items():
        session.add(Deadline(cycle_id=cyc.id, step_code=step, label=label, due_day=day, due_date=cycle_date(cyc, day),
                             assumed=not from_notes, source="source note" if from_notes else "interpolated"))


def _load_sct_sessions(session: Session, cyc: ValuationCycle) -> None:
    try:
        rows = get_warehouse().query("select * from DEALCLOUD.SCT_SESSION where PERIOD = ? order by SESSION_DATE",
                                     [cyc.period])
    except Exception:
        rows = []
    for r in rows:
        session.add(SctSession(cycle_id=cyc.id, session_date=r["SESSION_DATE"], session_name=r["SCT_REVIEW_DATE"],
                               reviewer=r["REVIEWER"], requested_review_time=r["REQUESTED_TIME_TO_REVIEW"],
                               deadline=r["DEADLINE"], delivery_to_sct=r["DELIVERY_TO_SCT"],
                               minutes_per_deal={"non_wl": r["MIN_PER_DEAL_NON_WL"], "wl": r["MIN_PER_DEAL_WL"]}))


def set_deadline(session: Session, actor: Actor, cycle_id: str, step_code: str, due_day: int) -> Deadline:
    require(actor, "cycle.manage")
    cyc = session.get(ValuationCycle, cycle_id)
    d = session.query(Deadline).filter_by(cycle_id=cycle_id, step_code=step_code, cycle_loan_id=None).one()
    before = {"due_day": d.due_day}
    d.due_day, d.due_date, d.source = due_day, cycle_date(cyc, due_day), "edited at kickoff"
    audit(session, actor, "cycle.calendar_set", "deadline", d.id, cycle_id=cycle_id, before=before,
          after={"step": step_code, "due_day": due_day, "assumed": d.assumed})
    return d


def deadlines(session: Session, cycle_id: str) -> dict[str, Deadline]:
    return {d.step_code: d for d in session.query(Deadline).filter_by(cycle_id=cycle_id, cycle_loan_id=None)}


def kickoff_preview(session: Session, cycle_id: str) -> list[dict]:
    cyc = session.get(ValuationCycle, cycle_id)
    tpl = session.query(EmailTemplate).filter_by(code="kickoff").order_by(EmailTemplate.version.desc()).first()
    dl = deadlines(session, cycle_id)
    loans = session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).order_by(CycleLoan.facility_id).all()
    teams: dict[str, list[CycleLoan]] = {}
    for cl in loans:
        teams.setdefault(cl.deal_team_id, []).append(cl)
    date_lines = "\n".join(f"- {d.label}: Day {d.due_day}, {d.due_date:%a %d %b %Y}{' (assumed)' if d.assumed else ''}"
                           for d in sorted(dl.values(), key=lambda x: (x.due_day, step_index(x.step_code)))
                           if d.step_code in ("Q2", "Q5", "Q9", "Q10", "Q14", "Q18", "Q21"))
    out = []
    for team_id, cls in sorted(teams.items()):
        loan_lines = "\n".join(f"- {c.borrower} ({c.facility_id}, {c.facility_type.replace('_', ' ')}, "
                               f"CMR type {c.cmr_type}, SCT session {c.sct_session})" for c in cls)
        fields = {"period": cyc.period, "team_name": cls[0].team_name, "loan_lines": loan_lines, "date_lines": date_lines}
        to = sorted({cls[0].lead_email, cls[0].analyst_email})
        out.append({"deal_team_id": team_id, "team_name": cls[0].team_name, "to": to, "cc": ["pm.analyst@ab-poc.local"],
                    "subject": tpl.subject.format(**fields), "body": tpl.body_text.format(**fields),
                    "loans": [c.facility_id for c in cls]})
    return out


def send_kickoff(session: Session, actor: Actor, cycle_id: str, edits: dict[str, dict] | None = None) -> list[EmailMessage]:
    require(actor, "cycle.manage")
    cyc = session.get(ValuationCycle, cycle_id)
    if cyc.status != "draft":
        raise BusinessRuleError("Kickoff has already been sent for this cycle")
    sent = []
    for p in kickoff_preview(session, cycle_id):
        e = (edits or {}).get(p["deal_team_id"], {})
        subject, body = e.get("subject", p["subject"]), e.get("body", p["body"])
        msg_id, path = mailbox.send(actor.email, p["to"], subject, body, cc=p["cc"])
        m = EmailMessage(direction="out", message_id=msg_id, thread_id=msg_id, from_addr=actor.email, to_addrs=p["to"],
                         cc_addrs=p["cc"], subject=subject, body_text=body, sent_at=now(), template_code="kickoff",
                         cycle_id=cycle_id, cycle_day=cyc.current_day, eml_path=path, status="sent")
        session.add(m)
        session.flush()
        sent.append(m)
        audit(session, actor, "email.sent", "email_message", m.id, cycle_id=cycle_id,
              after={"template": "kickoff", "to": p["to"], "subject": subject})
    dl = deadlines(session, cycle_id)
    for cl in session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True):
        for step, title, role, owner in (("Q2", "Borrower package due", "deal_analyst", cl.analyst_email),
                                         ("Q5", "CMR draft due", "deal_analyst", cl.analyst_email),
                                         ("Q10", "Lincoln draft mark due", "lincoln", "analyst@lincoln.example"),
                                         ("Q14", "G1 decision due", "deal_lead", cl.lead_email)):
            t = Task(cycle_id=cycle_id, cycle_loan_id=cl.id, step_code=step, title=f"{cl.borrower}: {title}",
                     owner_user_id=owner, owner_role=role, due_day=dl[step].due_day, due_date=dl[step].due_date)
            session.add(t)
        cl.status, cl.current_step, cl.deal_team_track_status = "waiting_on_borrower", "Q2", "intake"
        cl.dt_step = "Q2"
        cl.package_status = "not_received"
    cyc.status = "open"
    session.flush()
    audit(session, actor, "task.created", "valuation_cycle", cycle_id, cycle_id=cycle_id,
          after={"tasks": session.query(Task).filter_by(cycle_id=cycle_id).count()})
    return sent


def move_clock(session: Session, actor: Actor, cycle_id: str, day: int) -> ValuationCycle:
    """Demo only: set the cycle day. Overdue tasks are recomputed."""
    require(actor, "cycle.manage")
    cyc = session.get(ValuationCycle, cycle_id)
    before = cyc.current_day
    cyc.current_day = max(cyc.current_day, day) if day >= 0 else cyc.current_day
    for t in session.query(Task).filter_by(cycle_id=cycle_id).filter(Task.status.in_(["open", "overdue"])):
        t.status = "overdue" if t.due_day is not None and t.due_day < cyc.current_day else "open"
    audit(session, actor, "cycle.clock_moved", "valuation_cycle", cycle_id, cycle_id=cycle_id,
          before={"day": before}, after={"day": cyc.current_day})
    return cyc


def complete_tasks(session: Session, cycle_loan_id: str, step: str, actor: Actor) -> None:
    for t in session.query(Task).filter_by(cycle_loan_id=cycle_loan_id, step_code=step).filter(
            Task.status.in_(["open", "overdue"])):
        t.status, t.completed_at, t.completed_by = "done", now(), actor.email


def refresh_step(cl: CycleLoan) -> None:
    """Derive current_step from the two tracks until G1 (Functional Spec section 0)."""
    if step_index(cl.current_step) >= step_index("Q14") and cl.status not in ("waiting_on_lincoln",):
        return
    if step_index(cl.dt_step) >= step_index("Q3") and step_index(cl.lincoln_step) >= step_index("Q10"):
        cl.current_step = STEP_ORDER[min(step_index(cl.dt_step), step_index(cl.lincoln_step))]
    else:
        cl.current_step = cl.dt_step


def set_scope(session: Session, actor: Actor, cycle_loan_id: str, in_scope: bool, reason: str) -> CycleLoan:
    require(actor, "cycle.manage")
    if not reason:
        raise BusinessRuleError("A reason is required to change scope")
    cl = session.get(CycleLoan, cycle_loan_id)
    before = {"in_scope": cl.in_scope}
    cl.in_scope = in_scope
    audit(session, actor, "cycle_loan.scope_changed", "cycle_loan", cl.id, cycle_id=cl.cycle_id, cycle_loan_id=cl.id,
          before=before, after={"in_scope": in_scope, "reason": reason})
    return cl


def dashboard(session: Session, cycle_id: str) -> dict:
    cyc = session.get(ValuationCycle, cycle_id)
    loans = session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).all()
    tracker = {r.cycle_loan_id: r for r in session.query(MarksTrackerRow).filter_by(cycle_id=cycle_id)}
    tasks = session.query(Task).filter_by(cycle_id=cycle_id).all()
    overdue = [t for t in tasks if t.status == "overdue"]
    g1_done = sum(1 for cl in loans if step_index(cl.current_step) >= step_index("Q15"))
    prev = sum((r.previous_value or 0) for r in tracker.values()) or (cyc.previous_portfolio_value or 0)
    cur = sum((r.current_value if r.current_value is not None else r.previous_value or 0) for r in tracker.values()) if tracker else prev
    story_ids = {"F-0001", "F-0002", "F-0003"}
    story_prev = sum(r.previous_value or 0 for r in tracker.values() if r.facility_id in story_ids)
    story_cur = sum((r.current_value if r.current_value is not None else r.previous_value or 0)
                    for r in tracker.values() if r.facility_id in story_ids)
    loops: dict[str, int] = {k: 0 for k in ("QA", "QB", "QC", "QD", "QE", "QF")}
    for cl in loans:
        for k, v in (cl.loop_counts_json or {}).items():
            loops[k] = loops.get(k, 0) + v
    cal = session.query(CalendarTemplate).filter_by(cycle_type=cyc.cycle_type).order_by(CalendarTemplate.phase).all()
    dl = deadlines(session, cycle_id)
    return {
        "cycle": cycle_dict(cyc),
        "kpis": {"day": cyc.current_day, "length": rule(session, "cycle.length_days", 45), "loans": len(loans),
                 "g1_passed": g1_done, "portfolio_previous": round(prev, 4), "portfolio_current": round(cur, 4),
                 "delta": round(cur - prev, 4), "story_previous": round(story_prev, 4),
                 "story_current": round(story_cur, 4), "overdue": len(overdue)},
        "phases": [{"phase": c.phase, "name": c.phase_name, "start": c.start_day_offset, "end": c.end_day_offset,
                    "steps": c.step_codes, "assumed": c.assumed} for c in cal],
        "deadlines": [{"step": d.step_code, "label": d.label, "day": d.due_day, "date": d.due_date.isoformat(),
                       "assumed": d.assumed} for d in sorted(dl.values(), key=lambda x: x.due_day)],
        "loans": [loan_card(cl, tracker.get(cl.id)) for cl in sorted(loans, key=lambda c: c.facility_id)],
        "attention": [{"kind": "overdue", "title": t.title, "day": t.due_day, "cycle_loan_id": t.cycle_loan_id}
                      for t in overdue][:20],
        "loops": loops,
        "calendar_rule": rule_meta(session, "cycle.length_days"),
    }


def loan_card(cl: CycleLoan, tr: MarksTrackerRow | None = None) -> dict:
    return {"id": cl.id, "facility_id": cl.facility_id, "borrower": cl.borrower, "team": cl.team_name,
            "deal_team_id": cl.deal_team_id, "facility_type": cl.facility_type, "cmr_type": cl.cmr_type,
            "current_step": cl.current_step, "status": cl.status, "dt_status": cl.deal_team_track_status,
            "lincoln_status": cl.lincoln_track_status, "dt_step": cl.dt_step, "lincoln_step": cl.lincoln_step,
            "package_status": cl.package_status, "package_missing": cl.package_missing or [],
            "loops": cl.loop_counts_json or {}, "previous_mark": cl.previous_mark, "funded": cl.funded_amount,
            "lincoln_mark": tr.lincoln_draft_mark if tr else None, "deal_team_mark": tr.deal_team_mark if tr else None,
            "committee_mark": tr.committee_mark if tr else None, "final_mark": tr.final_mark if tr else None,
            "on_agenda": cl.on_agenda, "sector": cl.sector}


def cycle_dict(cyc: ValuationCycle) -> dict:
    return {"id": cyc.id, "cycle_type": cyc.cycle_type, "period": cyc.period, "day0": cyc.day0_date.isoformat(),
            "deadline": cyc.deadline_date.isoformat() if cyc.deadline_date else None, "day": cyc.current_day,
            "status": cyc.status, "final_value": cyc.final_portfolio_value, "previous_value": cyc.previous_portfolio_value}
