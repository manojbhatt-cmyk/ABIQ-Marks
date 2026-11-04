"""Write-back adapter (Ingestion Integration Spec section 6).

Every write to a client system (Everest pricing panel, risk rating, spread, CMR,
governance sign-off) goes through here. Modes:
  synthetic_write  apply to the synthetic warehouse schema now (POC default)
  queue            record the change for a person to apply in the client system
Writes are idempotent: the same TIQ entity version never produces two changes.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from connectors.warehouse import get_warehouse
from domain.config import settings
from domain.models import WritebackChange


def _now():
    return datetime.now(timezone.utc)


def upsert(session: Session, schema: str, table: str, key: dict, payload: dict, *, actor: str,
           tiq_entity_type: str, tiq_entity_id: str, tiq_entity_version: int = 1,
           mode: str | None = None) -> WritebackChange:
    mode = mode or settings.writeback_mode
    existing = session.query(WritebackChange).filter_by(
        target_schema=schema, target_table=table, tiq_entity_type=tiq_entity_type,
        tiq_entity_id=tiq_entity_id, tiq_entity_version=tiq_entity_version).first()
    if existing and existing.status == "applied" and existing.payload_json == payload:
        return existing

    wh = get_warehouse()
    where = " and ".join(f"{k} = ?" for k in key)
    before_rows = wh.query(f"select * from {schema}.{table} where {where}", list(key.values()))
    before = {k: _jsonable(v) for k, v in before_rows[0].items()} if before_rows else None
    change = WritebackChange(
        target_schema=schema, target_table=table, target_key_json=key, payload_json=payload,
        before_json=before, mode=mode, status="pending", requested_by=actor, requested_at=_now(),
        tiq_entity_type=tiq_entity_type, tiq_entity_id=tiq_entity_id, tiq_entity_version=tiq_entity_version)
    session.add(change)
    if mode == "synthetic_write":
        apply_change(change, actor)
    session.flush()
    return change


def apply_change(change: WritebackChange, actor: str) -> None:
    wh = get_warehouse()
    key, payload = change.target_key_json, change.payload_json
    table = f"{change.target_schema}.{change.target_table}"
    where = " and ".join(f"{k} = ?" for k in key)
    try:
        if change.before_json is not None:
            sets = ", ".join(f"{k} = ?" for k in payload)
            wh.execute(f"update {table} set {sets}, LOADED_AT = current_timestamp where {where}",
                       list(payload.values()) + list(key.values()))
        else:
            cols = list(key) + [c for c in payload if c not in key] + ["LOADED_AT", "SOURCE_BATCH_ID"]
            vals = list(key.values()) + [payload[c] for c in payload if c not in key]
            placeholders = ",".join(["?"] * (len(vals))) + ", current_timestamp, 'tiq-writeback'"
            wh.execute(f"insert into {table} ({','.join(cols)}) values ({placeholders})", vals)
        change.status, change.applied_by, change.applied_at = "applied", actor, _now()
    except Exception as exc:
        change.status, change.error = "failed", str(exc)[:500]


def _jsonable(v):
    if hasattr(v, "isoformat"):
        return v.isoformat()
    if isinstance(v, (int, float, str, bool)) or v is None:
        return v
    return float(v) if hasattr(v, "__float__") else str(v)
