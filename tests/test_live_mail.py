"""Live mail for one loan (decision D30), against a fake IMAP and SMTP server: never a real mailbox."""
import dataclasses

import pytest

from connectors import live_mail
from connectors.mailbox import build_eml
from domain.db import session_scope
from domain.models import CycleLoan, Document, EmailMessage, Reminder, ValuationCycle
from domain.services import intake
from synth import generator, world
from synth.play import pm
from synth.portfolio import borrowers

BORROWER = "cfo@harbor-real.example"


class FakeImap:
    mails: list[bytes] = []

    def __init__(self, *a, **k): pass
    def login(self, *a): pass
    def select(self, *a, **k): return "OK", [b"1"]
    def response(self, name): return name, [b"7"]
    def logout(self): pass

    def uid(self, cmd, *args):
        if cmd == "search":
            return "OK", [b" ".join(str(i + 1).encode() for i in range(len(self.mails)))]
        return "OK", [(b"1 (RFC822)", self.mails[int(args[0]) - 1])]


class FakeSmtp:
    sent: list = []

    def __init__(self, *a, **k): pass
    def __enter__(self): return self
    def __exit__(self, *a): pass
    def login(self, *a): pass
    def sendmail(self, frm, to, raw): FakeSmtp.sent.append((frm, to, raw))


@pytest.fixture(scope="module")
def live(request):
    from tests.conftest import _ensure_test_db
    from synth.cli import reset
    import domain.config as cfg

    mp = pytest.MonkeyPatch()
    on = dataclasses.replace(cfg.settings, mail_live_enabled=True, mail_user="pm.real@example.org", mail_password="x",
                             mail_live_borrower=BORROWER, mail_live_deal_team="team.real@example.org",
                             mail_live_facility="F-0002")
    mp.setattr(live_mail, "settings", on)
    import domain.config
    mp.setattr(domain.config, "settings", on)
    mp.setattr(live_mail.imaplib, "IMAP4_SSL", FakeImap)
    mp.setattr(live_mail.smtplib, "SMTP_SSL", FakeSmtp)
    FakeImap.mails, FakeSmtp.sent = [], []
    _ensure_test_db()
    reset("duckdb", "Q1", log=lambda m: None)
    with session_scope() as s:
        yield s.query(ValuationCycle).filter_by(cycle_type="quarterly").one().id
    mp.undo()


def _harbor(s):
    return s.query(CycleLoan).filter_by(facility_id="F-0002").one()


def test_harbor_gets_no_simulated_mail_and_real_mail_is_matched(live):
    assert all(bid != "B-0002" for day in generator.mail_schedule().values() for bid, _ in day)
    with session_scope() as s:
        world.advance(s, pm(s), live, 10)  # other loans' simulated packages arrive; Harbor's does not
    with session_scope() as s:
        assert _harbor(s).package_status != "complete"
    br = next(b for b in borrowers() if b.borrower_id == "B-0002")
    _, raw = build_eml(f"Harbor CFO <{BORROWER}>", ["pm.real@example.org"], "Q3 package", "Attached.",
                       attachments=generator.package_files(br))
    FakeImap.mails = [raw]
    with session_scope() as s:
        got = intake.process_inbox(s, live)
        assert len(got) == 1 and got[0].match_method == "live sender" and got[0].eml_path.startswith("inbox/live/")
    with session_scope() as s:
        assert intake.process_inbox(s, live) == []  # the same message is not read twice
        h = _harbor(s)
        assert s.query(Document).filter_by(facility_id="F-0002").count() == len(generator.package_files(br))
        assert h.package_status == "complete"


def test_harbor_chase_is_sent_for_real_to_the_borrower(live):
    with session_scope() as s:
        h = _harbor(s)
        r = Reminder(cycle_loan_id=h.id, draft_subject="Reminder", draft_body="Please send the package.", status="draft")
        s.add(r)
        s.flush()
        intake.send_chase(s, pm(s), r.id)
        m = s.query(EmailMessage).filter_by(direction="out", matched_facility_id="F-0002").one()
        assert m.to_addrs == [BORROWER] and m.cc_addrs == ["team.real@example.org"] and m.eml_path.startswith("sent/live-")
    frm, to, _ = FakeSmtp.sent[-1]
    assert frm == "pm.real@example.org" and set(to) == {BORROWER, "team.real@example.org"}
