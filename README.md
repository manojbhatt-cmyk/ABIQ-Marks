# private-credit-underwriting

**TIQ Marks POC**: one governed workflow for AllianceBernstein Private Credit's monthly and quarterly marks (loan valuation) process, with AI agents doing the preparation and people making every decision. Built by TransOrg on synthetic data.

## Status

First full build on branch `p0/0.0-full-poc-build`: all 22 quarterly steps and 6 monthly steps run end to end from a reset, through screens S01 to S22, with the three gates, the rework loops, the audit trail and the evaluation harness. Deviations from the specs are recorded in [docs/decisions.md](docs/decisions.md).

From a reset, `synth play` reproduces the Master Spec demo: Harbor spread to 3.75x against a 3.50x covenant, sent back once at G1 with the 55 / 16 = 3.4x challenge, approved at 88.0; Sunrise changed to 88.5 by the committee; reconciliation finds exactly the Sunrise mismatch; the story loans close at **$114.625M** (from $117.80M, **-$3.175M**).

## Run it

Prerequisites: Docker Desktop, Python 3.12, Node.js 20+.

```bash
cp .env.example .env                                  # fill in values; WAREHOUSE=duckdb works offline
docker compose -f infra/docker-compose.yml up -d postgres
py -3.12 -m venv .venv && .venv/Scripts/python.exe -m pip install -e ".[dev]"
.venv/Scripts/python.exe -m synth.cli reset --until Q0        # load the warehouse, seed users and rules
.venv/Scripts/python.exe -m uvicorn api.main:app --port 8000  # API on :8000
cd apps/web && npm install && npm run dev                     # web on :5173
```

Sign in at http://localhost:5173 as any demo user (password `demo`), for example `pm.analyst@ab-poc.local` (PM Team), `team.blue.lead@ab-poc.local` (Harbor's Deal Team lead), `vc.chair@ab-poc.local`, `governance@ab-poc.local`, `admin@ab-poc.local`.

Play the story to any step from Admin, Synthetic data, or from the command line:

```bash
.venv/Scripts/python.exe -m synth.cli reset --until Q14   # Q1..Q22, M1..M6
.venv/Scripts/python.exe -m synth.cli play --until Q22    # continue forward
```

Load Snowflake instead of DuckDB (the trial account; never from tests):

```bash
.venv/Scripts/python.exe -m synth.cli load --target snowflake [--reset-account]
# then set WAREHOUSE=snowflake in .env
```

`--reset-account` drops every other user database in the account first.

## Tests and evaluation

```bash
.venv/Scripts/python.exe -m pytest -q        # unit tests plus the full story on Postgres tiq_test and DuckDB
```

Admin, Evaluation runs the eval harness: spreading accuracy against the generator's ground truth (97.6 percent; the misses are the scanned pack, by design), classification, agenda agreement, reconciliation, the Harbor challenge case, kept-sentence ratio, cost per loan and agent decisions (zero).

## Layout

| Path | What |
| --- | --- |
| `apps/api` | FastAPI: auth with roles, REST for every screen |
| `apps/web` | React, TypeScript, Vite, Tailwind with the TransOrg tokens; screens S01 to S22 |
| `packages/domain` | SQLAlchemy models (Data Spec section 5), services per process step, metrics engine, CMR renderer |
| `packages/connectors` | Snowflake and DuckDB warehouse, object stores, simulated Outlook, write-back adapter |
| `packages/pipeline` | Document parsing |
| `packages/agents` | A0 to A11 and the run and suggestion records |
| `packages/synth` | Synthetic data: schemas, portfolio, documents, loaders, playback |
| `packages/evals` | Evaluation harness |
| `infra` | Docker Compose, Dockerfiles, Snowflake DDL |

## Where to start

| Read | For |
| --- | --- |
| [docs/specs/Transorg Deck Visualization Master Spec.md](docs/specs/Transorg%20Deck%20Visualization%20Master%20Spec.md) | The entry document: goal, scope, architecture, roles, glossary |
| [docs/decisions.md](docs/decisions.md) | Where the build differs from the specs, and why |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setting up your machine and how work flows |
| [CLAUDE.md](CLAUDE.md) | The working rules (read by people and by Claude Code) |
