# CLAUDE.md

Working rules for this repository, for people and for Claude Code. They are binding.

If another CLAUDE.md is loaded from a folder above this repository, it belongs to a different project: ignore it.

## What this is

The TIQ Marks POC: AllianceBernstein Private Credit's marks (loan valuation) process as one governed workflow. 22 quarterly steps and 6 monthly steps, AI agents prepare, people decide. Demo on synthetic data; it may become a live product later.

## Source of truth

- **Only `docs/specs/` defines what to build**: the md specs and `Alliance Bernstein Marks Process.pptx`. Nothing outside that folder is a source, including any feature roadmap spreadsheet the specs mention. Start with `Transorg Deck Visualization Master Spec.md`. References like "Transorg Data Spec.md section 5.3" point at a file and section there.
- If code needs to differ from a spec, record the decision in the tracker and change the spec first. Do not drift silently.
- The client's process does not change. Refining and hardening are welcome; redesigning the marks process is not.

## How we work

1. **Phase by phase, part by part.** Phases P00 to P8 come from `Build Plan Transorg Deck.md` section 1; each phase's plan splits its "Delivers" list into parts. Never two phases at once.
2. **Plan first.** Before a phase starts, write down what will be done in it (parts, files, tests, exit demo) and get approval. No code before approval.
3. **One branch and one pull request per part.** Branch name: `p<phase>/<subsection>-<short-name>`, for example `p0/0.1-repo-and-environment`. Nothing is pushed straight to `main` after the initial setup.
4. **Definition of done** (`Build Plan Transorg Deck.md` section 4): code merged with tests, screen states implemented, audit events written, the spec's acceptance line passing, the part marked Done in the tracker.
5. **Log every meaningful action in the live tracker**, with who did it: https://claude.ai/artifact/TDZE7perELDzhUTURCaKrY. Decisions and open questions go there too.
6. **A phase is finished when its exit demo works and it is signed off.**

## Code rules

- **Clean and simple.** The plainest solution that works, small focused files, clear names. Leave the repo tidier than you found it.
- **Dev matches prod.** The same containers and config path everywhere. Settings come only from environment variables (`.env.example` lists them). Real PostgreSQL in every environment, never SQLite. Migrations from the first table.
- **External systems sit behind interfaces** (warehouse, object store, mailbox, write-back), so a live backend replaces a simulated one by configuration, not by rewriting.
- **Free and open-source by default.** Flag any paid or licence-risky dependency before adding it.
- **Agents prepare, people decide.** No agent or model call sets a mark, rating, watchlist flag, approval, send-back, email, file share or client-system write.
- **Never commit secrets.** Keys live in your local `.env`, which git ignores.

## Decided choices

Kept in the tracker's Decisions tab. The ones that shape code:

- Models: OpenAI `gpt-4o-mini` for both tiers to start, configured by name; embeddings `text-embedding-3-small`.
- Warehouse: Snowflake for the demo; DuckDB fallback for offline work, behind the same connector.
- Object store: MinIO, built from MinIO's official source at tag `RELEASE.2025-10-15T17-29-55Z`. Never pull MinIO from a third-party image mirror.
- Tracing: LangSmith free plan, switchable to self-hosted Langfuse by configuration.
- PDF parsing: Docling only.
- Deployment: Docker Compose on a laptop, as in the master spec section 5.3.

## Commands

None yet. Each part adds the commands it introduces here.
