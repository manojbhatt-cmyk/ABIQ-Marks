"""Tell ABIQ what a CMR section misses (decision D27): a redraft is a suggestion, never applied by itself."""
import pytest

from domain.db import session_scope
from domain.models import AgentRun, AgentSuggestion, AuditEvent, CmrSection, CycleLoan
from domain.services import cmrs
from domain.services.core import BusinessRuleError
from synth.play import _team_actor


@pytest.fixture(scope="module")
def harbor_cmr():
    from tests.conftest import _ensure_test_db
    from synth.cli import reset

    _ensure_test_db()
    reset("duckdb", "Q4", log=lambda m: None)  # spreads approved, no CMR yet
    with session_scope() as s:
        cl = s.query(CycleLoan).filter_by(facility_id="F-0002").one()
        a = _team_actor(s, cl)
        cmr = cmrs.get_or_create_cmr(s, a, cl.id)
        cmrs.draft_sections(s, a, cmr.id, ["risks"])
        sec = s.query(CmrSection).filter_by(cmr_id=cmr.id, section_code="risks").one()
        cmrs.decide_section(s, a, sec.id, "accept")
        return cl.id, sec.id


def test_redraft_adds_facts_from_documents_as_a_suggestion(harbor_cmr):
    loan_id, sec_id = harbor_cmr
    with session_scope() as s:
        cl = s.get(CycleLoan, loan_id)
        before = s.get(CmrSection, sec_id).body_markdown
        cmrs.redraft_section(s, _team_actor(s, cl), sec_id, "add the sponsor equity commitment")
    with session_scope() as s:
        sec = s.get(CmrSection, sec_id)
        assert sec.body_markdown == before  # nothing applied: people decide
        assert sec.draft_body_markdown.startswith(before.strip()) and len(sec.draft_body_markdown) > len(before)
        assert "equity" in sec.draft_body_markdown[len(before):].lower()
        assert "$5.0 million" in sec.draft_body_markdown and any(c["file"].endswith(".pdf") for c in sec.citations_json)
        sug = s.query(AgentSuggestion).filter_by(target_entity_id=sec_id, status="proposed").one()
        assert sug.kind == "cmr_redraft" and sug.payload_json["instruction"] == "add the sponsor equity commitment"
        assert s.get(AgentRun, sug.agent_run_id).graph_name == "cmr_redraft"
        assert s.query(AuditEvent).filter_by(action="cmr.section_redraft_requested", entity_id=sec_id).count() == 1
        view = cmrs.cmr_view(s, loan_id)
        assert next(x for x in view["sections"] if x["id"] == sec_id)["pending"]["kind"] == "cmr_redraft"
        cmrs.decide_section(s, _team_actor(s, s.get(CycleLoan, loan_id)), sec_id, "accept")
    with session_scope() as s:
        sec = s.get(CmrSection, sec_id)
        assert sec.body_markdown == sec.draft_body_markdown
        assert cmrs._pending(s, sec_id) is None


def test_redraft_needs_an_instruction(harbor_cmr):
    loan_id, sec_id = harbor_cmr
    with session_scope() as s:
        with pytest.raises(BusinessRuleError):
            cmrs.redraft_section(s, _team_actor(s, s.get(CycleLoan, loan_id)), sec_id, " ")
