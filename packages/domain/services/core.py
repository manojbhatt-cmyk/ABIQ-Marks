"""Shared service plumbing: actors, permissions, audit events, rules, notifications."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable

from sqlalchemy.orm import Session

from domain.models import AppUser, AuditEvent, CycleLoan, Notification, RuleConfig, ValuationCycle


class Forbidden(Exception):
    """The actor's role does not hold the right for this action."""


class BusinessRuleError(Exception):
    """A process rule blocks the action (for example a rationale is mandatory)."""


@dataclass(frozen=True)
class Actor:
    email: str
    role: str
    name: str = ""
    deal_team_id: str | None = None

    @classmethod
    def of(cls, user: AppUser) -> "Actor":
        return cls(user.email, user.role, user.display_name, user.deal_team_id)


SYSTEM = Actor("system@tiq", "system", "TIQ system")

# Permission matrix: action -> roles allowed (Master Spec section 7). "system" is used by the generator's
# external events (borrower emails, Lincoln files) and by derived recomputes, never for decisions.
RIGHTS: dict[str, set[str]] = {
    "cycle.manage": {"pm_team", "admin"},
    "intake.manage": {"pm_team", "deal_analyst", "deal_lead"},
    "lincoln.exchange": {"pm_team"},
    "lincoln.upload": {"lincoln", "system"},
    "spread.edit": {"deal_analyst", "deal_lead"},
    "spread.approve": {"deal_analyst", "deal_lead"},
    "cmr.edit": {"deal_analyst", "deal_lead"},
    "cmr.review.ac_manager": {"ac_manager"},
    "cmr.review.pm_team": {"pm_team"},
    "cmr.review.sct": {"sct"},
    "cmr.file": {"pm_team"},
    "g1.decide": {"deal_analyst", "deal_lead"},
    "tracker.send": {"pm_team"},
    "agenda.manage": {"pm_team"},
    "committee.decide": {"committee_member", "committee_chair"},
    "reconciliation.resolve": {"pm_team"},
    "approval.request": {"pm_team"},
    "approval.decide": {"committee_chair"},
    "governance.sign": {"governance"},
    "distribution.send": {"pm_team"},
    "monthly.manage": {"pm_team"},
    "monthly.propose": {"deal_analyst", "deal_lead"},
    "monthly.decide": {"committee_member", "committee_chair"},
    "admin": {"admin"},
}


def require(actor: Actor, right: str, *, team: str | None = None) -> None:
    roles = RIGHTS[right]
    if actor.role not in roles:
        raise Forbidden(f"{right} needs one of: {', '.join(sorted(roles))}")
    if team and actor.role in ("deal_analyst", "deal_lead") and actor.deal_team_id and actor.deal_team_id != team:
        raise Forbidden("Deal Team users can only act on their own team's loans")


def now() -> datetime:
    return datetime.now(timezone.utc)


def to_json(v: Any) -> Any:
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, dict):
        return {k: to_json(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [to_json(x) for x in v]
    return v


def snapshot(obj: Any, fields: Iterable[str]) -> dict:
    return {f: to_json(getattr(obj, f, None)) for f in fields}


def audit(session: Session, actor: Actor, action: str, entity_type: str, entity_id: Any, *, cycle_id: str | None = None,
          cycle_loan_id: str | None = None, before: dict | None = None, after: dict | None = None,
          evidence: Any = None, agent_run_id: str | None = None) -> AuditEvent:
    day = None
    if cycle_id:
        cyc = session.get(ValuationCycle, cycle_id)
        day = cyc.current_day if cyc else None
    ev = AuditEvent(actor_user_id=actor.email, actor_role=actor.role, action=action, entity_type=entity_type,
                    entity_id=str(entity_id), cycle_id=cycle_id, cycle_loan_id=cycle_loan_id,
                    before_json=to_json(before), after_json=to_json(after), evidence_json=to_json(evidence),
                    agent_run_id=agent_run_id, cycle_day=day, created_by=actor.email)
    session.add(ev)
    session.flush()
    return ev


def rule(session: Session, key: str, default: Any = None) -> Any:
    r = session.query(RuleConfig).filter_by(key=key, is_current=True).first()
    return r.value_json if r else default


def rule_meta(session: Session, key: str) -> dict:
    r = session.query(RuleConfig).filter_by(key=key, is_current=True).first()
    if not r:
        return {"key": key, "assumed": True}
    return {"key": key, "value": r.value_json, "assumed": not r.confirmed_by_client, "version": r.version,
            "discovery_question": r.discovery_question, "description": r.description}


def set_rule(session: Session, actor: Actor, key: str, value: Any, reason: str) -> RuleConfig:
    require(actor, "admin")
    if not reason:
        raise BusinessRuleError("A reason is required to change a rule")
    cur = session.query(RuleConfig).filter_by(key=key, is_current=True).first()
    if cur is None:
        raise BusinessRuleError(f"Unknown rule {key}")
    cur.is_current = False
    new = RuleConfig(key=key, value_json=value, value_type=cur.value_type, description=cur.description,
                     confirmed_by_client=cur.confirmed_by_client, confirmed_source=cur.confirmed_source,
                     discovery_question=cur.discovery_question, version=cur.version + 1, change_reason=reason,
                     created_by=actor.email)
    session.add(new)
    audit(session, actor, "rule.changed", "rule_config", key, before={"value": cur.value_json, "version": cur.version},
          after={"value": value, "version": new.version, "reason": reason})
    return new


def notify(session: Session, emails: Iterable[str], kind: str, title: str, body: str = "", *, entity_type: str = "",
           entity_id: str = "", cycle_id: str | None = None, link: str | None = None) -> None:
    for e in set(emails):
        if e:
            session.add(Notification(user_email=e, kind=kind, title=title, body=body, entity_type=entity_type,
                                     entity_id=str(entity_id), cycle_id=cycle_id, link=link))


def bump_loop(cl: CycleLoan, code: str) -> int:
    counts = dict(cl.loop_counts_json or {})
    counts[code] = counts.get(code, 0) + 1
    cl.loop_counts_json = counts
    return counts[code]


def cycle_date(cyc: ValuationCycle, day: int) -> date:
    return cyc.day0_date + timedelta(days=day)


def users_by_role(session: Session, role: str) -> list[AppUser]:
    return session.query(AppUser).filter_by(role=role, active=True).all()


def rnd(v: float | None, n: int = 4) -> float | None:
    return None if v is None else round(float(v), n)
