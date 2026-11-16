"""Live mail for one loan (decision D30): a real mailbox over IMAP and SMTP, next to the simulated mailbox.

Only mail from the configured borrower sender is read, and only the configured facility (Harbor, F-0002) uses
it; every other loan stays simulated. Each new message is copied once into the `mail` bucket under
`inbox/live/`, so the email pipeline (match, classify, completeness) treats it like any inbound mail.
Sending happens only when a person clicks Send on that loan's chase. Settings come from .env:

  MAIL_LIVE_ENABLED=true          MAIL_LIVE_FACILITY=F-0002
  MAIL_USER / MAIL_PASSWORD       the mailbox TIQ reads and sends from (an app password, never committed)
  MAIL_IMAP_HOST, MAIL_IMAP_PORT  default imap.gmail.com:993
  MAIL_SMTP_HOST, MAIL_SMTP_PORT  default smtp.gmail.com:465 (587 uses STARTTLS)
  MAIL_LIVE_BORROWER              the borrower's real address (mail from it is the borrower's)
  MAIL_LIVE_DEAL_TEAM             real Deal Team addresses copied on outbound mail, comma separated
"""
from __future__ import annotations

import imaplib
import smtplib
import ssl

from connectors.mailbox import build_eml
from connectors.object_store import get_store
from domain.config import settings


def enabled() -> bool:
    return settings.mail_live_enabled and bool(settings.mail_user and settings.mail_password and settings.mail_live_borrower)


def is_live_loan(facility_id: str | None) -> bool:
    return enabled() and facility_id == settings.mail_live_facility


def is_live_key(key: str) -> bool:
    return key.startswith("inbox/live/")


def deal_team() -> list[str]:
    return [a.strip() for a in settings.mail_live_deal_team.split(",") if a.strip()]


def _imap() -> imaplib.IMAP4_SSL:
    con = imaplib.IMAP4_SSL(settings.mail_imap_host, settings.mail_imap_port, timeout=20)
    con.login(settings.mail_user, settings.mail_password)
    return con


def poll() -> list[str]:
    """Copy new mail from the borrower sender into the mail bucket; returns the new object keys. Never raises: a
    connection problem is reported by health() and the next poll tries again."""
    if not enabled():
        return []
    store, new = get_store(), []
    try:
        con = _imap()
        try:
            con.select(settings.mail_imap_folder, readonly=True)
            validity = (con.response("UIDVALIDITY")[1] or [b"0"])[0]
            validity = validity.decode() if isinstance(validity, bytes) else str(validity)
            _, data = con.uid("search", None, "FROM", f'"{settings.mail_live_borrower}"')
            for uid in (data[0] or b"").split()[-50:]:
                key = f"inbox/live/{validity}-{uid.decode()}.eml"
                if store.exists("mail", key):
                    continue
                _, msg = con.uid("fetch", uid, "(RFC822)")
                raw = next((p[1] for p in msg if isinstance(p, tuple)), None)
                if raw:
                    store.put("mail", key, raw)
                    new.append(key)
        finally:
            con.logout()
        _status.update(state="ok", error=None)
    except Exception as exc:  # network, login or server error: keep the app running
        _status.update(state="error", error=str(exc)[:300])
    return new


def send(to: list[str], subject: str, body: str, cc: list[str] | None = None,
         attachments: list[tuple[str, bytes, str]] | None = None) -> tuple[str, str]:
    """Send for real from MAIL_USER and keep a copy in the mail bucket like the simulated mailbox."""
    message_id, raw = build_eml(settings.mail_user, to, subject, body, cc, attachments,
                                message_id=None)
    recipients = list(dict.fromkeys(to + (cc or [])))
    ctx = ssl.create_default_context()
    if settings.mail_smtp_port == 465:
        with smtplib.SMTP_SSL(settings.mail_smtp_host, 465, context=ctx, timeout=30) as s:
            s.login(settings.mail_user, settings.mail_password)
            s.sendmail(settings.mail_user, recipients, raw)
    else:
        with smtplib.SMTP(settings.mail_smtp_host, settings.mail_smtp_port, timeout=30) as s:
            s.starttls(context=ctx)
            s.login(settings.mail_user, settings.mail_password)
            s.sendmail(settings.mail_user, recipients, raw)
    key = f"sent/live-{message_id.strip('<>').split('@')[0]}.eml"
    get_store().put("mail", key, raw)
    return message_id, key


_status: dict = {"state": "not checked", "error": None}


def health() -> dict:
    if not enabled():
        return {"connector": "live mail", "status": "off", "mode": "simulated for every loan"}
    return {"connector": "live mail", "status": "error" if _status["state"] == "error" else "ok",
            "mode": f"IMAP and SMTP for {settings.mail_live_facility}", "mailbox": settings.mail_user,
            "error": _status["error"]}
