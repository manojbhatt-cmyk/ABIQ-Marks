# Build Plan

How to build the POC in order, what each phase delivers, how it is tested, and how the demo is run. The feature-level order with status chips is in `TIQ Marks POC Feature Roadmap.xlsx`; this document explains the phases behind that order.

---

## 1. Build order and why

The order follows the process: nothing in a later step can be demonstrated without the earlier step's data. Within a step, the read-only screen comes before its actions, and code paths before AI paths, so every phase ends with something runnable.

| Phase | Name | Delivers | Demo at the end of the phase |
| --- | --- | --- | --- |
| P0 | Foundations | Repo, Docker Compose, Postgres schema, auth and roles, design tokens and shell, connectors interfaces with simulated implementations, synthetic data generator v1 (Snowflake schemas and the three demo loans), audit and notifications | Log in as each role, see the shell, see 24 loans from Snowflake in S02 |
| P1 | Kickoff and intake | Cycle creation, calendar, kickoff wizard, mailbox, document pipeline (parse, classify A0, match, index), intake screen, completeness and chase (A8), Lincoln package share | Run Q1 to Q3 for Q3 2026 with the generator playing borrower emails |
| P2 | Modelling and CMR | Spread service and metrics engine, Spreading Agent A1 with verifier, S07, CMR service and editor S08, CMR Drafting Assistant A2, Review Checker A3, review queue S09 with the three stages, filing to SharePoint, covenant certificate checker A11 | Run Q4 to Q9 on Harbor: spread, CMR, three reviews, two filed versions |
| P3 | Lincoln and the tracker | Box watcher, A4 extractor, Lincoln exchange S05, Everest load through the adapter, SharePoint copy, tracker service and S11, impact narrator A6, impact note send | Run Q10 to Q13: Lincoln v1 lands, tracker shows -$3.95M, note sent |
| P4 | Gate G1 | Pricing panel S10, cross-check calculator, Challenge Assistant A5, send-back note to Box, Lincoln v2 ingestion, mark block on the CMR | Run Q14 and Q15 on all three loans including the Harbor loop |
| P5 | Committee | Rules engine with the agenda tests, agenda and pack S12, pack narrator, meeting screen S13 with decision capture, Ask TIQ A9 docked | Run Q16 to Q18: agenda, pack, decisions including Sunrise 88.5 |
| P6 | Close | Reconciliation service and S14 with A7, approvals S15 (G2, G3), OneDrive evidence, governance write-back, distribution S16, cycle close, lineage S21 | Run Q19 to Q22; show the lineage for Sunrise |
| P7 | Monthly | Monthly cycle, update file from Snowflake inputs, S17, proposals and DDTL S18 with A10, consolidation, monthly approval S19 | Run M1 to M6 for October 2026 |
| P8 | Hardening and evaluation | Admin S22 complete (rules, connectors, synthetic data, agents, evaluation), eval harness and sets, ablations, cost meter, performance pass, accessibility pass, demo script rehearsal, documentation | Full end-to-end demo from a reset database in under 40 minutes |

The roadmap workbook totals about 253 estimated days: 243 developer days and 10 designer days (the designer also reviews every screen). With two developers that is roughly 25 weeks: P0 5 weeks, P1 4 weeks, P2 4.5 weeks, P3 2 weeks, P4 2 weeks, P5 2 weeks, P6 2 weeks, P7 1.5 weeks, P8 2.5 weeks. With three developers, P2 and P3 run in parallel (one on the Deal Team track, one on the Lincoln track, which is also how the client's process runs) and P5 and P7 run in parallel, bringing the plan to roughly 17 weeks. Estimates are ideal days per feature and will move once the first two phases calibrate them; the workbook's Summary sheet recomputes totals from the rows.

## 2. Repository layout

```
tiq-marks/
  apps/
    api/            FastAPI: routers per domain, auth, SSE, exports
    worker/         job runner: ingestion, agent runs, reminders, renders
    web/            React, TypeScript, Vite, Tailwind with the TranspoRG tokens
  packages/
    domain/         SQLAlchemy models, services, rules engine, metrics engine, workflow state machine
    connectors/     interfaces plus simulated and live implementations (Ingestion Integration Spec - Transorg.md)
    pipeline/       document and email pipelines (Ingestion Integration Spec - Transorg.md)
    agents/         LangGraph graphs and LLM calls (Agentic AI Spec - Transorg Deck.md section 15 layout)
    synth/          synthetic data generator, loaders, playback
    evals/          eval sets, runner, metrics, reports
  infra/
    docker-compose.yml, Dockerfiles, env templates, snowflake DDL, duckdb fallback
  docs/
    this spec set, ADRs, runbooks
```

## 3. Environments

| Environment | Purpose | Data | Models |
| --- | --- | --- | --- |
| Local (Compose) | development; DuckDB fallback allowed | synthetic | T2 only by default to save cost; T1 behind a flag |
| Demo (one VM, Compose) | client demos; Snowflake synthetic account | synthetic | T1 and T2 |
| Eval (CI job) | nightly eval of agents on the eval sets | synthetic | T1 and T2, budget capped |

Secrets through environment files not in the repo. The demo environment has a "reset to step" control (S22) backed by `synth play`.

## 4. Testing strategy

| Level | What | Tooling |
| --- | --- | --- |
| Unit | metrics engine formulas (Harbor numbers as fixtures), agenda tests on boundaries, reconciliation checks, tracker value formulas, workflow transitions and role checks, email template rendering, write-back idempotency | pytest |
| Pipeline | parse and classify on the three format families; match by domain and manifest; chunking | pytest with the generator's ground truth |
| Agent | smoke tests with a scripted fake chat model for every graph; eval sets with real models in CI nightly (Agentic AI Spec - Transorg Deck.md section 16) | pytest, evals package |
| API | contract tests per router; permission matrix (every role against every action) | pytest, httpx |
| UI | component tests for the AI suggestion card, gate decision panel, evidence viewer; end-to-end flows for the demo script | Vitest, Playwright |
| Demo | the full script in section 6 from a reset, automated with Playwright as a regression | Playwright |

Definition of done for a feature: code merged with tests, screen states implemented (loading, empty, error, denied, stale, running where relevant), audit events written, the roadmap row set to Done with a link to the PR, and the acceptance line from Transorg Functional Spec.md or Transorg UI UX Spec.md passing.

## 5. Team split and conventions

- Developer A: domain, workflow, Snowflake, tracker, committee, reconciliation, approvals (the spine), plus the PM-facing screens (S01, S04, S06, S11, S12, S14, S15, S17, S18, S21) so the two tracks stay balanced at about 120 days each.
- Developer B: pipelines, agents, evaluation, Lincoln exchange and the analyst-facing screens (S03, S07, S08, S09, S10, S13, S20) (the AI and ingestion track).
- Designer: tokens and components in the first two weeks, then screens in phase order, reviewing each screen against the design system checklist.
- Conventions: typed contracts shared between `domain` and `agents`; no business rule outside `rules_engine` and `rule_config`; every write to a mark, rating, watchlist, approval or decision goes through a service method that writes the audit event; prompts only in `prompts.py` with a version string; no em dashes in any string the user can see.

## 6. Demo script (40 minutes, Q3 2026 cycle)

| Minute | Screen | What happens | What to say |
| --- | --- | --- | --- |
| 0 | S01 | Reset to Day 1; the cycle dashboard with 24 loans not started | "One place to see the whole 45-day cycle" |
| 3 | S03 | Kickoff wizard; show the Assumed chips on dates; send | "The calendar is the client's; every assumed value is marked" |
| 6 | S04 | Play the generator to Day 9; Harbor's four documents classified; the waiver request raised; a late borrower chased with an AI-drafted reminder the PM sends | "Agents draft, people send" |
| 9 | S05 | Share Harbor's package with Lincoln; show the manifest | |
| 11 | S07 | Run the Spreading Agent on Harbor; review the grid; open the severance footnote evidence; approve | "95 percent of lines right, every one with evidence; the analyst approves" |
| 16 | S08 | Draft the CMR; show citations; set rating 3 to 5, watchlist, waiver, direction down; submit; A3 flags the missing equity letter | |
| 19 | S09 | A/C Manager and PM reviews with the source comments; file v1; SCT comment; re-file v2 | "The client's four-item checklist, pre-computed" |
| 22 | S05, S11 | Play Lincoln v1; tracker shows -$3.95M; send the impact note to Wes and Justin | |
| 25 | S10 | Harbor G1: the Challenge Assistant finds the $5M equity gap with the 3.4x math; send back; play Lincoln v2; approve 88.0; tracker -$3.05M | "Lincoln prices; the Deal Team challenges with evidence; nobody is replaced" |
| 29 | S12 | Agenda tests: Maple off, Harbor and Sunrise on; build and send the pack | |
| 31 | S13 | Committee: Harbor approved 88.0; Sunrise changed to 88.5 with rationale | |
| 34 | S14 | Reconciliation finds the Sunrise mismatch; correct Everest; clean run; schedule $114.625M | "The step that catches the wrong number" |
| 36 | S15 | Written approval; governance sign-off; evidence in OneDrive and Everest | |
| 38 | S16, S21 | Distribute; open Sunrise's lineage | "Every mark traceable to its source and its approvers" |
| 40 | S20 | Ask TIQ: "Why is Harbor at 88?" | |

A 10-minute monthly demo follows the same shape with S17 to S19.

## 7. Open items tracking

Every assumed rule (Transorg Data Spec.md section 8) and open item (Transorg Deck Visualization Master Spec.md section 10) is a row in the roadmap workbook's "Open items" sheet with an owner, the discovery question it maps to (DQ1 to DQ20) and a status. When AllianceBernstein confirms a value, the rule's `confirmed_by_client` flag is set in S22 and the chip turns green without a code change.

## 8. What comes after the POC

- Connect to the client's Snowflake and confirm the real schemas (the loan universe query is the only mapping point).
- Switch the write-back adapter to queue mode and agree the Everest write path.
- Replace the simulated mailbox and stores with Microsoft Graph and Box.
- Extend the eval sets with anonymised real packages, if the client provides them, before the Spreading Agent touches live data.
- Single sign-on and role mapping.
