"""Settings come only from environment variables (CLAUDE.md, "Dev matches prod")."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_dotenv() -> None:
    """Read the repo's .env once, without overriding variables already set."""
    path = REPO_ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.split(" #", 1)[0].strip()
        os.environ.setdefault(key.strip(), value)


_load_dotenv()


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default) or default


@dataclass(frozen=True)
class Settings:
    database_url: str = _env("DATABASE_URL", "postgresql+psycopg://tiq:tiq@localhost:5432/tiq")
    test_database_url: str = _env("TEST_DATABASE_URL", "postgresql+psycopg://tiq:tiq@localhost:5432/tiq_test")
    secret_key: str = _env("SECRET_KEY", "dev-secret-change-me")
    object_store_root: str = _env("OBJECT_STORE_ROOT", str(REPO_ROOT / "local-data" / "objects"))
    warehouse: str = _env("WAREHOUSE", "duckdb")
    duckdb_path: str = _env("WAREHOUSE_DUCKDB_PATH", str(REPO_ROOT / "local-data" / "warehouse.duckdb"))
    snowflake_account: str = _env("SNOWFLAKE_ACCOUNT")
    snowflake_user: str = _env("SNOWFLAKE_USER")
    snowflake_password: str = _env("SNOWFLAKE_PASSWORD")
    snowflake_private_key_path: str = _env("SNOWFLAKE_PRIVATE_KEY_PATH") or _env("SNOWFLAKE_PRIVATE_KEY_FILE")
    snowflake_role: str = _env("SNOWFLAKE_ROLE") or _env("SNOWFLAKE_LOADER_ROLE")
    snowflake_warehouse: str = _env("SNOWFLAKE_WAREHOUSE", "TIQ_XS")
    snowflake_database: str = _env("SNOWFLAKE_DATABASE", "TIQ_POC")
    writeback_mode: str = _env("WRITEBACK_MODE", "synthetic_write")
    openai_api_key: str = _env("OPENAI_API_KEY")
    model_heavy: str = _env("MODEL_HEAVY", "gpt-4o-mini")
    model_light: str = _env("MODEL_LIGHT", "gpt-4o-mini")
    llm_enabled: bool = _env("LLM_ENABLED", "auto") != "false"
    # Live mail for one loan (connectors/live_mail.py, decision D30). Off unless MAIL_LIVE_ENABLED=true.
    mail_live_enabled: bool = _env("MAIL_LIVE_ENABLED", "false").lower() == "true"
    mail_live_facility: str = _env("MAIL_LIVE_FACILITY", "F-0002")
    mail_live_borrower: str = _env("MAIL_LIVE_BORROWER").lower()
    mail_live_deal_team: str = _env("MAIL_LIVE_DEAL_TEAM")
    mail_user: str = _env("MAIL_USER")
    mail_password: str = _env("MAIL_PASSWORD")
    mail_imap_host: str = _env("MAIL_IMAP_HOST", "imap.gmail.com")
    mail_imap_port: int = int(_env("MAIL_IMAP_PORT", "993"))
    mail_imap_folder: str = _env("MAIL_IMAP_FOLDER", "INBOX")
    mail_smtp_host: str = _env("MAIL_SMTP_HOST", "smtp.gmail.com")
    mail_smtp_port: int = int(_env("MAIL_SMTP_PORT", "465"))


settings = Settings()

# Price table per million tokens (USD) for the cost meter (Agentic AI Spec section 11).
MODEL_PRICES = {"gpt-4o-mini": (0.15, 0.60), "gpt-4o": (2.50, 10.00)}
