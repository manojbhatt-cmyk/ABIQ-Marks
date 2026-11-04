"""Simulated Outlook mailbox (Ingestion Integration Spec section 4).

Outbound mail is rendered to .eml in the `mail` bucket and recorded as an
`email_message`. Inbound mail is dropped by the generator into `mail/inbox/` and
picked up by the email pipeline. A Microsoft Graph adapter would implement the same
two methods.
"""
from __future__ import annotations

import email
import email.policy
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage as MimeMessage

from connectors.object_store import get_store


def build_eml(from_addr: str, to: list[str], subject: str, body: str, cc: list[str] | None = None,
              attachments: list[tuple[str, bytes, str]] | None = None, message_id: str | None = None,
              date: datetime | None = None) -> tuple[str, bytes]:
    msg = MimeMessage()
    message_id = message_id or f"<{uuid.uuid4()}@ab-poc.local>"
    msg["Message-ID"] = message_id
    msg["From"] = from_addr
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg["Subject"] = subject
    msg["Date"] = email.utils.format_datetime(date or datetime.now(timezone.utc))
    msg.set_content(body)
    for name, data, mime in attachments or []:
        maintype, subtype = mime.split("/", 1)
        msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=name)
    return message_id, msg.as_bytes(policy=email.policy.SMTP)


def parse_eml(data: bytes) -> dict:
    msg = email.message_from_bytes(data, policy=email.policy.default)
    body = msg.get_body(preferencelist=("plain",))
    attachments = []
    for part in msg.iter_attachments():
        attachments.append({"file_name": part.get_filename(), "mime": part.get_content_type(),
                            "data": part.get_payload(decode=True)})
    return {
        "message_id": msg["Message-ID"], "from": msg["From"], "to": [a.strip() for a in (msg["To"] or "").split(",") if a.strip()],
        "cc": [a.strip() for a in (msg["Cc"] or "").split(",") if a.strip()], "subject": msg["Subject"],
        "date": msg["Date"], "body": body.get_content() if body else "", "attachments": attachments,
    }


class SimulatedMailbox:
    """send() stores the outbound .eml; inbox() lists inbound .eml files not yet processed."""

    def send(self, from_addr: str, to: list[str], subject: str, body: str, cc: list[str] | None = None,
             attachments: list[tuple[str, bytes, str]] | None = None) -> tuple[str, str]:
        message_id, raw = build_eml(from_addr, to, subject, body, cc, attachments)
        key = f"sent/{uuid.uuid4().hex}.eml"
        get_store().put("mail", key, raw)
        return message_id, key

    def deliver_inbound(self, raw: bytes, day: int) -> str:
        key = f"inbox/day-{day:02d}/{uuid.uuid4().hex}.eml"
        get_store().put("mail", key, raw)
        return key

    def inbox(self) -> list[str]:
        return get_store().list("mail", "inbox/")

    def read(self, key: str) -> dict:
        return parse_eml(get_store().get("mail", key))

    def health(self) -> dict:
        return {"connector": "mailbox", "status": "ok", "mode": "simulated"}


mailbox = SimulatedMailbox()
