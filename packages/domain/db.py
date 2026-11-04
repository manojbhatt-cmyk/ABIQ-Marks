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
        _engines[url] = create_engine(url, pool_pre_ping=True, future=True)
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
