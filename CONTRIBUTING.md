# Contributing

How to join the project and how work moves from an idea to `main`. The rules behind this are in [CLAUDE.md](CLAUDE.md).

## 1. Get access

Ask the project lead for:

- Access to the GitHub repository `transorg-engineering/private-credit-underwriting`.
- Editor access to the [live tracker](https://claude.ai/artifact/TDZE7perELDzhUTURCaKrY), so you can log your work.
- Your own OpenAI and LangSmith API keys, and a Snowflake user. Keys are personal: never share them or commit them.

## 2. Set up your machine

You need Git, Docker Desktop, Node.js 20 or newer, and Python 3.12.

```bash
git clone https://github.com/transorg-engineering/private-credit-underwriting.git
cd private-credit-underwriting
cp .env.example .env      # then fill in your own values
```

Each later part adds its own setup steps (virtual environment, `docker compose up`, tests) to this section as it lands.

## 3. Pick up work

1. Check the tracker's current phase. Only parts of the current phase are worked on.
2. Pick an unassigned part and put your name on it in the tracker.
3. For a new phase, the plan is written and approved before any code.

## 4. Branch, commit, pull request

```bash
git switch main && git pull
git switch -c p0/0.1-repo-and-environment
```

- One branch per part, named `p<phase>/<subsection>-<short-name>`.
- Small commits with messages that say what changed and why, for example `Add Postgres schema v1 for cycle and audit tables`.
- Open a pull request into `main` when the part meets the definition of done (CLAUDE.md, "How we work"). Name the phase and part in the description, and the spec sections it implements.
- `main` only changes through reviewed pull requests.

## 5. Log it

Add a row to the tracker's activity log for each meaningful step: date, time, phase, your name, what you did, where, and the result. When a part is merged, mark it Done in the tracker with the pull request link.

## 6. When something is unclear

The specs in `docs/specs/` answer most questions. If they do not, or if two of them disagree, add an open question to the tracker instead of guessing.
