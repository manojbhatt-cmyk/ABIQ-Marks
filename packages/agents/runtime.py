"""Agent runtime: run records, suggestions, and the optional model call.

Agents prepare, people decide: nothing here writes a mark, rating, watchlist flag,
approval, send-back, email or Everest row. Every run is an `agent_run` with tokens,
cost and a trajectory; every output is an `agent_suggestion` a person accepts, edits
or rejects. Each component has a deterministic engine (rules and code over the
parsed documents) so the demo and the tests run without a model; with
LLM_ENABLED=true and an OpenAI key, prose components ask the configured model to
rewrite their draft, constrained to the same facts.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any

import httpx
from sqlalchemy.orm import Session

from domain.config import MODEL_PRICES, settings
from domain.models import AgentRun, AgentSuggestion
from domain.services.core import now

PROMPT_VERSION = "2026-11-04.1"


def llm_enabled() -> bool:
    """The model is used whenever an OpenAI key is configured, unless LLM_ENABLED=false (the tests set it)."""
    return os.environ.get("LLM_ENABLED", "auto").lower() != "false" and bool(settings.openai_api_key)


def _complete(run: AgentRun, messages: list[dict], heavy: bool = False, temperature: float = 0.2) -> str:
    """One chat completion with token and cost accounting on the run. Raises on any failure."""
    model = settings.model_heavy if heavy else settings.model_light
    resp = httpx.post("https://api.openai.com/v1/chat/completions", timeout=30,
                      headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                      json={"model": model, "temperature": temperature, "messages": messages})
    resp.raise_for_status()
    data = resp.json()
    usage = data.get("usage", {})
    pin, pout = usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)
    run.prompt_tokens = (run.prompt_tokens or 0) + pin
    run.completion_tokens = (run.completion_tokens or 0) + pout
    price_in, price_out = MODEL_PRICES.get(model, (0.15, 0.60))
    run.cost_usd = (run.cost_usd or 0) + (pin * price_in + pout * price_out) / 1_000_000
    step(run, "llm_call", {"model": model, "prompt_tokens": pin, "completion_tokens": pout})
    return data["choices"][0]["message"]["content"].strip().replace("\u2014", ", ")


def chat(run: AgentRun, system: str, messages: list[dict]) -> str | None:
    """A conversational answer (Ask TIQ general questions). None when the model is off or fails."""
    if not llm_enabled():
        return None
    try:
        return _complete(run, [{"role": "system", "content": system}] + messages, temperature=0.3) or None
    except Exception as exc:
        step(run, "llm_chat_failed", str(exc)[:200])
        return None


@contextmanager
def agent_run(session: Session, component: str, graph_name: str, *, cycle_id: str | None = None,
              cycle_loan_id: str | None = None, input_summary: str = ""):
    run = AgentRun(component=component, graph_name=graph_name, cycle_id=cycle_id, cycle_loan_id=cycle_loan_id,
                   thread_id=f"{component}:{cycle_loan_id or cycle_id}", started_at=now(), status="running",
                   engine="llm" if llm_enabled() else "rules", input_summary=input_summary[:2000],
                   model_names_json=[settings.model_heavy if component in ("A1", "A2", "A5") else settings.model_light],
                   trajectory_json=[])
    session.add(run)
    session.flush()
    try:
        yield run
        run.status = "succeeded"
    except Exception as exc:
        run.status, run.error = "failed", str(exc)[:1000]
        raise
    finally:
        run.finished_at = now()
        run.steps = len(run.trajectory_json or [])


def step(run: AgentRun, name: str, detail: Any = None) -> None:
    traj = list(run.trajectory_json or [])
    traj.append({"step": len(traj) + 1, "name": name, "detail": detail})
    run.trajectory_json = traj


def suggest(session: Session, run: AgentRun, kind: str, target_type: str, target_id: Any, payload: dict,
            confidence: float | None = None) -> AgentSuggestion:
    s = AgentSuggestion(agent_run_id=run.id, kind=kind, target_entity_type=target_type,
                        target_entity_id=str(target_id), payload_json=payload, confidence=confidence)
    session.add(s)
    session.flush()
    return s


def rewrite(run: AgentRun, draft: str, instruction: str, heavy: bool = False, sources: str = "") -> str:
    """Optional LLM polish of a deterministic draft. Facts must not change; returns the draft on any failure.
    With `sources`, the model may add facts, but only ones found in those sources, cited as [file p.N]."""
    if not llm_enabled():
        return draft
    model = settings.model_heavy if heavy else settings.model_light
    try:
        resp = httpx.post("https://api.openai.com/v1/chat/completions", timeout=30,
                          headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                          json={"model": model, "temperature": 0.2, "messages": [
                              {"role": "system", "content": "You edit credit memo text for a private credit "
                               "valuation team. Keep every number, name and citation marker exactly. Do not add "
                               "facts. Never use em dashes. " + instruction if not sources else
                               "You edit credit memo text for a private credit valuation team. Keep every number, "
                               "name and citation marker exactly. Add facts only from SOURCES, cite each as "
                               "[file p.N], and return only the section text. Never use em dashes. " + instruction},
                              {"role": "user", "content": draft if not sources else
                               f"CURRENT TEXT:\n{draft}\n\nSOURCES:\n{sources}"}]})
        resp.raise_for_status()
        data = resp.json()
        usage = data.get("usage", {})
        pin, pout = usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)
        run.prompt_tokens = (run.prompt_tokens or 0) + pin
        run.completion_tokens = (run.completion_tokens or 0) + pout
        price_in, price_out = MODEL_PRICES.get(model, (0.15, 0.60))
        run.cost_usd = (run.cost_usd or 0) + (pin * price_in + pout * price_out) / 1_000_000
        step(run, "llm_rewrite", {"model": model, "prompt_tokens": pin, "completion_tokens": pout})
        text = data["choices"][0]["message"]["content"].strip()
        return text.replace("—", ", ") or draft
    except Exception as exc:  # the deterministic draft stands
        step(run, "llm_rewrite_failed", str(exc)[:200])
        return draft
