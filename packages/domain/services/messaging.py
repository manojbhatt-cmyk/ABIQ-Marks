"""In-platform messaging. Internal communication (PM Team, Deal Teams, reviewers, committee, governance,
Finance and IR) happens inside ABIQ: a message plus a notification that links to the screen where the
recipient acts. Email is kept only for third parties (borrowers, Lincoln) through the mailbox connector."""
from __future__ import annotations

from sqlalchemy.orm import Session

from domain.models import AppUser, Message, ValuationCycle
from domain.services.core import Actor, audit, notify, users_by_role


def resolve(session: Session, recipients: list[str]) -> list[str]:
    """Recipients are emails or 'role:<role>' or 'team:<deal_team_id>'."""
    out: list[str] = []
    for r in recipients:
        if r.startswith("role:"):
            out += [u.email for u in users_by_role(session, r[5:])]
        elif r.startswith("team:"):
            out += [u.email for u in session.query(AppUser).filter_by(deal_team_id=r[5:], active=True)]
        elif r:
            out.append(r)
    return sorted(set(out))


def post(session: Session, actor: Actor, recipients: list[str], subject: str, body: str, *, kind: str,
         link: str | None = None, cycle_id: str | None = None, entity_type: str = "", entity_id: str = "",
         attachments: list[dict] | None = None) -> Message:
    to = resolve(session, recipients)
    day = session.get(ValuationCycle, cycle_id).current_day if cycle_id else None
    m = Message(cycle_id=cycle_id, cycle_day=day, sender_email=actor.email, sender_role=actor.role, recipients=to,
                subject=subject, body=body, kind=kind, link=link, entity_type=entity_type, entity_id=str(entity_id),
                attachments=attachments or [], read_by=[])
    session.add(m)
    session.flush()
    notify(session, to, kind, subject, body[:300], entity_type=entity_type, entity_id=entity_id, cycle_id=cycle_id,
           link=link)
    audit(session, actor, "message.sent", "message", m.id, cycle_id=cycle_id,
          after={"kind": kind, "to": to, "subject": subject, "channel": "in_platform"})
    return m


def inbox(session: Session, email: str, limit: int = 200) -> list[dict]:
    rows = session.query(Message).order_by(Message.created_at.desc()).limit(2000).all()
    out = []
    for m in rows:
        if email in (m.recipients or []) or m.sender_email == email:
            out.append(message_dict(m, email))
        if len(out) >= limit:
            break
    return out


def message_dict(m: Message, email: str | None = None) -> dict:
    return {"id": m.id, "from": m.sender_email, "from_role": m.sender_role, "to": m.recipients, "subject": m.subject,
            "body": m.body, "kind": m.kind, "link": m.link, "day": m.cycle_day, "at": m.created_at.isoformat(),
            "attachments": m.attachments or [], "read": bool(email and email in (m.read_by or [])),
            "sent": m.sender_email == email}


def mark_read(session: Session, message_id: str, email: str) -> None:
    m = session.get(Message, message_id)
    if m and email not in (m.read_by or []):
        m.read_by = list(m.read_by or []) + [email]
