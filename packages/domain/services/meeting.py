"""Valuation Committee meeting (Q17 to Q18): the PM Team organises it in TIQ.

TIQ drafts the meeting from the agenda (date from the calendar, a slot per agenda loan, the
attendees who must be there) and the organiser can change any of it before sending. Sending posts
the invitation inside TIQ to every attendee, with a calendar file (.ics) they can add to Outlook.
The meeting itself happens on the call; decisions are recorded on the Committee Meeting screen.
The online link is a placeholder until a Microsoft Teams connector is configured.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from connectors.object_store import get_store
from domain.models import (AppUser, CommitteeAgendaItem, CommitteeMeeting, CommitteePack, CycleLoan, ValuationCycle)
from domain.services.core import Actor, BusinessRuleError, audit, require, users_by_role

DEFAULT_TIME = "10:00"
TIMEZONE = "America/New_York"


def _agenda(session: Session, cycle_id: str):
    from domain.services.committee import latest_agenda

    ag = latest_agenda(session, cycle_id)
    if not ag:
        raise BusinessRuleError("Build the committee agenda first (Q16)")
    return ag


def current(session: Session, cycle_id: str) -> CommitteeMeeting | None:
    return session.query(CommitteeMeeting).filter_by(cycle_id=cycle_id).order_by(CommitteeMeeting.version.desc()).first()


def draft(session: Session, cycle_id: str) -> dict:
    """What TIQ proposes: the organiser reviews and edits it before sending."""
    ag = _agenda(session, cycle_id)
    cyc = session.get(ValuationCycle, cycle_id)
    items = session.query(CommitteeAgendaItem).filter_by(agenda_id=ag.id, removed=False).order_by(
        CommitteeAgendaItem.sort_order).all()
    slots, presenters = [], []
    t = datetime.strptime(DEFAULT_TIME, "%H:%M")
    slots.append({"time": t.strftime("%H:%M"), "minutes": 10, "title": "Opening: portfolio impact and agenda", "presenter": "PM Team"})
    t += timedelta(minutes=10)
    for it in items:
        cl = session.get(CycleLoan, it.cycle_loan_id)
        minutes = 20 if "watchlist" in (it.reasons_json or []) else 15
        slots.append({"time": t.strftime("%H:%M"), "minutes": minutes, "title": cl.borrower, "facility_id": cl.facility_id,
                      "reasons": it.reasons_json, "presenter": cl.team_name})
        presenters += [cl.lead_email, cl.analyst_email]
        t += timedelta(minutes=minutes)
    slots.append({"time": t.strftime("%H:%M"), "minutes": 5, "title": "Close: decisions read back", "presenter": "Chair"})
    total = sum(s["minutes"] for s in slots)
    committee = [u.email for r in ("committee_chair", "committee_member") for u in users_by_role(session, r)]
    pm = [u.email for u in users_by_role(session, "pm_team")]
    attendees = ([{"email": e, "role": "required", "why": "Valuation Committee"} for e in committee]
                 + [{"email": e, "role": "required", "why": "Presenting deal team"} for e in dict.fromkeys(presenters)]
                 + [{"email": e, "role": "organiser", "why": "PM Team"} for e in pm])
    pack = session.query(CommitteePack).filter_by(agenda_id=ag.id).order_by(CommitteePack.version.desc()).first()
    return {"title": f"{cyc.period} Valuation Committee", "date": ag.meeting_date.isoformat(), "start": DEFAULT_TIME,
            "timezone": TIMEZONE, "duration_minutes": total, "mode": "online",
            "join_link": f"https://teams.microsoft.com/l/meetup-join/tiq-{cyc.period.lower()}-vc (placeholder)",
            "location": "", "attendees": attendees, "slots": slots,
            "pack": {"version": pack.version, "path": pack.pdf_path, "sent": bool(pack.sent_email_message_id)} if pack else None,
            "note": "Please review the committee pack before the call. Decisions are recorded in TIQ during the meeting."}


def _ics(m: dict, uid: str, organiser: str, sequence: int) -> bytes:
    start = datetime.strptime(f"{m['date']} {m['start']}", "%Y-%m-%d %H:%M")
    end = start + timedelta(minutes=int(m["duration_minutes"]))
    fmt = "%Y%m%dT%H%M%S"
    where = m["join_link"] if m["mode"] == "online" else (m.get("location") or "")
    agenda = "\\n".join(f"{s['time']} {s['title']} ({s['minutes']} min)" for s in m["slots"])
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TransOrg//TIQ Marks//EN", "METHOD:REQUEST", "BEGIN:VEVENT",
             f"UID:{uid}", f"SEQUENCE:{sequence}", f"DTSTAMP:{datetime.now(timezone.utc).strftime(fmt)}Z",
             f"DTSTART;TZID={m['timezone']}:{start.strftime(fmt)}", f"DTEND;TZID={m['timezone']}:{end.strftime(fmt)}",
             f"SUMMARY:{m['title']}", f"LOCATION:{where}", f"DESCRIPTION:{m.get('note', '')}\\n\\nAgenda:\\n{agenda}",
             f"ORGANIZER:mailto:{organiser}"]
    lines += [f"ATTENDEE;ROLE={'REQ-PARTICIPANT' if a['role'] == 'required' else 'CHAIR'}:mailto:{a['email']}"
              for a in m["attendees"]]
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return ("\r\n".join(lines) + "\r\n").encode()


def organise(session: Session, actor: Actor, cycle_id: str, data: dict | None = None) -> CommitteeMeeting:
    """Send (or update) the meeting invitation inside TIQ, with a calendar file attached."""
    require(actor, "agenda.manage")
    ag = _agenda(session, cycle_id)
    cyc = session.get(ValuationCycle, cycle_id)
    m = {**draft(session, cycle_id), **(data or {})}
    if m["mode"] not in ("online", "in_person", "hybrid"):
        raise BusinessRuleError("Mode must be online, in person or hybrid")
    if m["mode"] != "online" and not m.get("location"):
        raise BusinessRuleError("Give a room or location for an in-person meeting")
    try:
        datetime.strptime(f"{m['date']} {m['start']}", "%Y-%m-%d %H:%M")
    except ValueError:
        raise BusinessRuleError("Date must be YYYY-MM-DD and time HH:MM")
    prev = current(session, cycle_id)
    version = (prev.version + 1) if prev else 1
    uid = prev.uid if prev else f"{uuid.uuid4()}@tiq-marks"
    ics = _ics(m, uid, actor.email, version - 1)
    path = f"PrivateCredit/Valuation/{cyc.period}/Committee/meeting-invite-v{version}.ics"
    get_store().put("sharepoint", path, ics)
    meeting = CommitteeMeeting(cycle_id=cycle_id, agenda_id=ag.id, version=version, uid=uid, title=m["title"],
                               meeting_date=m["date"], start_time=m["start"], timezone=m["timezone"],
                               duration_minutes=int(m["duration_minutes"]), mode=m["mode"], join_link=m.get("join_link"),
                               location=m.get("location"), attendees_json=m["attendees"], slots_json=m["slots"],
                               note=m.get("note"), organiser=actor.email, ics_path=path, status="sent")
    session.add(meeting)
    session.flush()
    when = datetime.strptime(m["date"], "%Y-%m-%d").strftime("%A %d %B %Y")
    where = (f"Online: {m['join_link']}" if m["mode"] == "online" else
             f"{'Hybrid' if m['mode'] == 'hybrid' else 'In person'}: {m.get('location')}"
             + (f" (online: {m['join_link']})" if m["mode"] == "hybrid" and m.get("join_link") else ""))
    agenda = "\n".join(f"  {s['time']}  {s['title']} ({s['minutes']} min){'  presenter: ' + s['presenter'] if s.get('presenter') else ''}"
                       for s in m["slots"])
    body = (f"{'Updated invitation' if prev else 'Invitation'}: {m['title']}\n\nWhen: {when}, {m['start']} "
            f"({m['timezone'].split('/')[-1].replace('_', ' ')} time), {m['duration_minutes']} minutes\nWhere: {where}\n\n"
            f"Agenda:\n{agenda}\n\n{m.get('note') or ''}\n\nOpen the Committee Meeting screen in TIQ to follow the agenda and "
            f"record decisions. The calendar file is attached.")
    from domain.services.messaging import post

    attachments = [{"store": "sharepoint", "path": path, "name": "committee-meeting.ics"}]
    pack = session.query(CommitteePack).filter_by(agenda_id=ag.id).order_by(CommitteePack.version.desc()).first()
    if pack and pack.pdf_path:
        attachments.append({"store": "sharepoint", "path": pack.pdf_path, "name": f"committee-pack-v{pack.version}.pdf"})
    msg = post(session, actor, [a["email"] for a in m["attendees"] if a["email"] != actor.email],
               f"{'Updated: ' if prev else ''}{m['title']}, {when} {m['start']}", body, kind="meeting_invite",
               link="/committee/meeting", cycle_id=cycle_id, entity_type="committee_meeting", entity_id=meeting.id,
               attachments=attachments)
    meeting.message_id = msg.id
    if prev:
        prev.status = "superseded"
    audit(session, actor, "committee_meeting.organised", "committee_meeting", meeting.id, cycle_id=cycle_id,
          before={"date": prev.meeting_date, "start": prev.start_time} if prev else None,
          after={"version": version, "date": m["date"], "start": m["start"], "mode": m["mode"],
                 "attendees": len(m["attendees"]), "minutes": m["duration_minutes"]})
    return meeting


def meeting_dict(m: CommitteeMeeting | None, session: Session) -> dict | None:
    if not m:
        return None
    names = {u.email: u.display_name for u in session.query(AppUser)}
    return {"id": m.id, "version": m.version, "title": m.title, "date": m.meeting_date, "start": m.start_time,
            "timezone": m.timezone, "duration_minutes": m.duration_minutes, "mode": m.mode, "join_link": m.join_link,
            "location": m.location, "attendees": [a | {"name": names.get(a["email"], a["email"])} for a in m.attendees_json or []],
            "slots": m.slots_json, "note": m.note, "organiser": m.organiser, "ics": f"/api/files/sharepoint/{m.ics_path}",
            "status": m.status, "sent_at": m.created_at.isoformat()}
