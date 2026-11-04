"""Auth (local users with roles, Master Spec section 3.2) and shared request helpers."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Iterator

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from domain.config import settings
from domain.db import SessionLocal
from domain.models import AppUser, ValuationCycle
from domain.services.core import Actor, BusinessRuleError, Forbidden

DEMO_PASSWORD = "demo"


def sign(payload: dict) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    sig = hmac.new(settings.secret_key.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def verify(token: str) -> dict:
    try:
        body, sig = token.rsplit(".", 1)
    except ValueError:
        raise HTTPException(401, "Invalid token")
    good = hmac.new(settings.secret_key.encode(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(good, sig):
        raise HTTPException(401, "Invalid token")
    data = json.loads(base64.urlsafe_b64decode(body))
    if data.get("exp", 0) < time.time():
        raise HTTPException(401, "Session expired")
    return data


def db() -> Iterator[Session]:
    s = SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def current_actor(authorization: str = Header(default=""), session: Session = Depends(db)) -> Actor:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in required")
    data = verify(authorization[7:])
    u = session.query(AppUser).filter_by(email=data["sub"], active=True).first()
    if not u:
        raise HTTPException(401, "Unknown user")
    return Actor.of(u)


def quarterly_cycle(session: Session, cycle_id: str | None = None) -> ValuationCycle:
    q = session.query(ValuationCycle)
    c = session.get(ValuationCycle, cycle_id) if cycle_id else q.filter_by(cycle_type="quarterly").order_by(
        ValuationCycle.day0_date.desc()).first()
    if not c:
        raise HTTPException(404, "No cycle yet. Create one in the Kickoff wizard or reset the demo in Admin.")
    return c


def to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, Forbidden):
        return HTTPException(403, str(exc))
    if isinstance(exc, BusinessRuleError):
        return HTTPException(409, str(exc))
    return HTTPException(500, str(exc))
