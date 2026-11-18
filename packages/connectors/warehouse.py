"""Warehouse connector: Snowflake (live) and DuckDB (local fallback) behind one interface.

Ingestion Integration Spec section 2.2: nothing above the connector changes when the
backend changes. Tests and repeated dev checks use DuckDB; never point tests at
Snowflake (trial credits are limited).
"""
from __future__ import annotations

import threading
from abc import ABC, abstractmethod
from typing import Any, Iterable, Sequence

from domain.config import settings

SCHEMAS = ["DEALCLOUD", "EVEREST", "SENTRY", "SIGMA", "FINANCE"]
_reference_cache: dict[tuple, list[dict]] = {}


def clear_reference_cache() -> None:
    """Called whenever the warehouse is reloaded or swapped."""
    _reference_cache.clear()


def _plain(v: Any) -> Any:
    from decimal import Decimal

    return float(v) if isinstance(v, Decimal) else v


class Warehouse(ABC):
    name: str

    @abstractmethod
    def query(self, sql: str, params: Sequence[Any] | None = None) -> list[dict]: ...

    @abstractmethod
    def execute(self, sql: str, params: Sequence[Any] | None = None) -> None: ...

    @abstractmethod
    def insert_rows(self, table: str, columns: list[str], rows: Iterable[Sequence[Any]]) -> int: ...

    def reference(self, sql: str, params: Sequence[Any] | None = None) -> list[dict]:
        """A query on reference data ABIQ never writes (covenants, positions, the spread template, the Sigma
        snapshot). Cached per process until the synthetic data is reloaded, so recomputing a spread costs no
        warehouse round trips (each is 80 to 130 ms on Snowflake)."""
        key = (self.name, sql, tuple(params or ()))
        if key not in _reference_cache:
            _reference_cache[key] = self.query(sql, params)
        return [dict(r) for r in _reference_cache[key]]

    def health(self) -> dict:
        try:
            self.query("select 1 as ok")
            return {"connector": self.name, "status": "ok"}
        except Exception as exc:  # pragma: no cover - surfaced in S22
            return {"connector": self.name, "status": "error", "error": str(exc)[:300]}


class DuckDBWarehouse(Warehouse):
    name = "duckdb"
    _lock = threading.Lock()

    def __init__(self, path: str | None = None):
        import duckdb

        self.path = path or settings.duckdb_path
        from pathlib import Path

        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._duckdb = duckdb

    def _conn(self):
        return self._duckdb.connect(self.path)

    def query(self, sql, params=None):
        with self._lock:
            con = self._conn()
            try:
                cur = con.execute(sql, params or [])
                cols = [d[0].upper() for d in cur.description] if cur.description else []
                return [{c: _plain(v) for c, v in zip(cols, row)} for row in cur.fetchall()]
            finally:
                con.close()

    def execute(self, sql, params=None):
        with self._lock:
            con = self._conn()
            try:
                con.execute(sql, params or [])
            finally:
                con.close()

    def insert_rows(self, table, columns, rows):
        rows = [tuple(r) for r in rows]
        if not rows:
            return 0
        placeholders = ",".join(["?"] * len(columns))
        with self._lock:
            con = self._conn()
            try:
                con.executemany(f"insert into {table} ({','.join(columns)}) values ({placeholders})", rows)
            finally:
                con.close()
        return len(rows)


class SnowflakeWarehouse(Warehouse):
    name = "snowflake"

    def __init__(self, database: str | None = None):
        self.database = database or settings.snowflake_database
        self._con = None

    def connect(self, with_database: bool = True):
        import snowflake.connector

        kwargs: dict[str, Any] = {
            "account": settings.snowflake_account,
            "user": settings.snowflake_user,
            "warehouse": settings.snowflake_warehouse,
            "client_session_keep_alive": False,
        }
        if settings.snowflake_role:
            kwargs["role"] = settings.snowflake_role
        if with_database:
            kwargs["database"] = self.database
        if settings.snowflake_private_key_path:
            from cryptography.hazmat.primitives import serialization

            with open(settings.snowflake_private_key_path, "rb") as fh:
                key = serialization.load_pem_private_key(fh.read(), password=None)
            kwargs["private_key"] = key.private_bytes(
                serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        else:
            kwargs["password"] = settings.snowflake_password
        return snowflake.connector.connect(**kwargs)

    def _conn(self):
        if self._con is None or self._con.is_closed():
            self._con = self.connect()
        return self._con

    @staticmethod
    def _qmark(sql: str) -> str:
        return sql.replace("?", "%s")

    def query(self, sql, params=None):
        cur = self._conn().cursor()
        try:
            cur.execute(self._qmark(sql), params or None)
            cols = [d[0].upper() for d in cur.description] if cur.description else []
            return [{c: _plain(v) for c, v in zip(cols, row)} for row in cur.fetchall()]
        finally:
            cur.close()

    def execute(self, sql, params=None):
        cur = self._conn().cursor()
        try:
            cur.execute(self._qmark(sql), params or None)
        finally:
            cur.close()

    def insert_rows(self, table, columns, rows):
        rows = [tuple(r) for r in rows]
        if not rows:
            return 0
        cur = self._conn().cursor()
        try:
            placeholders = ",".join(["%s"] * len(columns))
            for start in range(0, len(rows), 500):
                cur.executemany(f"insert into {table} ({','.join(columns)}) values ({placeholders})",
                                rows[start:start + 500])
        finally:
            cur.close()
        return len(rows)


_instance: Warehouse | None = None


def get_warehouse(kind: str | None = None) -> Warehouse:
    """Return the configured warehouse (WAREHOUSE=snowflake|duckdb)."""
    global _instance
    kind = kind or settings.warehouse
    if kind == "snowflake":
        if not isinstance(_instance, SnowflakeWarehouse):
            _instance = SnowflakeWarehouse()  # one reused connection per process
        return _instance
    if _instance is None or not isinstance(_instance, DuckDBWarehouse):
        _instance = DuckDBWarehouse()
    return _instance


def set_warehouse(wh: Warehouse | None) -> None:
    global _instance
    _instance = wh
    clear_reference_cache()
