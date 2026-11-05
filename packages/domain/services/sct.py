"""SCT session planner (Q9) and per-fund marks, shaped like the client's files.

Sessions come from the CMR Delivery Deadlines file (session, reviewer, requested review
time, deadline, delivery to SCT). Slot lengths come from the Master Agenda "Timing"
sheet: 12 minutes per deal (20 on the watchlist), 20 and 30 for DIS sessions.
The session pack is a cover index followed by the filed CMR PDFs, like the client's
SCT pack.
"""
from __future__ import annotations

import io
from datetime import datetime, timedelta

from pypdf import PdfReader, PdfWriter
from sqlalchemy.orm import Session

from connectors.object_store import get_store
from connectors.warehouse import get_warehouse
from domain.models import Cmr, CmrFile, CycleLoan, MarksTrackerRow, SctSession, ValuationCycle
from domain.pdf import BODY, H1, Spacer, build, grid, inch, para
from domain.services.core import Actor, BusinessRuleError, audit, require

TIMING = {"non_dis": {"non_wl": 12, "wl": 20}, "dis": {"non_wl": 20, "wl": 30}}


def _base(name: str) -> str:
    return name.replace(" Follow Up", "").strip()


def plan(session: Session, cycle_id: str) -> list[dict]:
    sessions = session.query(SctSession).filter_by(cycle_id=cycle_id).order_by(SctSession.session_date).all()
    loans = session.query(CycleLoan).filter_by(cycle_id=cycle_id, in_scope=True).order_by(CycleLoan.facility_id).all()
    out = []
    for s in sessions:
        members = [l for l in loans if (l.sct_session or "") == s.session_name]
        dis = (s.session_name or "").startswith("DIS")
        t = datetime(2026, 1, 1, 9, 0)
        slots = []
        for i, l in enumerate(members):
            wl = l.cmr_type == "watchlist"
            mins = TIMING["dis" if dis else "non_dis"]["wl" if wl else "non_wl"]
            cmr = session.query(Cmr).filter_by(cycle_loan_id=l.id).order_by(Cmr.version.desc()).first()
            slots.append({"time": t.strftime("%H:%M"), "minutes": mins, "borrower": l.borrower,
                          "facility_id": l.facility_id, "watchlist": wl, "cmr_status": cmr.status if cmr else None,
                          "cmr_version": cmr.version if cmr else None})
            t += timedelta(minutes=mins)
            if i == 5 and len(members) > 7:
                slots.append({"time": t.strftime("%H:%M"), "minutes": 12, "borrower": "Break"})
                t += timedelta(minutes=12)
        out.append({"id": s.id, "session": s.session_name, "date": s.session_date.isoformat() if s.session_date else None,
                    "reviewer": s.reviewer, "requested_review_time": s.requested_review_time, "deadline": s.deadline,
                    "delivery_to_sct": s.delivery_to_sct, "slots": slots,
                    "ready": sum(1 for x in slots if x.get("cmr_status") in ("filed", "agreed", "final")),
                    "total": sum(1 for x in slots if x.get("facility_id"))})
    return out


def defer_to_follow_up(session: Session, cl: CycleLoan) -> str:
    """SCT defers a deal: it moves to the session's follow-up (created if the calendar has none)."""
    base = _base(cl.sct_session or "Services")
    target = f"{base} Follow Up"
    if not session.query(SctSession).filter_by(cycle_id=cl.cycle_id, session_name=target).first():
        src = session.query(SctSession).filter_by(cycle_id=cl.cycle_id, session_name=base).first()
        session.add(SctSession(cycle_id=cl.cycle_id, session_name=target,
                               session_date=(src.session_date + timedelta(days=5)) if src and src.session_date else None,
                               reviewer=src.reviewer if src else None, requested_review_time="1BD",
                               deadline="2 business days before", delivery_to_sct="1 business day before",
                               minutes_per_deal=src.minutes_per_deal if src else None))
    cl.sct_session = target
    return target


def build_session_pack(session: Session, actor: Actor, cycle_id: str, session_id: str) -> str:
    require(actor, "cmr.file")
    p = next((x for x in plan(session, cycle_id) if x["id"] == session_id), None)
    if not p or not p["total"]:
        raise BusinessRuleError("No loans in this session")
    cyc = session.get(ValuationCycle, cycle_id)
    cover = build([para(f"SCT review session: {p['session']}", H1),
                   para(f"{p['date']}; reviewer {p['reviewer']}; requested review time {p['requested_review_time']}; "
                        f"deadline {p['deadline']}; delivery to SCT {p['delivery_to_sct']}.", BODY), Spacer(1, 8),
                   grid([["Time", "Deal", "Facility", "Minutes", "CMR"]] +
                        [[x["time"], x["borrower"], x.get("facility_id", ""), str(x["minutes"]),
                          f"v{x['cmr_version']} {x['cmr_status']}" if x.get("cmr_version") else ""] for x in p["slots"]],
                        [0.8 * inch, 2.6 * inch, 1 * inch, 0.9 * inch, 1.5 * inch])],
                  title=f"SCT {p['session']}", footer="Cover index | Private and Confidential")
    writer = PdfWriter()
    for page in PdfReader(io.BytesIO(cover)).pages:
        writer.add_page(page)
    store = get_store()
    for x in p["slots"]:
        if not x.get("facility_id"):
            continue
        cl = session.query(CycleLoan).filter_by(cycle_id=cycle_id, facility_id=x["facility_id"]).one()
        cmr = session.query(Cmr).filter_by(cycle_loan_id=cl.id).order_by(Cmr.version.desc()).first()
        f = session.query(CmrFile).filter_by(cmr_id=cmr.id).order_by(CmrFile.version.desc()).first() if cmr else None
        if f:
            for page in PdfReader(io.BytesIO(store.get("sharepoint", f.pdf_path))).pages:
                writer.add_page(page)
    buf = io.BytesIO()
    writer.write(buf)
    path = f"PrivateCredit/Valuation/{cyc.period}/SCT/{p['session'].replace(' ', '-').replace('#', 'n')}-pack.pdf"
    store.put("sharepoint", path, buf.getvalue())
    audit(session, actor, "sct_pack.built", "sct_session", session_id, cycle_id=cycle_id,
          after={"session": p["session"], "path": f"sharepoint/{path}", "cmrs": p["ready"]})
    return path


def by_fund(session: Session, cycle_id: str) -> list[dict]:
    """Previous and current value per fund: Sentry funded split times the tracker marks."""
    cyc = session.get(ValuationCycle, cycle_id)
    rows = {r.facility_id: r for r in session.query(MarksTrackerRow).filter_by(cycle_id=cycle_id)}
    out: dict[str, dict] = {}
    for p in get_warehouse().query("select FUND_ID, FACILITY_ID, FUNDED_AMOUNT from SENTRY.POSITION where AS_OF_DATE = ?",
                                   [cyc.day0_date]):
        r = rows.get(p["FACILITY_ID"])
        if not r:
            continue
        cur = next((m for m in (r.final_mark, r.committee_mark, r.deal_team_mark, r.lincoln_draft_mark) if m is not None),
                   r.previous_mark)
        f = out.setdefault(p["FUND_ID"], {"fund": p["FUND_ID"], "funded": 0.0, "previous": 0.0, "current": 0.0, "loans": 0})
        f["funded"] += p["FUNDED_AMOUNT"]
        f["previous"] += p["FUNDED_AMOUNT"] * (r.previous_mark or 0) / 100
        f["current"] += p["FUNDED_AMOUNT"] * (cur or 0) / 100
        f["loans"] += 1
    res = sorted(out.values(), key=lambda x: x["fund"])
    for f in res:
        for k in ("funded", "previous", "current"):
            f[k] = round(f[k], 4)
        f["delta"] = round(f["current"] - f["previous"], 4)
    return res
