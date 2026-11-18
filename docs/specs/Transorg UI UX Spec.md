# UI/UX Screens Specification

Every screen in ABIQ Marks, who uses it, what it shows, what the user can do there, and the states it must handle. The visual system is the TranspoRG enterprise design system (navy command rail, light canvas, white cards, one violet accent, fixed semantic colours). Only product-specific decisions are written here; the design system itself is the reference.

---

## 1. Foundations

### 1.1 Shell

Two-zone shell: a fixed 240px navy sidebar (`--navy-900`) and a `--canvas-100` content canvas with 24 to 32px padding and a 12-column grid with 24px gutters, max content width 1600px. Inter is the only typeface; numbers use tabular figures everywhere.

Sidebar, top to bottom: product wordmark "ABIQ Marks" with the descriptor "AllianceBernstein Private Credit" in `--slate-400`; a **cycle switcher** (current cycle name, day counter "Day 27 of 45", phase chip) that sets the context for every screen; primary navigation (role dependent, section 2); a divider; secondary navigation (Ask ABIQ, Lineage, Reports, Admin); the user row at the bottom (initials avatar, name, role).

Page header: page title (24px/700), subtitle (14px, `--slate-400`), right side context controls (cycle, deal team filter, period) and the one primary action for the screen in `--brand-600`. A small sparkle icon next to the title marks AI-assisted screens (S04, S07, S08, S09, S10, S11, S12, S13, S14, S17, S18, S20).

### 1.2 Status language (fixed)

| Meaning | Chip | Token |
| --- | --- | --- |
| Done, approved, passed, clean, final | green | `--success-100` / `--success-700` |
| Waiting, in review, in progress, proposed by AI | amber | `--warn-100` / `--warn-700` |
| Overdue, sent back, mismatch, failed, breached covenant | red | `--danger-100` / `--danger-700` |
| Informational: not started, on agenda, version, assumed rule | blue or neutral | `--info-100` / `--info-600`, or `--canvas-100` / `--slate-500` |
| Confirmed rule | green outline chip "Confirmed" | |
| Assumed rule | amber outline chip "Assumed" with a tooltip naming the discovery question | |

Gates use a lock icon: closed (grey) until the step is reachable, open (violet) when actionable, passed (green check with approver and date).

### 1.3 Recurring components

| Component | Behaviour |
| --- | --- |
| **AI suggestion card** | `--brand-50` wash, sparkle icon, title "ABIQ suggests", body, evidence links, confidence ring, three actions: Accept, Edit, Reject. Status chip after a decision (accepted, edited, rejected, with who and when). Never pre-fills a gate decision |
| **Evidence viewer** | Split pane: the page image with the cited cell or sentence highlighted on the left, the ABIQ field on the right; keyboard navigation between evidence items; "no evidence" shows a grey chip |
| **Version strip** | Horizontal list of versions (v1, v2, ...) with who, when and a diff toggle |
| **Gate decision panel** | Fixed layout: what is being decided, the inputs (read-only), the decision options as radio buttons (none pre-selected), reason category, free text, evidence attachments, the "Decide" primary button with a confirmation dialog that repeats the decision in words |
| **Loop badge** | Small circle with the loop letter and a counter, for example "QA x1" |
| **Day timeline** | 45-day horizontal timeline with phases, today's marker, deadlines as ticks, overdue in red |
| **Loan board** | Kanban-style columns per step group with loan cards (borrower, team, mark chips, loop badges, overdue flag). Between Q3 and G1 the board has two swimlanes, Deal Team track (Intake, Spread, CMR, Review, Agreed) and Lincoln track (Package shared, Drafting, Marks received, Loaded), and a loan card appears in both; from G1 onward a single lane (G1, Agenda, Decided, Reconciled, Final). The card's status chip shows the track that is furthest behind |
| **Numbers table** | Right-aligned tabular numbers, positive green with an up arrow, negative red with a down arrow, marks to two decimals, values in $M to three decimals where the source does (for example 22.125) |
| **Audit drawer** | Right-side drawer on any entity listing its audit events with before and after values |

### 1.4 States every screen defines

Loading (skeleton cards), empty (muted icon, one line, one action), error (plain message, retry), permission denied (what role is needed), stale (a newer version exists: amber banner with "refresh"), running (an agent run in progress: progress strip with step count and a cancel button).

## 2. Navigation by role

| Role | Primary navigation |
| --- | --- |
| PM Team | Cycle Dashboard (S01), Loan Universe (S02), Kickoff (S03), Intake (S04), Lincoln Exchange (S05), Loans (S06), Review Queue (S09), Marks Tracker (S11), Committee (S12), Reconciliation (S14), Approvals (S15), Distribution (S16), Monthly (S17) |
| Deal Team analyst and lead | My Loans (S06 filtered to the team), Intake (S04, team view), Review Queue (S09, their reviews), Pricing Panel (S10), Monthly Proposals (S18) |
| A/C Manager | Review Queue (S09, A/C Manager stage), Loans (read) |
| SCT reviewer | Review Queue (S09, SCT stage), Loans (read) |
| Lincoln | Lincoln Exchange (S05, external mode only) |
| Committee member | Committee (S12 read, S13), Marks Tracker (S11 read), Loans (read) |
| Committee chair | as member plus Approvals (S15) |
| Governance Panel | Approvals (S15 governance tab), Lineage (S21) |
| Finance / IR | Distribution inbox (S16 recipient view), Marks Tracker (S11 read, final only) |
| Admin | Admin (S22) plus everything read-only |
| Everyone | Ask ABIQ (S20 side panel), Lineage (S21) for loans they can see |

## 3. Screen index

| ID | Screen | Steps | Primary roles |
| --- | --- | --- | --- |
| S01 | Cycle Dashboard | all | PM Team, leadership |
| S02 | Loan Universe | Q1 | PM Team |
| S03 | Kickoff Wizard | Q1 | PM Team |
| S04 | Intake Inbox and Documents | Q2 | PM Team, Deal Team |
| S05 | Lincoln Exchange | Q3, Q10, Q11, Q12, Q13 | PM Team, Lincoln |
| S06 | Loan Workspace | Q4 to Q15 | Deal Team, PM Team |
| S07 | Spreading Review | Q4 | Deal Team analyst |
| S08 | CMR Editor | Q5, Q8, Q15 | Deal Team analyst |
| S09 | Review Queue | Q6, Q7, Q8 (file action), Q9 | A/C Manager, PM Team, SCT |
| S10 | Pricing Panel (G1) | Q12 (read), Q14 | Deal Team |
| S11 | Marks Tracker | Q11, Q14, Q16, Q19 | PM Team |
| S12 | Committee Agenda and Pack | Q16, Q17 | PM Team |
| S13 | Committee Meeting | Q18 | Committee |
| S14 | Reconciliation | Q19 | PM Team |
| S15 | Approvals and Governance | Q20, Q21, M6 (request) | Chair, Governance, PM Team |
| S16 | Distribution | Q22 | PM Team, recipients |
| S17 | Monthly Dashboard | M1, M2, M5 | PM Team |
| S18 | Monthly Proposals and DDTL | M3, M4 | Deal Team |
| S19 | Monthly Approval | M6 (decision) | Committee |
| S20 | Ask ABIQ | all | everyone |
| S21 | Mark Lineage and Audit | all | everyone (scoped) |
| S22 | Admin | n/a | Admin |

## 4. Screen specifications

### S01 Cycle Dashboard

- **Purpose:** one glance at where the cycle is.
- **Layout:** KPI strip (5 cards): Day of cycle (31 of 45), Loans in cycle (24), Gates passed (G1 24 of 24), Portfolio value so far ($114.75M, delta -$3.05M in red), Open tasks overdue (3 in red). Below: the day timeline (full width). Then 2/3 + 1/3: the loan board on the left; on the right "Needs attention" (overdue tasks, send-backs, mismatches, stale packs) and "Loops fired" (QA 1, QB 2, QC 3, QD 0, QE 0, QF 0).
- **Utilities:** filters by deal team and phase; click a loan card to open S06; click a timeline phase to filter; "Move clock" (demo only) to set the cycle day; export the board as PDF.
- **Data:** `valuation_cycle`, `cycle_loan`, `task`, `marks_tracker_row`.
- **Acceptance:** With the demo at Day 31, Harbor shows at "G1 approved 88.0" with "QA x1", Sunrise at "G1 approved 89.0", Maple at "G1 approved 99.25".

### S02 Loan Universe

- **Purpose:** the facilities read from DealCloud, Everest and Sentry for the period.
- **Layout:** table: facility, borrower, sponsor, deal team, type, commitment, funded, coupon, maturity, previous mark, previous rating, watchlist, CMR type, in scope (toggle; revolvers off by default). Side card: source freshness ("DealCloud via Snowflake, synced 02:00", "Sentry as of 30 Sep").
- **Utilities:** refresh from Snowflake; mark a loan out of scope with a reason; add a late facility; export.
- **Acceptance:** 26 facilities from 22 borrowers, 2 revolvers out of scope, 24 in scope, each with an owner.

### S03 Kickoff Wizard

- **Purpose:** create the cycle and send the kickoff (Q1).
- **Steps (stepper):** 1 Period and day 0; 2 Calendar (editable dates per phase and step, each with an Assumed chip); 3 Loan universe (from S02, must have zero unowned loans); 4 Deal team ownership confirmation; 5 Email preview per team (editable text, attachments: the calendar PDF); 6 Send (confirmation dialog listing recipients).
- **Acceptance:** sending creates tasks and deadlines; S04 shows the sent emails.

### S04 Intake Inbox and Documents

- **Purpose:** every inbound email and document for the cycle; completeness per loan (Q2).
- **Layout:** left list of loans with a completeness chip (complete, incomplete with count, late); centre: the selected loan's documents (type chip with confidence, period, pages, status) and the email thread; right: AI suggestion cards for low-confidence classifications and the chase reminder drafts (A8) with Send.
- **Utilities:** drag a document to another loan; confirm or change a classification; mark a package complete with a note; "Share with Lincoln" shortcut to S05; unmatched emails queue; upload a document manually.
- **States:** parsing in progress (document card skeleton), parse failed (red chip, "open file" still works).
- **Acceptance:** Harbor shows four documents classified correctly with the waiver request raised as a task; the late borrower shows red "late, 3 days".

### S05 Lincoln Exchange

- **Purpose:** everything that goes to or comes from Lincoln (Q3, Q10, Q12, Q13).
- **Internal mode layout:** table per loan: package status (shared v1 on Day 9), Lincoln report (received, version, date), marks (point, range, yield, version), discrepancy flag, loaded to Everest (yes or no), copied to SharePoint (yes or stale), send-back notes (count). Side panel: the Box folder tree and the extraction exceptions queue (A4) with "match to loan" and "reject".
- **Actions:** share package (confirmation lists files), bulk load to Everest (confirmation), bulk copy to SharePoint, open the Lincoln report in the evidence viewer.
- **External (Lincoln) mode:** only their folder: packages to value, upload report and marks file, read send-back notes; no internal data.
- **Acceptance:** dropping Lincoln's v1 files creates 24 valuation rows; Harbor's v2 shows as a second version with "revised after send-back".

### S06 Loan Workspace

- **Purpose:** the hub for one loan in one cycle.
- **Layout:** header card: borrower, facility, team, commitment, previous mark, current mark chips (Lincoln, Deal Team, Committee, Final), rating, watchlist, covenant chip (pass or breached), loop badges, step status. Tabs: Overview (timeline of this loan's steps with who and when), Documents, Spread (S07), CMR (S08), Reviews, Pricing (S10), Decisions, Lineage (S21), Audit drawer.
- **Acceptance:** Harbor's header shows "Covenant breached 3.75x vs 3.50x" in red before the equity and the G1 panel shows net leverage 3.4x after.

### S07 Spreading Review

- **Purpose:** review the Spreading Agent's proposal and approve the spread (Q4).
- **Layout:** three columns. Left: document pages (thumbnails, page viewer with highlighted evidence). Centre: the template grid (rows: template lines; columns: current quarter, prior quarter, same quarter last year, LTM computed; cells show value, unit, confidence ring; low confidence under 0.7 amber, no evidence grey, edited cells with a pencil mark and reason). Right: add-backs panel (proposed adjustments with the footnote quote, allow-list chip, accept or reject), metrics panel (adjusted EBITDA, LTM EBITDA, debt, net debt, leverage, net leverage, interest cover, each with the formula on hover), covenant tests (pass or fail with headroom), the covenant certificate check (A11) finding, and "Diff vs last quarter".
- **Actions:** accept all above a confidence (default 0.9); edit a cell (reason required); request a re-run with instructions (opens a text box that becomes the next message to the agent); approve the spread (confirmation: "Approve spread v1 for Harbor Logistics Q3 2026; 18 lines, 1 add-back; this writes the model to Everest"); view the agent trajectory (trace link, admin and analyst).
- **States:** agent running (progress "reading table 3 of 7"), partial (list of not-found lines at the top), failed.
- **Acceptance:** on the Harbor package the grid shows revenue 41.0, reported EBITDA 4.1, severance 0.3, adjusted EBITDA 4.4, cash 1.4, debt 60.0; metrics show LTM adjusted EBITDA 16.0, leverage 3.75x, covenant fail, interest cover 2.6x.

### S08 CMR Editor

- **Purpose:** write the CMR with AI drafts, set the recommendation, submit (Q5), see the mark block (Q15).
- **Layout:** left: section navigator with status per section (empty, AI draft, edited, final) and the review comment count; centre: the editor for the selected section (markdown, citations as chips linking to the evidence viewer, flagged sentences underlined amber with the reason); right: the recommendation form (rating with previous shown, watchlist action, waiver with conditions, expected mark direction, rationale) with the AI suggestion card above it; evidence list with tick boxes; the Review Checker (A3) findings; the version strip.
- **Actions:** "Draft with ABIQ" per section or all; accept, edit, reject per section (kept-sentence ratio recorded silently); attach evidence; submit for review (runs A3; warnings must be acknowledged); re-file after SCT comments; export PDF.
- **Mark block (read-only, after Q15):** Q3 mark, Lincoln range, approved by, approval date, committee mark and rationale after Q18.
- **Acceptance:** Harbor's draft mentions the lost 22 percent customer, the covenant breach, the $5M Northgate commitment, the trucks and the two replacement contracts, each with a citation; submitting without the equity letter attached raises the A3 finding.

### S09 Review Queue

- **Purpose:** reviews by stage (Q6, Q7, Q9).
- **Layout:** left: queue of CMRs awaiting my stage with due dates; centre: the CMR read view with inline comment anchors per section; right: the checklist (items with pass, fail, needs review, the A3 reason and evidence), the comment composer, the decision (Pass or Send back with comments), and the loop counter for this CMR.
- **Rules:** a failed checklist item needs a comment before Pass; Send back requires at least one comment; the analyst sees the thread in S08.
- **Acceptance:** the PM stage on Harbor v1 shows "evidence_attached: fail, sponsor letter referenced but not attached" and "truck appraisal date missing" as a needs-review item after the reviewer adds it; SCT on v2 passes with one comment.

### S10 Pricing Panel (Gate G1)

- **Purpose:** approve or send back Lincoln's mark (Q14).
- **Layout:** header: loan, previous mark, Lincoln version strip (v1, v2 side by side when both exist). Left card "Lincoln": point, range (as a bar from range low to high with the point marker), required yield, methodology, key assumptions (quotes). Centre card "What the Deal Team knows": CMR recommendation and direction, covenant status, key metrics, sponsor support, with the A5 Challenge Assistant card listing differences (assumption quote, finding, evidence, math, materiality) and the draft send-back note. Right: the indicative cross-check calculator (coupon, years to maturity, required yield slider, indicative price; labelled "indicative, not a mark") and the gate decision panel.
- **Decision panel:** three outcomes, none pre-selected: Approve (mark = Lincoln point); Approve at a different mark (Assumed chip; the mark field and a mandatory rationale appear; a warning shows when the mark is outside Lincoln's range, because that puts the loan on the committee agenda); Send back (reason category, note pre-filled only if the user clicks "use ABIQ's draft", evidence attachments). Co-decision by the lead optional (configurable); confirmation dialog. When the committee has sent the loan back (loop QF), the committee's note is shown above the panel.
- **After send-back:** status "waiting on Lincoln, loop QA x1", the note visible, v2 appears when received, the tracker and impact note update on approval.
- **Acceptance:** Harbor: A5 lists the sponsor equity difference with the 55 / 16 = 3.4x math; sending back writes the Box note; approving v2 at 88.0 updates S11 to -$3.05M.

### S11 Marks Tracker

- **Purpose:** the scoreboard (Q11, Q14, Q16, Q19).
- **Layout:** KPI strip: previous portfolio value, current value, delta (red or green), loans with draft marks, loans on agenda. Table with the client's columns: borrower, facility, team, funded amount, previous mark, Lincoln draft, range, Deal Team mark, committee mark, final mark, previous value, current value, delta, previous rating, rating, watchlist, waiver, status, agenda flags. Right panel: the impact summary draft (A6) with version, recipients (Wes and Justin), Send; the history of sent versions.
- **Utilities:** column chooser; filter by status, team, agenda; export to Excel (same columns); drill into a loan; "recompute" (always safe, the tracker is derived).
- **Acceptance:** after Lincoln v1 the three demo rows show 39.70, 51.90, 22.25 and the portfolio delta -3.95; after Harbor v2 approval -3.05; after the committee -3.175 pending reconciliation.

### S12 Committee Agenda and Pack

- **Purpose:** agenda tests and the pack (Q16, Q17).
- **Layout:** top: five test columns, the client's four with Assumed chips and the rule values ("10 percent", "Lincoln range") and a fifth, `g1_unresolved`, marked "ABIQ addition, assumed"; table of loans with a tick grid and the On agenda chip, reasons; manual add or remove with reason. Below: the pack builder: cover note (editable), per-loan one-pagers (A6 drafts, editable), attachments list (CMR version, Lincoln report version, tracker export), "Build pack", preview PDF, "Send to committee" (confirmation lists recipients), stale banner if a source changed after the build.
- **Acceptance:** Maple off, Harbor on (watchlist, downgrade), Sunrise on (watchlist, move 11.25 percent); Harbor's one-pager carries proposed 88.0, old 97, 3 to 5, new to watchlist, waiver requested.

### S13 Committee Meeting

- **Purpose:** run the meeting and record decisions (Q18).
- **Layout:** left: agenda list with status (pending, decided, deferred); centre: the selected loan's one-pager, links to the CMR and Lincoln report in the evidence viewer, the questions the pack raises (from A6), and the discussion notes box; right: the gate decision panel for G2: outcome (approve, change, send back, defer, request information), decided mark (pre-filled with the proposed mark only after the user chooses Approve), rating, watchlist, waiver decision with conditions, rationale (mandatory for change, send back, defer), members present, Record decision. Ask ABIQ (S20) docked on this screen.
- **Acceptance:** recording Sunrise as change to 88.5 without a rationale is blocked; with the rationale it shows "Decided 88.5, inside Lincoln range 87.5 to 90.5"; recording send back to the Deal Team sets the loan to sent back with loop QF x1 and it reappears in S10.

### S14 Reconciliation

- **Purpose:** make every record agree (Q19).
- **Layout:** top: run summary (checks run, matches, mismatches, status) and "Run reconciliation". Table of items: loan, check, field, source A value, source B value, status chip, the A7 explanation, resolution action (correct Everest, correct tracker, explain) and Resolve. Side: the final marks schedule preview that becomes the approval request once the run is clean.
- **Acceptance:** the Sunrise mark mismatch appears with values 88.5 and 89.0 and the explanation; resolving with "correct Everest" writes through the adapter and the re-run is clean; the schedule totals $114.625M.

### S15 Approvals and Governance

- **Purpose:** written approval (G2, Q20), governance sign-off (G3, Q21), monthly approval (M6).
- **Tabs:** Final marks approval: the schedule table, changes since the committee (Sunrise 89.0 to 88.5), the request email preview, Send request, the chair's decision panel (Approve or Reject with comments), the evidence bundle link in OneDrive once approved. Governance: the schedule, the approval evidence, the sign-off panel (Sign off or Return with reasons), the Everest write status. Monthly: the consolidated monthly file and the Send request action for the PM Team; the committee's per-loan decisions are recorded on S19 and summarised here.
- **Acceptance:** G2 and G3 show approver, timestamp and evidence path; returning at G3 reopens reconciliation with the reasons.

### S16 Distribution

- **Purpose:** send the final CMRs (Q22) and let recipients find them.
- **Layout:** recipient groups (Finance, Investor Relations, Deal Teams) with members, the documents per group, Send, the sent log. Recipient view: a simple list of received bundles with download.
- **Acceptance:** after sending, the cycle shows Closed with the final value; recipient view works for a Finance user.

### S17 Monthly Dashboard

- **Purpose:** M1, M2 and M5.
- **Layout:** KPI strip (loans, proposals received, outstanding, DDTL rebalances pending); the update file table (loan, current mark, pacing status, Sigma trend, watchlist notes count, completeness); actions: Build update file, Email deal teams (preview per team), Chase (A8 drafts), Consolidate, Send to committee (opens S15 monthly tab).
- **Acceptance:** the two DDTL facilities show "rebalance pending" until M4 is confirmed.

### S18 Monthly Proposals and DDTL

- **Purpose:** M3 and M4 for a deal team.
- **Layout:** list of the team's loans; per loan: signals panel (last quarter's final mark and Lincoln range, pacing, Sigma trend, watchlist notes), the proposal form (proposed mark, rationale with the A10 draft after the mark is entered, evidence), Submit. DDTL tab: commitment, drawn before, draws this month (from Sentry), funded after, unfunded after, mark applied to (Assumed chip), Confirm.
- **Acceptance:** A10 drafts a rationale only after the analyst enters a mark; the DDTL numbers add up.

### S19 Monthly Approval

- **Purpose:** the committee approves monthly marks (M6).
- **Layout:** consolidated table (opened from the request sent on S15); per loan Approve or Push back with rationale; Approve all remaining; the approval record.
- **Acceptance:** a push-back returns the loan to the team in S18 with the rationale.

### S20 Ask ABIQ

- **Purpose:** questions over the cycle with citations.
- **Layout:** right-side panel on every screen (and a full page): conversation, suggested questions for the current screen ("Why is Harbor on the agenda?"), answers with a citations block (document page, CMR section, decision record) that open the evidence viewer, "ABIQ cannot take actions" footer.
- **Acceptance:** "What changed in Harbor's valuation and why?" returns 86.5 to 88.0, the sponsor equity, the send-back date and the approver, with citations.

### S21 Mark Lineage and Audit

- **Purpose:** trace a final mark back to everything (all steps).
- **Layout:** vertical lineage: documents (with classification and who confirmed) → spread versions (agent proposal, edits, approver) → CMR versions and reviews → Lincoln versions and send-back notes → G1 decision → agenda tests → committee decision → reconciliation items → written approval → governance sign-off → distribution. Each node shows who, when, loop badges and opens the entity. Filter by entity type; export CSV; the audit drawer for raw events.
- **Acceptance:** Sunrise's lineage shows the committee change and the Everest correction as two distinct nodes with different actors.

### S22 Admin

- **Tabs:** Rules (every `rule_config` key with value, Confirmed or Assumed chip, the discovery question, version history, edit with reason); Calendar templates; Email templates; Connectors (health per connector, last sync, write-back mode, the "changes to apply in Everest" queue when in queue mode); Synthetic data (generate, load, play to a step, reset, with a log); Users and roles; Agents (model names per tier, limits, prompt versions, trace links, cost meter per cycle and per loan); Evaluation (the eval sets, last results per component, ablation table, failing trajectories list).
- **Acceptance:** changing `agenda.mark_move_threshold` to 0.12 re-runs the tests on demand and Sunrise (11.25 percent) drops off test 3 while staying on the agenda through the watchlist.

## 5. Interaction rules specific to ABIQ Marks

- A gate decision is never pre-selected and always confirmed in words ("You are approving Lincoln's mark of 88.0 for Harbor Logistics as the Deal Team mark").
- AI drafts are visually distinct (`--brand-50` wash, sparkle) until accepted; after acceptance they look like user content with a small "from ABIQ draft, edited" caption.
- Every number shows its origin on hover (source table or document page, as-of date, who edited).
- Assumed chips are present wherever a rule is applied, not only in Admin.
- Destructive actions do not exist; "supersede" and "reopen" require a reason.
- Keyboard: J and K move between loans in queues and boards; E opens the evidence viewer; Esc closes drawers.
- Motion within the design system's limits; agent progress uses a determinate strip when the step count is known.

## 6. Screen to feature map

Feature ids are from the roadmap workbook; every screen has at least one feature, and the shared components (F-019, F-021) are used by all of them.

| Screen | Features that build it |
| --- | --- |
| S01 Cycle Dashboard | F-029 (plus F-026 demo clock) |
| S02 Loan Universe | F-024 |
| S03 Kickoff Wizard | F-028 |
| S04 Intake Inbox and Documents | F-036 (plus F-031, F-032, F-034, F-035, F-037) |
| S05 Lincoln Exchange | F-040 (package part), F-059 (Lincoln part), F-060 (external mode), F-061, F-062 (plus F-039 share, F-058 extraction queue) |
| S06 Loan Workspace | F-056 |
| S07 Spreading Review | F-045 (plus F-043, F-044, F-046) |
| S08 CMR Editor | F-050 (plus F-049, F-051, F-073) |
| S09 Review Queue | F-054 (plus F-052, F-053, F-055) |
| S10 Pricing Panel | F-070 (plus F-067, F-068, F-069, F-071) |
| S11 Marks Tracker | F-064 (plus F-063, F-065) |
| S12 Committee Agenda and Pack | F-079 (plus F-075, F-076, F-077, F-078) |
| S13 Committee Meeting | F-083 (plus F-082) |
| S14 Reconciliation | F-086 (plus F-084, F-085) |
| S15 Approvals and Governance | F-089 (plus F-087, F-088; F-098 adds the monthly request) |
| S16 Distribution | F-090 |
| S17 Monthly Dashboard | F-094 (plus F-093) |
| S18 Monthly Proposals and DDTL | F-097 (plus F-095, F-096) |
| S19 Monthly Approval | F-098 |
| S20 Ask ABIQ | F-081 (plus F-080) |
| S21 Mark Lineage and Audit | F-091 |
| S22 Admin | F-100, F-101, F-102, F-103, F-104, F-106 (plus F-007 rule config, F-017 loaders) |
