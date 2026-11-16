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
    return upsert_many(session, schema, table, [{
        "key": key, "payload": payload, "tiq_entity_type": tiq_entity_type, "tiq_entity_id": tiq_entity_id,
        "tiq_entity_version": tiq_entity_version}], actor=actor, mode=mode)[0]


def upsert_many(session: Session, schema: str, table: str, items: list[dict], *, actor: str,
                mode: str | None = None) -> list[WritebackChange]:
    """Write many rows to one table in at most three warehouse calls: read the rows as they were, update the
    ones that exist, insert the rest. Each item: key, payload, tiq_entity_type, tiq_entity_id, tiq_entity_version.
    Every row in one call has the same key and payload columns."""
    mode = mode or settings.writeback_mode
    out: list[WritebackChange | None] = []
    todo: list[tuple[int, dict]] = []
    for it in items:
        done = session.query(WritebackChange).filter_by(
            target_schema=schema, target_table=table, tiq_entity_type=it["tiq_entity_type"],
            tiq_entity_id=it["tiq_entity_id"], tiq_entity_version=it.get("tiq_entity_version", 1)).first()
        if done and done.status == "applied" and done.payload_json == it["payload"]:
            out.append(done)
        else:
            out.append(None)
            todo.append((len(out) - 1, it))
    if not todo:
        return out  # type: ignore[return-value]

    wh = get_warehouse()
    keys = list(todo[0][1]["key"])
    match = " or ".join("(" + " and ".join(f"{k} = ?" for k in keys) + ")" for _ in todo)
    found = wh.query(f"select * from {schema}.{table} where {match}",
                     [it["key"][k] for _, it in todo for k in keys])
    before_of = {tuple(r[k] for k in keys): {k: _jsonable(v) for k, v in r.items()} for r in found}
    changes = []
    for i, it in todo:
        c = WritebackChange(
            target_schema=schema, target_table=table, target_key_json=it["key"], payload_json=it["payload"],
            before_json=before_of.get(tuple(it["key"][k] for k in keys)), mode=mode, status="pending",
            requested_by=actor, requested_at=_now(), tiq_entity_type=it["tiq_entity_type"],
            tiq_entity_id=it["tiq_entity_id"], tiq_entity_version=it.get("tiq_entity_version", 1))
        session.add(c)
        out[i] = c
        changes.append(c)
    if mode == "synthetic_write":
        _apply(changes, actor)
    session.flush()
    return out  # type: ignore[return-value]


def _apply(changes: list[WritebackChange], actor: str) -> None:
    """One UPDATE ... FROM (VALUES ...) for rows that exist and one multi-row INSERT for new rows."""
    wh = get_warehouse()
    first = changes[0]
    table = f"{first.target_schema}.{first.target_table}"
    keys, fields = list(first.target_key_json), list(first.payload_json)
    updates = [c for c in changes if c.before_json is not None]
    inserts = [c for c in changes if c.before_json is None]
    try:
        if updates:
            cols = keys + [f for f in fields if f not in keys]
            rows = ", ".join("(" + ", ".join(["?"] * len(cols)) + ")" for _ in updates)
            sets = ", ".join(f"{f} = s.{f}" for f in fields if f not in keys)
            on = " and ".join(f"{table}.{k} = s.{k}" for k in keys)
            wh.execute(f"update {table} set {sets}, LOADED_AT = current_timestamp "
                       f"from (values {rows}) as s ({', '.join(cols)}) where {on}",
                       [{**c.target_key_json, **c.payload_json}[k] for c in updates for k in cols])
        if inserts:
            cols = keys + [f for f in fields if f not in keys]
            stamp = _now().replace(tzinfo=None)
            wh.insert_rows(table, cols + ["LOADED_AT", "SOURCE_BATCH_ID"],
                           [[{**c.target_key_json, **c.payload_json}[k] for k in cols] + [stamp, "tiq-writeback"]
                            for c in inserts])
        for c in changes:
            c.status, c.applied_by, c.applied_at = "applied", actor, _now()
    except Exception as exc:
        for c in changes:
            c.status, c.error = "failed", str(exc)[:500]


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
