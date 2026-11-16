"""Tests run on a separate Postgres database and a temporary DuckDB file. Never on Snowflake."""
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="tiq-test-")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://tiq:tiq@localhost:5432/tiq_test")
os.environ["WAREHOUSE"] = "duckdb"
os.environ["WAREHOUSE_DUCKDB_PATH"] = os.path.join(_tmp, "warehouse.duckdb")
os.environ["OBJECT_STORE_ROOT"] = os.path.join(_tmp, "objects")
os.environ["LLM_ENABLED"] = "false"
os.environ["MAIL_LIVE_ENABLED"] = "false"  # tests never touch a real mailbox

import psycopg  # noqa: E402
import pytest  # noqa: E402


def _ensure_test_db():
    url = os.environ["DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://")
    base, name = url.rsplit("/", 1)
    with psycopg.connect(f"{base}/tiq", autocommit=True) as con:
        if not con.execute("select 1 from pg_database where datname = %s", (name,)).fetchone():
            con.execute(f'create database "{name}"')


@pytest.fixture(scope="session")
def played():
    """Reset the test stores and play the full quarterly and monthly story once per session."""
    _ensure_test_db()
    from synth.cli import reset

    log: list[str] = []
    reset("duckdb", "M6", log=log.append)
    return log
