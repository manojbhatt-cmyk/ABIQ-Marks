"""External events of the synthetic world: borrower emails (Q2) and Lincoln's drops in Box (Q10).

`deliver_borrower_mail(day)` drops the .eml files due that day into the simulated
inbox; `deliver_lincoln(version)` drops Lincoln's marks spreadsheet and reports into
`box/<period>/lincoln-out/<valuation-date>/`. Ground truth goes to local-data/ground_truth.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from connectors.mailbox import build_eml, mailbox
from connectors.object_store import get_store
from domain.config import REPO_ROOT
from synth import documents as D
from synth.portfolio import PERIOD, SPONSORS, borrowers, ground_truth_spread

PDF, XLSX = "application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _sponsor(br) -> str:
    return dict((s[0], s[1]) for s in SPONSORS)[br.sponsor]


def package_files(br) -> list[tuple[str, bytes, str]]:
    fac = next(f for f in br.facilities if f.in_scope)
    files = []
    if br.family == "A":
        files.append((f"{br.slug}-q3-2026-management-accounts.xlsx", D.statements_xlsx(br), XLSX))
    elif br.family == "C":
        files.append((f"{br.slug}-q3-2026-reporting-pack.pdf", D.scanned_pdf(br), PDF))
    else:
        files.append((f"{br.slug}-q3-2026-financials.pdf", D.statements_pdf(br), PDF))
    files.append((f"{br.slug}-q3-2026-covenant-cert.pdf", D.covenant_certificate(br, fac), PDF))
    if br.watchlist or fac.cmr_type == "watchlist":
        name = "northgate-equity-commitment.pdf" if br.borrower_id == "B-0002" else f"{br.slug}-sponsor-letter.pdf"
        files.append((name, D.sponsor_letter(br, _sponsor(br)), PDF))
    if br.borrower_id == "B-0002":
        files.append(("harbor-waiver-request.pdf", D.waiver_request(br), PDF))
    return files


def mail_schedule() -> dict[int, list[tuple[str, list]]]:
    """day -> [(borrower_id, files)]. Items missing until chased arrive two days after the due date chase."""
    from connectors import live_mail

    sched: dict[int, list] = {}
    for br in borrowers():
        if any(live_mail.is_live_loan(f.facility_id) for f in br.facilities if f.in_scope):
            continue  # this borrower's package arrives by real email (decision D30)
        files = package_files(br)
        held = [f for f in files if any(m.replace("_", "-") in f[0] for m in ("covenant-cert",)) and br.missing_until_chased]
        first = [f for f in files if f not in held]
        sched.setdefault(br.arrival_day, []).append((br.borrower_id, first))
        if held:
            sched.setdefault(11, []).append((br.borrower_id, held))
    return sched


def deliver_borrower_mail(day: int) -> int:
    bs = {b.borrower_id: b for b in borrowers()}
    n = 0
    for bid, files in mail_schedule().get(day, []):
        br = bs[bid]
        from synth.portfolio import team_emails

        team = team_emails(br.team)
        if len(files) > 1:
            subject = f"{br.name} Q3 2026 reporting package"
        else:
            subject = f"{br.name} Q3 2026: {_expected_type(files[0][0]).replace('_', ' ')}"
        _, raw = build_eml(f"finance@{br.domain}", [team["lead"], team["analyst"]], subject, D.cover_letter(br),
                           cc=["pm.analyst@ab-poc.local"], attachments=files,
                           date=datetime(2026, 10, day, 9, 30, tzinfo=timezone.utc) if day <= 31 else None)
        mailbox.deliver_inbound(raw, day)
        n += 1
    return n


def deliver_lincoln(version: int) -> str:
    store = get_store()
    rows = []
    for br in borrowers():
        for fac in br.facilities:
            if not fac.in_scope or (version == 2 and fac.facility_id != "F-0002"):
                continue
            row = D.lincoln_row(br, fac, version)
            rows.append(row)
            folder = f"{PERIOD}/lincoln-out/{row['valuation_date']}"
            from domain.services.lincoln import slug

            store.put("box", f"{folder}/{slug(br.name)}-{fac.facility_id}-v{version}.pdf",
                      D.lincoln_report_pdf(br, fac, row, fac.prev_mark if version == 1 else 86.5, _sponsor(br)))
    folder = f"{PERIOD}/lincoln-out/{rows[0]['valuation_date']}"
    key = f"{folder}/lincoln-marks-{PERIOD}-v{version}.xlsx"
    store.put("box", key, D.lincoln_marks_xlsx(rows))
    return key


def write_ground_truth() -> Path:
    out = REPO_ROOT / "local-data" / "ground_truth"
    out.mkdir(parents=True, exist_ok=True)
    data = {}
    for br in borrowers():
        data[br.borrower_id] = {"borrower": br.name, "family": br.family, "spread": ground_truth_spread(br),
                                "classifications": {f[0]: _expected_type(f[0]) for f in package_files(br)}}
    (out / "spreads.json").write_text(json.dumps(data, indent=2))
    (out / "expected.json").write_text(json.dumps({
        "agenda": {"F-0002": ["watchlist", "downgrade"], "F-0003": ["watchlist", "mark_move_10pct"],
                   "F-0013": ["watchlist"]},
        "reconciliation_mismatches": [{"facility_id": "F-0003", "check": "mark_tracker_vs_everest",
                                       "tracker": 88.5, "everest": 89.0}],
        "portfolio_delta": {"lincoln_v1": -3.95, "after_g1": -3.05, "final": -3.175},
        "story_values": {"previous": 117.8, "lincoln_v1": 113.85, "after_g1": 114.75, "final": 114.625}}, indent=2))
    return out


def _expected_type(name: str) -> str:
    if "covenant-cert" in name:
        return "covenant_certificate"
    if "sponsor" in name or "equity-commitment" in name:
        return "sponsor_letter"
    if "waiver" in name:
        return "waiver_request"
    return "financial_statements"


def deliver_revision(facility_id: str, version: int, valuation_date: str = "2026-10-29") -> str:
    """Lincoln answers a send-back on a loan other than Harbor: reviewed, point unchanged unless the note had new facts."""
    store = get_store()
    from domain.services.lincoln import slug

    for br in borrowers():
        for fac in br.facilities:
            if fac.facility_id != facility_id:
                continue
            row = D.lincoln_row(br, fac, 1)
            row.update({"version": version, "valuation_date": valuation_date,
                        "comments": "Reviewed after the Deal Team's send-back; conclusion unchanged"})
            folder = f"{PERIOD}/lincoln-out/{valuation_date}-{facility_id}"
            store.put("box", f"{folder}/{slug(br.name)}-{facility_id}-v{version}.pdf",
                      D.lincoln_report_pdf(br, fac, row, fac.prev_mark, _sponsor(br)))
            key = f"{folder}/lincoln-marks-{PERIOD}-{facility_id}-v{version}.xlsx"
            store.put("box", key, D.lincoln_marks_xlsx([row]))
            return key
    raise ValueError(facility_id)
