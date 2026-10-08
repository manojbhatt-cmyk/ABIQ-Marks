# private-credit-underwriting

**TIQ Marks POC**: one governed workflow for AllianceBernstein Private Credit's monthly and quarterly marks (loan valuation) process, with AI agents doing the preparation and people making every decision. Built by TransOrg on synthetic data.

## Status

Planning is complete; the build has not started. Progress, the activity log, decisions and open questions are in the [live tracker](https://claude.ai/artifact/TDZE7perELDzhUTURCaKrY) and summarised in [TRACKER.md](TRACKER.md).

## Where to start

| Read | For |
| --- | --- |
| [docs/specs/Transorg Deck Visualization Master Spec.md](docs/specs/Transorg%20Deck%20Visualization%20Master%20Spec.md) | The entry document: goal, scope, architecture, roles, glossary |
| [docs/specs/](docs/specs/) | The full specification set this project is built from |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setting up your machine and how work flows |
| [CLAUDE.md](CLAUDE.md) | The working rules (read by people and by Claude Code) |

## Stack (from the specs)

Python 3.12, FastAPI, SQLAlchemy, LangGraph, PostgreSQL 16 with pgvector, MinIO, Snowflake (DuckDB fallback for offline work), React 18 with TypeScript and Vite. Everything runs with Docker Compose.
