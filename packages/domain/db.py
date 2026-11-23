from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from domain.config import settings

_engines: dict[str, object] = {}


def get_engine(url: str | None = None):
    url = url or settings.database_url
    if url not in _engines:
        kwargs = {"pool_pre_ping": True, "future": True}
        if url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
        eng = create_engine(url, **kwargs)
        if url.startswith("sqlite"):
            from sqlalchemy import event

            @event.listens_for(eng, "connect")
            def set_sqlite_pragma(dbapi_connection, connection_record):
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")
                cursor.close()
        _engines[url] = eng
    return _engines[url]


SessionLocal = sessionmaker(bind=get_engine(), expire_on_commit=False, future=True)


def bind_session_factory(url: str) -> None:
    """Point the session factory at another database (used by tests)."""
    SessionLocal.configure(bind=get_engine(url))


@contextmanager
def session_scope() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
