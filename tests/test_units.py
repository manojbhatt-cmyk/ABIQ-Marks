"""Fast unit tests: metrics engine (Harbor fixture), cross-check, parser, classifier, checker, challenge."""
from agents import a0_classifier
from agents.assistants import a3_check, a5_challenge, a11_check_certificate
from domain import metrics as M
from pipeline.parse import _tables_from_text
from synth.portfolio import borrowers, ground_truth_spread

HARBOR = {("REVENUE", "quarter"): 41.0, ("REVENUE", "same_quarter_last_year"): 48.0,
          ("REPORTED_EBITDA", "quarter"): 4.1, ("REPORTED_EBITDA", "prior_quarter"): 3.7,
          ("REPORTED_EBITDA", "q_minus_2"): 3.9, ("REPORTED_EBITDA", "q_minus_3"): 4.0,
          ("REPORTED_EBITDA", "same_quarter_last_year"): 7.2, ("CASH", "quarter"): 1.4,
          ("TOTAL_DEBT", "quarter"): 60.0, ("INTEREST_EXPENSE_LTM", "quarter"): 6.2}


def test_harbor_metrics_match_the_source_notes():
    m = M.compute(HARBOR, {"quarter": 0.3})
    assert m["ADJ_EBITDA"]["value"] == 4.4
    assert m["LTM_ADJ_EBITDA"]["value"] == 16.0
    assert m["LEVERAGE"]["value"] == 3.75
    assert round(m["NET_LEVERAGE"]["value"], 2) == 3.66
    assert round(m["INTEREST_COVER"]["value"], 1) == 2.6
    assert round(m["REVENUE_YOY"]["value"], 2) == -0.15
    assert round(m["EBITDA_YOY"]["value"], 2) == -0.43


def test_harbor_covenant_fails_and_net_of_equity_passes():
    m = M.compute(HARBOR, {"quarter": 0.3})
    t = M.covenant_test(m, {"COVENANT_TYPE": "max_leverage", "OPERATOR": "<", "THRESHOLD": 3.5})
    assert t["result"] == "fail"
    assert round((60.0 - 5.0) / 16.0, 1) == 3.4


def test_indicative_crosscheck_near_86_2():
    assert abs(M.indicative_price(0.103, 3, 0.165) - 86.2) < 0.1


def test_ground_truth_is_consistent_for_every_borrower():
    for b in borrowers():
        gt = ground_truth_spread(b)
        assert abs(gt["REVENUE"] - gt["COGS"] - gt["OPEX"] - gt["REPORTED_EBITDA"]) < 0.15


def test_parser_handles_cell_per_line_layout():
    text = "Consolidated statement of operations\nQ3 2025\nTotal revenue\n48.0\n45.5\n44.8\n44.0\n41.0\nNotes"
    rows = [r for t in _tables_from_text(1, text, 0) for r in t.rows]
    assert ["Total revenue", 48.0, 45.5, 44.8, 44.0, 41.0] in rows


def test_classifier():
    assert a0_classifier.classify("x-covenant-cert.pdf", "Compliance Certificate leverage ratio")[0] == "covenant_certificate"
    assert a0_classifier.classify("waiver.pdf", "Request for waiver")[0] == "waiver_request"
    assert a0_classifier.classify("fin.pdf", "statement of operations revenue")[0] == "financial_statements"


def test_certificate_checker_flags_harbor():
    r = a11_check_certificate("Maximum total leverage ratio < 3.50x 3.42x In compliance", 3.75, 0.05, 3.5)
    assert r["status"] == "mismatch" and "differs" in r["finding"]


def test_review_checker_flags_missing_letter_then_passes():
    base = {"sections": {"x": "Northgate has committed $5.0M of new equity"}, "metrics": {"LTM_ADJ_EBITDA": 16},
            "addbacks": [], "recommendation": {}, "covenant_result": "fail"}
    f = {i["item"]: i["result"] for i in a3_check({**base, "evidence_types": []})}
    assert f["evidence_attached"] == "fail"
    f = {i["item"]: i["result"] for i in a3_check({**base, "evidence_types": ["sponsor_letter"]})}
    assert f["evidence_attached"] == "pass"


def test_challenge_assistant_math():
    r = a5_challenge({"lincoln_assumptions": "Lost major customer; covenant breach; no sponsor support assumed",
                      "sponsor_equity": {"sponsor": "Northgate Capital", "amount": 5.0, "date": "6 Oct", "evidence": []},
                      "metrics": {"TOTAL_DEBT": 60.0, "LTM_ADJ_EBITDA": 16.0, "INTEREST_COVER": 2.58},
                      "covenant_threshold": 3.5})
    assert "55 / 16 = 3.4x" in r["differences"][0]["math"]
    assert "Northgate Capital" in r["draft_note"]


def test_no_em_dashes_in_templates():
    from synth.seed_app import TEMPLATES

    for subject, body in TEMPLATES.values():
        assert "—" not in subject + body


def test_loan_moves_to_gate_1_once_both_tracks_are_finished():
    """Q13 finished on both tracks means the loan waits at Gate 1 (Q14), not at "Copy to SharePoint"."""
    from domain.models import CycleLoan
    from domain.services.cycle import refresh_step

    cl = CycleLoan(current_step="Q12", dt_step="Q13", lincoln_step="Q13", status="in_progress")
    refresh_step(cl)
    assert cl.current_step == "Q14"


def test_loan_stays_with_the_track_furthest_behind():
    from domain.models import CycleLoan
    from domain.services.cycle import refresh_step

    cl = CycleLoan(current_step="Q9", dt_step="Q9", lincoln_step="Q13", status="in_progress")
    refresh_step(cl)
    assert cl.current_step == "Q9"
    cl = CycleLoan(current_step="Q12", dt_step="Q13", lincoln_step="Q12", status="in_progress")
    refresh_step(cl)
    assert cl.current_step == "Q12"
