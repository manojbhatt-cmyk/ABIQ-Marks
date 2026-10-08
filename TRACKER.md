# TIQ Marks POC: Project Tracker

Where the build stands, phase by phase. Built only from the md specs and the process deck in `docs/specs/`.

**Live dashboard (activity log, phases, decisions, questions):** https://claude.ai/artifact/TDZE7perELDzhUTURCaKrY
**Last updated:** 8 October 2026
**Current phase:** P00 Readiness, in progress

---

## 1. How we work

1. **Build from `docs/specs/` only**: the md specs and `Alliance Bernstein Marks Process.pptx`. Nothing outside that folder. If code ever needs to differ from a spec, log it in section 4 and fix the spec first.
2. **One phase at a time, one part at a time.** Phases come from `Build Plan Transorg Deck.md` section 1; each phase's parts are set out in its plan, from that phase's "Delivers" list.
3. **Plan first, then code.** Before a phase starts, Claude explains what will be done in it; coding starts only after approval.
4. **Phase exit = the phase's demo works**, and it is signed off. The manager sees demos when they want; they do not block.
5. **Part exit = the definition of done** from `Build Plan Transorg Deck.md` section 4: code merged with tests, screen states implemented, audit events written, the spec's acceptance line passing, the part marked Done in the tracker.
6. **Clean and simple code.** Plain solutions, small focused files, a tidy repo after every part.
7. **Dev matches prod.** Free and open-source tools, the same containers and config path everywhere, settings only through environment variables, real Postgres, migrations from day one, external systems behind interfaces so a live backend can be swapped in later.
8. **Client unknowns never block.** Open items run on the specs' assumed values (`Transorg Deck Visualization Master Spec.md` section 10).

---

## 2. Phase board

Phases, deliverables, exit demos and week estimates are from `Build Plan Transorg Deck.md` section 1 (estimates assume two human developers; use them to compare phases, not as a schedule).

| Phase | Name | Delivers | Est. weeks | Exit demo | Status | Signed off |
| --- | --- | --- | ---: | --- | --- | --- |
| P00 | Readiness | Repo, working rules, tool and access decisions (setup only, not in the specs) | – | Repo on GitHub holds the specs and rules; venv ready; decisions made | In progress | |
| P0 | Foundations | Repo, Docker Compose, Postgres schema, auth and roles, design tokens and shell, connector interfaces with simulated implementations, synthetic data generator v1, audit and notifications | 5 | Log in as each role, see the shell, see 24 loans from Snowflake in S02 | Not started | |
| P1 | Kickoff and intake | Cycle creation, calendar, kickoff wizard, mailbox, document pipeline (parse, classify A0, match, index), intake screen, completeness and chase (A8), Lincoln package share | 4 | Run Q1 to Q3 for Q3 2026 with the generator playing borrower emails | Not started | |
| P2 | Modelling and CMR | Spread service and metrics engine, Spreading Agent A1, S07, CMR service and editor S08, A2, Review Checker A3, review queue S09, filing to SharePoint, covenant checker A11 | 4.5 | Run Q4 to Q9 on Harbor: spread, CMR, three reviews, two filed versions | Not started | |
| P3 | Lincoln and tracker | Box watcher, A4 extractor, Lincoln exchange S05, Everest load, SharePoint copy, tracker service and S11, impact narrator A6, impact note | 2 | Run Q10 to Q13: Lincoln v1 lands, tracker shows -$3.95M, note sent | Not started | |
| P4 | Gate G1 | Pricing panel S10, cross-check calculator, Challenge Assistant A5, send-back note to Box, Lincoln v2 ingestion, mark block on the CMR | 2 | Run Q14 and Q15 on all three loans including the Harbor loop | Not started | |
| P5 | Committee | Rules engine with the agenda tests, agenda and pack S12, pack narrator, meeting screen S13 with decision capture, Ask TIQ A9 | 2 | Run Q16 to Q18: agenda, pack, decisions including Sunrise 88.5 | Not started | |
| P6 | Close | Reconciliation and S14 with A7, approvals S15 (G2, G3), OneDrive evidence, governance write-back, distribution S16, cycle close, lineage S21 | 2 | Run Q19 to Q22; show the lineage for Sunrise | Not started | |
| P7 | Monthly | Monthly cycle, update file from Snowflake inputs, S17, proposals and DDTL S18 with A10, consolidation, monthly approval S19 | 1.5 | Run M1 to M6 for October 2026 | Not started | |
| P8 | Hardening and evaluation | Admin S22, eval harness and sets, cost meter, performance and accessibility passes, demo rehearsal, documentation | 2.5 | Full end-to-end demo from a reset database in under 40 minutes | Not started | |

Status values: Not started, Planned (plan presented), In progress, Done.

---

## 3. Current phase: P00 Readiness

Not in the specs. It exists so P0 does not stall on missing access or open choices. **No product code is written in P00.** The live checklist is on the dashboard.

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 1 | Put the project under git and connect the manager's GitHub repo | Done | On top of the manager's initial commit |
| 2 | Specs and deck into `docs/specs`; README, `.gitignore`, `.gitattributes` | Done | |
| 3 | `CLAUDE.md`, `CONTRIBUTING.md`, `.env.example` | Done | D-12 |
| 4 | First commit and push to `main` | Done | Commit 86f6e59 |
| 5 | Python 3.12 virtual environment | Done | Python 3.12.10 from python.org; `.venv` with the standard `venv` module |
| 6 | Free disk space before P0 builds images | Waiting | 27 GB free |
| 7 | LLM: OpenAI gpt-4o-mini | Decided | D-10; key needed from P1 |
| 8 | Object store: MinIO built from official source | Decided | D-08 |
| 9 | Tracing: LangSmith free plan | Decided | D-06; key needed from P1 |
| 10 | Warehouse: Snowflake account | Waiting | Q-06; P0 can start on the DuckDB fallback |

---

## 4. Decisions log

Choices the specs leave open, or where we differ from them. Newest last.

| # | Date | Decision | Why | Status |
| --- | --- | --- | --- | --- |
| D-01 | 8 Oct 2026 | Replace the 00 to 06 document numbers with exact file names in all md files and the roadmap | File names did not match the specs' links | Done |
| D-02 | 8 Oct 2026 | Single track, one part at a time, while one person builds; every phase and part has an owner field so work can be assigned when teammates join | One builder today, a team later | Agreed |
| D-03 | 8 Oct 2026 | Add phase P00 Readiness before P0 | Access and choices must be settled before code | Agreed |
| D-04 | 8 Oct 2026 | Drop LlamaParse; Docling only | LlamaParse is paid | Proposed |
| D-05 | 8 Oct 2026 | Snowflake is the warehouse for the demo (the client works only on Snowflake); the spec's DuckDB fallback stays for offline development and tests, behind the same connector | Client requirement; DuckDB keeps work going without the account | Agreed |
| D-06 | 8 Oct 2026 | LangSmith free plan for tracing, switchable to Langfuse self-hosted by config if usage grows | Free plan (5,000 traces a month) covers demo development | Proposed |
| D-07 | 8 Oct 2026 | Scope is demo/POC for now; every demo-grade choice sits behind an interface or a setting so going live is a config change | User decision | Agreed |
| D-08 | 8 Oct 2026 | Keep MinIO as in the spec, built from MinIO's official source at the final community tag `RELEASE.2025-10-15T17-29-55Z`; never from third-party image mirrors | Official images were removed from Docker Hub and quay.io in September 2026; mirrors are an unknown source | Agreed |
| D-09 | 8 Oct 2026 | Deployment as in `Transorg Deck Visualization Master Spec.md` section 5.3: Docker Compose on the laptop; no tunnel for now | User decision | Agreed |
| D-10 | 8 Oct 2026 | LLM: gpt-4o-mini for both tiers to start; the heavy tier is re-checked in P2 against the 95 percent spreading target and switched by config if it misses | Already in use; models are configured by name | Agreed |
| D-11 | 8 Oct 2026 | Embeddings: OpenAI `text-embedding-3-small` | Costs pennies, same API key | Proposed |
| D-12 | 8 Oct 2026 | Build for a team: working rules live in the repo (`CLAUDE.md`, `CONTRIBUTING.md`), each member uses their own keys (`.env.example`), every part goes through its own branch and pull request, every log row names who did it | Teammates may join later | Agreed |
| D-13 | 8 Oct 2026 | Build only from the md specs and the process deck in `docs/specs/`; the feature roadmap Excel and everything outside this folder are not used | User decision | Agreed |

---

## 5. Open questions for the manager

| # | Question | Why it matters | Status |
| --- | --- | --- | --- |
| Q-01 | Which LLM provider and what monthly budget? | Spreading, CMR drafting and challenge need a strong model; free local models are weak on financial statements | Answered: OpenAI gpt-4o-mini (D-10) |
| Q-06 | Does TransOrg already have a Snowflake account we can use? If not, who creates the trial, on which work email, and who pays after the 30-day trial? | The account should belong to TransOrg, not a person; the trial ends after 30 days | Open |
| Q-02 | Can we get the six process walkthrough notes and the discovery questionnaire? | The specs were verified against them; needed if a number or rule looks wrong | Open |
| Q-03 | Delete the duplicate `Transorg Functional Spec (1).md`? | Two identical copies will drift apart | Open |
| Q-04 | `Transorg Functional Spec.md` still says "four tests" in two places; should it read "four client tests plus one TIQ test (`g1_unresolved`)"? | Verification report finding N4 | Open |
| Q-05 | Is the GitHub repo private, and who has access? | The specs are client material | Open |

Client open items are listed in `Transorg Deck Visualization Master Spec.md` section 10.

---

## 6. Change log

| Date | Change |
| --- | --- |
| 8 Oct 2026 | Tracker created; spec references renamed to file names (D-01) |
| 8 Oct 2026 | Tool and cost decisions D-05 to D-11 recorded; GitHub repo `transorg-engineering/private-credit-underwriting` confirmed reachable (holds only a README) |
