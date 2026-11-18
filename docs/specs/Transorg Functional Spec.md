# Process and Functional Specification

Every step of the monthly and quarterly marks process, as the client runs it today and as the POC runs it. Each step has the same shape: a process table (input, owner, action, data, system, output, next owner, exception), what ABIQ does at that step, where AI assists and what the person still does, the audit events written, and acceptance criteria.

Cross references: screens **S01 to S22** are specified in Transorg UI UX Spec.md; agents **A0 to A11** in Agentic AI Spec - Transorg Deck.md; entities and fields in Transorg Data Spec.md; connectors in document 03.

---

## 0. Process rules that apply everywhere

| Rule | Detail |
| --- | --- |
| Cycle calendar | A quarterly cycle starts on Day 1 after quarter end and must finish by Day 45. The sample calendar from the process map is the default: Phase 1 Days 1 to 9, Phase 2 Days 10 to 26, Phase 3 Days 18 to 30 (assumed: the notes put Lincoln's own work on Days 18 to 20, in parallel with Phase 2, and the sample calendar starts Phase 3 on Day 26; ABIQ interpolates Q10 to Q13 processing onto Days 26 to 30 and spans both so that loop QC re-drafts have a home), Phase 4 Days 27 to 31, Phase 5 Days 36 to 43, Phase 6 Days 44 to 45. Every date is editable at kickoff and flagged `assumed`. |
| Status model per loan | Each loan in a cycle carries `current_step` and a status: `not_started`, `in_progress`, `waiting_on_borrower`, `waiting_on_lincoln`, `in_review`, `sent_back`, `approved` (G1 passed), `on_agenda`, `decided`, `deferred`, `reconciled` (set at Q19 when the loan's checks are clean), `final` (set at Q21 when governance signs). Monthly loans use `not_started`, `requested`, `proposed`, `pushed_back`, `monthly_final`. Between Q3 and Q14 a loan has two track statuses, `deal_team_track_status` (Q4 to Q9) and `lincoln_track_status` (Q10 to Q13); the loan's `status` and `current_step` are derived from whichever track is furthest behind, and the Cycle Dashboard (S01) shows both tracks as two swimlanes until G1. |
| Parallel tracks | After Q3, the Deal Team track (Q4 to Q9) and the Lincoln track (Q10 to Q13) run at the same time. Q14 needs both the filed CMR (Q8, with Q9 comments resolved) and Lincoln's draft mark (Q12). |
| Gates | G1 (Q14) Deal Team approves or sends back Lincoln's mark. G2 (Q18 decision, Q20 written approval) Valuation Committee. G3 (Q21) Governance Panel. A gate is passed only by a user with the right role, with a reason or rationale where required, and is logged. |
| Loops | QA: Q14 back to Q10. QB: Q7 back to Q4+5 (also Q6 back to Q4+5 and Q9 back to Q4+5 in practice). QC: Q11 back to Q10 whenever Lincoln re-drafts. QD: Q20 back to Q19. QE: Q21 back to Q19. QF (assumed, DQ18): Q18 back to Q14 (committee sends a loan back to the Deal Team) or back to Q10 (back to Lincoln); the loan re-enters S10 with the committee's note and returns to the agenda when re-approved. MA: M2 back to M1. MB: M5 back to M3 and M4. MC: M6 back to M3. Every loop increments a counter on the loan and is visible on S21. |
| Versions | Spreads, CMRs, Lincoln valuations, tracker rows and decisions are versioned. Nothing is overwritten; the current version is the latest accepted one. |
| Audit | Every create, update, decision, send and file action writes an `audit_event` with actor, role, timestamp, entity, before and after, evidence references and the agent run id if an agent contributed. |
| Chips | Rules flagged `assumed` show an amber "Assumed" chip wherever they are applied (agenda tests, deadlines, checklist items). |
| Agent output | Every agent suggestion is an `agent_suggestion` record with status `proposed`, `accepted`, `edited`, `rejected`. Acceptance is a user action. No agent or model call writes a mark, rating, watchlist flag, approval, decision, send-back, email send, file share or Everest write; those exist only as user actions behind role checks. Code may apply high-confidence classifications (A0) and extractions (A4) automatically because they are reversible, logged with their confidence, and confirmed by a person below the threshold. |

---

## Part A: Quarterly process, 22 steps

### Phase 1: Kickoff and intake (Days 1 to 9)

#### Q1 Kickoff email

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Quarter end date; active loan and deal list | `DEALCLOUD.DEAL`, `DEALCLOUD.FACILITY`, deal team assignments from Snowflake; cycle template |
| Owner | PM Team | PM Team |
| Action | Pull the active list from DealCloud, write the kickoff email with every deadline, send to deal teams | Kickoff wizard (S03): confirm the loan universe, set the calendar, confirm deal team ownership, preview and send |
| Data | Loan list, deal team owners, deadlines: financials due, CMR due, Lincoln timeline, SCT review dates, committee date, final sign-off date | `valuation_cycle`, `cycle_loan`, `deadline`, `email_message` |
| System | DealCloud, Outlook | Snowflake read, simulated Outlook send |
| Output | Kickoff email received by every deal team; the clock is running | Cycle created with status `open`; one email per deal team with its loans and dates; per-loan tasks created |
| Next owner | Deal Teams and Borrowers | Same |
| Exception | Loans missing a deal team owner; new facilities booked after the list was pulled | Wizard blocks on unowned loans; "late additions" action adds a loan mid-cycle with its own dates |

**ABIQ behaviour**
1. Cycle creation: `POST /cycles` with type `quarterly`, period `2026-Q3`, day 0 = quarter end. The service copies the calendar template and computes every deadline date.
2. Loan universe: reads active facilities as of day 0 (Transorg Data Spec.md section 2.6), joins deal team assignments, previous quarter's final mark and risk rating, watchlist flag, and Sentry funded amount.
3. Email generation: one email per deal team from a template (Transorg Data Spec.md section 3.5) listing their loans, the CMR type per loan (assumed: `standard` or `watchlist`), and every date. The PM Team edits the text before sending.
4. Send: through the mailbox connector; the sent message is stored and linked to the cycle.
5. Tasks: for each loan, tasks are created for Q2 (borrower package due), Q4+5 (CMR due), Q10 (Lincoln due), Q14 (G1 due) with owners and due dates, which drive the Cycle Dashboard and the Chaser.

**AI assist:** none required. The email is a template. Optional: A8 Chaser drafts reminder emails later from the same template.

**Audit:** `cycle.created`, `cycle.calendar_set` (with assumed flags), `email.sent` (kickoff).

**Acceptance:** A PM user can create the Q3 2026 cycle, see 24 loans with owners, adjust one deadline, send the kickoff, and see the sent email in each deal team's inbox view (S04).

#### Q2 Deal teams get borrower financials

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Kickoff deadlines | Open tasks per loan |
| Owner | Borrower (sends), Deal Team (receives) | Same; PM Team monitors |
| Action | Borrower emails its quarterly package; the deal team receives it in Outlook | Inbound emails land in the intake inbox (S04), attachments are classified and attached to the right loan and period, completeness is checked |
| Data | Financial statements, covenant certificate, supporting documents, sponsor or equity letters, waiver requests | `document` with `doc_type`, `period`, `borrower_id`, `facility_id`, classification confidence; `email_message` |
| System | Outlook | Simulated Outlook inbox, document pipeline (Ingestion Integration Spec - Transorg.md section 3) |
| Output | Package available to the deal team | Package marked `complete` or `incomplete` with the missing items listed |
| Next owner | PM Team (Q3) and Deal Team (Q4) | Same |
| Exception | Late, missing or inconsistent documents; waiver requests inside the package | Chase rules fire reminders; a waiver request is flagged as a task for the CMR |

**ABIQ behaviour**
1. Email pipeline (Ingestion Integration Spec - Transorg.md section 4): every inbound email is matched to a borrower by sender domain and subject, else queued for manual matching.
2. Document pipeline: each attachment is parsed, classified into one of `financial_statements`, `covenant_certificate`, `supporting`, `sponsor_letter`, `waiver_request`, `other`, and tagged with the reporting period found in the document.
3. Completeness: the required set per loan is configurable (assumed: financial statements and covenant certificate required; sponsor letter required when the CMR type is `watchlist`). Missing items create a `waiting_on_borrower` status.
4. Chase: the Chaser (A8) proposes reminder emails at configurable intervals (assumed: 3 days before due, on the due date, every 2 days after); the PM Team or Deal Team sends them.
5. Harbor's package in the demo contains the financial statements, covenant certificate, a sponsor letter from Northgate Capital committing $5M, and a waiver request for the leverage covenant.

**AI assist:** A4-style extraction is not used here; classification uses the cheaper model with structured output (Agentic AI Spec - Transorg Deck.md section 6.1, A0 Document Classifier). The person confirms low-confidence classifications in S04.

**Audit:** `email.received`, `document.classified` (with confidence and whether confirmed), `package.completeness_changed`, `email.sent` (chase).

**Acceptance:** When the generator drops Harbor's four documents into the inbox, S04 shows them under Harbor Logistics, Q3 2026, classified correctly, with the waiver request raised as a CMR task. A borrower that sends only financial statements shows `incomplete: covenant certificate missing`.

#### Q3 Financials to Lincoln

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Complete borrower package | Package with status `complete` |
| Owner | PM Team | PM Team |
| Action | Download the files from email, upload to the Box folder shared with Lincoln | One action "Share with Lincoln" per loan or in bulk (S05): copies the package to the `box` bucket under the cycle folder, records what was shared |
| Data | The documents, plus the previous mark, facility details and the CMR type | `lincoln_package` with document list, manifest and share timestamp |
| System | Box | Simulated Box (object store) |
| Output | Lincoln has the same package as the Deal Team | Manifest visible to Lincoln in its portal view (S05 Lincoln mode) |
| Next owner | Lincoln (Q10) | Same |
| Exception | Package shared then updated by the borrower | Re-share creates manifest version 2 and notifies Lincoln |

**ABIQ behaviour:** Sharing is a side effect to an external party, so it needs a confirmation dialog listing exactly which files go out. The manifest is a JSON file written alongside the documents in Box (Transorg Data Spec.md section 3.2).

**AI assist:** none.

**Audit:** `lincoln_package.shared` with the manifest hash.

**Acceptance:** After sharing, the `box` bucket contains `2026-Q3/harbor-logistics/package-v1/` with the four documents and `manifest.json`; S05 shows "Shared on Day 9".

### Phase 2: Modelling and CMR (Days 10 to 26)

#### Q4+5 Model and CMR commentary (the process map counts these as one step; the POC splits them into Q4 spreading and Q5 CMR drafting)

**Q4 Spreading**

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Borrower financial statements in the borrower's own format | Parsed document with tables and page images |
| Owner | Deal Team analyst | Deal Team analyst, with the Spreading Agent (A1) |
| Action | Re-key the numbers into the Everest standard template; decide add-backs; compute LTM metrics; run covenant tests | The agent proposes a full spread with evidence per line; the analyst reviews cell by cell in S07, accepts or corrects, and approves the spread |
| Data | Template lines (revenue, cost lines, EBITDA, adjustments, cash, debt, interest), periods (quarter and LTM), units and currency | `financial_spread`, `spread_line_item`, `adjustment`, `metric`, `covenant_test` (Transorg Data Spec.md section 5.3) |
| System | Everest | ABIQ spread service; write-back of the approved spread to `EVEREST.SPREAD_MODEL` through the adapter |
| Output | Standard model for the period with metrics and covenant results | Approved spread version with evidence and confidence; metrics: quarterly adjusted EBITDA, LTM adjusted EBITDA, debt, net debt, cash, leverage, interest cover, covenant pass or fail with headroom |
| Next owner | Deal Team (Q5) | Same |
| Exception | Unusual formats, scanned pages, missing periods, disputed add-backs | Low-confidence cells are highlighted; add-backs outside the allow-list are flagged; the analyst can request a re-run with instructions |

**ABIQ behaviour**
1. Trigger: when the package is complete, the analyst clicks "Spread with ABIQ" (or the service auto-queues the run and the analyst reviews when ready; configurable).
2. The agent (Agentic AI Spec - Transorg Deck.md section 6, A1) reads the parsed tables, maps borrower line items to template lines, extracts quarterly and LTM values, proposes add-backs with the reason found in the notes, and writes a draft spread with per-cell evidence (document id, page, table, cell) and confidence.
3. The metrics engine (plain code) computes: adjusted EBITDA = reported operating profit before depreciation plus accepted add-backs; LTM = sum of the last four quarters (prior quarters from the previous approved spreads); leverage = total debt divided by LTM adjusted EBITDA; net leverage = (debt minus cash) divided by LTM adjusted EBITDA; interest cover = LTM adjusted EBITDA divided by yearly interest. Covenant tests compare each metric with the covenant definition on the facility.
4. The analyst reviews in S07: source page on the left, template on the right, a confidence chip per cell, a diff against last quarter. Accepting the spread creates version n and writes the audit trail per cell that changed from the agent's proposal.
5. Harbor demo values: freight revenue plus fuel income $41M (was $48M), operating profit before depreciation $4.1M (was $7.2M), severance add-back $0.3M, adjusted quarterly EBITDA $4.4M, cash $1.4M, term loan $60M, LTM adjusted EBITDA $16M, yearly interest $6.2M, leverage 3.75x, covenant maximum 3.50x (breached), interest cover 2.6x.

**AI assist:** A1 Spreading Agent (agent, tool loop). Person: reviews every line, decides add-backs, approves. The agent cannot approve.

**Audit:** `agent_run.completed` (A1), `spread.proposed`, `spread.cell_edited` (per cell), `spread.approved`, `everest.spread_written` (adapter).

**Acceptance:** On the synthetic Harbor package, the agent's proposal matches the generator's ground truth on at least 95 percent of template lines, flags the severance add-back with the footnote as evidence, and the computed leverage is 3.75x with the covenant shown as breached.

**Q5 CMR commentary**

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Approved spread, prior quarter CMR, borrower package, covenant results, sponsor letters, waiver requests | Same, all linked to the loan in ABIQ |
| Owner | Deal Team analyst | Deal Team analyst, with the CMR Drafting Assistant (A2) |
| Action | Write the CMR: what happened, financial performance, risks, mitigants, recommendation (risk rating, watchlist, waiver), expected mark direction | CMR editor (S08) with AI-drafted sections the analyst edits; structured fields for the recommendation |
| Data | CMR sections and fields (Transorg Data Spec.md section 5.4) | `cmr`, `cmr_section`, `cmr_recommendation` |
| System | Everest | ABIQ CMR service; write-back to `EVEREST.CMR` on filing (Q8) |
| Output | Draft CMR version 1 | Same, status `draft` |
| Next owner | A/C Manager (Q6) | Same |
| Exception | Missing evidence for a claim; recommendation inconsistent with metrics | Review Checker (A3) pre-flags before submission |

**ABIQ behaviour**
1. CMR type is set at kickoff (`standard` or `watchlist`, assumed). The template has fixed sections: Summary of the quarter, Financial performance (auto-table from the spread), Covenants and liquidity, Risks, Mitigants, Sponsor and collateral, Recommendation, Expected mark direction, Evidence list.
2. A2 drafts every narrative section from the spread, the prior CMR, the documents and the covenant results, with a citation per sentence where one exists. The financial performance table is generated by code from the spread.
3. The recommendation block is structured: proposed risk rating (1 to 5), watchlist add or keep or remove, waiver request with conditions, expected mark direction (down, flat, up). A2 may suggest values with reasons; the analyst sets them.
4. Evidence: every attached document is listed; the analyst ticks which ones support the recommendation.
5. Harbor demo: largest customer (22 percent of revenue) lost, revenue down 15 percent, EBITDA down 43 percent, leverage 3.75x breaching 3.50x, interest cover 2.6x still adequate; mitigants: Northgate Capital $5M equity, 180 trucks and roughly $38M collateral, 40 driver positions cut, two replacement contracts in discussion; recommendation: rating 3 to 5, add to watchlist, waiver if the $5M arrives, mark expected down.

**AI assist:** A2 CMR Drafting Assistant (chain with structured output). A3 Review Checker runs on "Submit for review". Person: writes and owns the CMR, sets the recommendation.

**Audit:** `agent_run.completed` (A2), `cmr.section_drafted`, `cmr.edited`, `cmr.recommendation_set`, `cmr.submitted`.

**Acceptance:** The analyst can accept, edit or reject each drafted section; the kept-sentence ratio is logged; submitting a CMR with a recommendation that contradicts the metrics (for example rating unchanged with a breached covenant) shows an A3 warning that the analyst must acknowledge.

#### Q6 Draft to A/C Manager

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Draft CMR | CMR version with status `in_review`, stage `ac_manager` |
| Owner | A/C Manager | Same |
| Action | Read, comment, send back or pass on | Review queue (S09): checklist, inline comments on sections, decision |
| Data | Comments, decision | `cmr_review` (stage, reviewer, comments, outcome) |
| System | Everest, email | ABIQ review service, notification |
| Output | Either comments back to the analyst or CMR passed to the PM Team | Same |
| Next owner | Deal Team (if sent back) or PM Team (Q7) | Same |
| Exception | Loop QB-type: changes needed | Loop counter increments; the analyst sees the comments in S08 and resubmits |

**ABIQ behaviour:** Stage order is configurable (assumed: A/C Manager, PM Team, file, SCT). Each stage has its own checklist (Transorg Data Spec.md section 8). Harbor demo comment: "Looks good. Attach the $5M equity letter." The analyst attaches it and resubmits.

**AI assist:** A3 Review Checker pre-populates checklist findings for the reviewer (for example "Sponsor letter referenced in Mitigants but not attached"). The reviewer decides.

**Audit:** `cmr.review_started`, `cmr.review_comment`, `cmr.review_outcome` (`passed` or `sent_back`).

**Acceptance:** Sending back returns the CMR to the analyst with the comment thread; passing moves it to the PM Team stage; both are visible on the loan timeline.

#### Q7 PM Team review and comments

| Field | Today | In the POC |
| --- | --- | --- |
| Input | CMR passed by the A/C Manager | Same, stage `pm_team` |
| Owner | PM Team | Same |
| Action | Apply the PM checklist: ratios on LTM, add-backs allowed, recommendation consistent with the numbers, evidence attached | S09 with the PM checklist and A3 findings |
| Data | Checklist results, comments | `cmr_review` |
| System | Everest, email | ABIQ |
| Output | Comments back or CMR passed | Same |
| Next owner | Deal Team or PM Team (Q8) | Same |
| Exception | **Loop QB** (Q7 back to Q4+5) | Counter, comments, resubmission |

**Harbor demo:** two findings, "Attach the $5M equity letter" and "State when the truck appraisal was done"; Team Blue fixes both.

**AI assist:** A3 computes the four checklist items automatically where it can (LTM check from the spread, add-backs against the allow-list, evidence presence) and drafts the finding text. The PM reviewer confirms.

**Audit:** as Q6 with stage `pm_team`.

**Acceptance:** The checklist shows pass, fail or needs-review per item with the evidence; a fail cannot be passed without a comment.

#### Q8 Pull CMR (file to SharePoint)

| Field | Today | In the POC |
| --- | --- | --- |
| Input | CMR passed by the PM Team | Same |
| Owner | PM Team | Same |
| Action | Export the CMR from Everest as PDF, save to the SharePoint quarter folder | "File CMR" action: renders the CMR to PDF, writes it to the `sharepoint` bucket at `PrivateCredit/Valuation/2026-Q3/CMRs/<borrower>-<facility>-v<n>.pdf`, writes the CMR to the Everest schema through the adapter |
| Data | PDF, path, version | `cmr_file` |
| System | Everest, SharePoint | Simulated SharePoint, write-back adapter |
| Output | Filed CMR version | Same, status `filed` |
| Next owner | SCT (Q9) | Same |
| Exception | Re-filing after SCT comments | New version, old version kept |

**AI assist:** none.

**Audit:** `cmr.filed` with path and hash, `everest.cmr_written`.

**Acceptance:** The PDF exists at the SharePoint path with the right name, opens, and shows the version and the review history on its last page.

#### Q9 SCT review

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Filed CMR | Same, stage `sct` |
| Owner | SCT (senior credit team) | Same |
| Action | Senior review on the kickoff dates; comments | S09, stage `sct` |
| Data | Comments, outcome | `cmr_review` |
| System | SharePoint, email | ABIQ |
| Output | Agreed CMR, or one more change and re-file | Same |
| Next owner | Deal Team (Q14) once Lincoln's mark is in | Same |
| Exception | Change requested after filing | Analyst edits, PM re-files (Q8), version increments |

**Harbor demo:** SCT agrees with the downgrade and waiver conditions, asks for one sentence on customer concentration; the analyst adds it and the CMR is re-filed as version 2.

**AI assist:** A3 as before.

**Audit:** as Q6 with stage `sct`; `cmr.filed` v2.

**Acceptance:** The loan's CMR status becomes `agreed` only after SCT passes it; S01 shows the Deal Team track complete for that loan.

### Phase 3: Lincoln draft marks (Days 18 to 30, in parallel with Phase 2)

#### Q10 Lincoln drafts marks

| Field | Today | In the POC |
| --- | --- | --- |
| Input | The package in Box | Same, plus any send-back note from Q14 |
| Owner | Lincoln | Lincoln (external) |
| Action | Independent valuation: required yield, price, reasonable range, point estimate; written report | Lincoln uploads its report PDF and its marks spreadsheet to the Box exchange folder (S05 Lincoln mode or the generator in the demo) |
| Data | Per loan: point estimate, range low and high, required yield, methodology notes, valuation date, version | `lincoln_valuation` (Transorg Data Spec.md section 5.5) |
| System | Lincoln's own tools, Box | Simulated Box |
| Output | Lincoln report and marks file in Box, "every few days" as drafts update | Files detected by the Box watcher |
| Next owner | PM Team (Q11) | Same |
| Exception | **Loop QC**: Lincoln re-drafts before approval | Each upload is a new `lincoln_valuation` version; the tracker shows the latest and the history |

**Demo values:** Maple point 99.25 range 98.75 to 99.75; Harbor point 86.5 range 85.0 to 88.0, required yield 16.5 percent; Sunrise point 89.0 range 87.5 to 90.5. After the Q14 send-back, Harbor revised: point 88.0, range 86.5 to 89.5, required yield 15.5 percent.

**AI assist:** none at Lincoln. ABIQ offers the Deal Team an indicative cross-check later (Q14).

**Audit:** `lincoln_valuation.received` (file hashes, version).

**Acceptance:** Dropping Lincoln's files in Box creates version 1 for every loan in the file within one minute (watcher interval configurable).

#### Q11 Into marks tracker

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Lincoln's marks file | `lincoln_valuation` records extracted from the file |
| Owner | PM Team | PM Team |
| Action | Re-key Lincoln's point and range into the Excel tracker; compute old value, new value, change; send an early impact update to the finance leads | A4 extracts the values; the tracker service fills `draft_mark`, `range_low`, `range_high`, computes values; A6 drafts the early impact note; the PM reviews and sends |
| Data | Old mark, draft mark, funded amount, old value, new value, delta | `marks_tracker_row` |
| System | Excel, Outlook | ABIQ tracker (S11), simulated Outlook |
| Output | Tracker updated; early revenue and NAV impact note to Wes and Justin | Same, note stored as `impact_summary` v1 |
| Next owner | PM Team (Q12), Deal Team (Q14) | Same |
| Exception | Lincoln's file has a loan ABIQ does not know, or a value outside 0 to 100 | Extraction exceptions queue in S05 for the PM to match or reject |

**Demo arithmetic:** Harbor old value $60M × 97 percent = $58.2M, new $60M × 86.5 percent = $51.9M, delta -$6.3M. Maple +$0.1M, Sunrise +$2.25M, portfolio -$3.95M. After the Harbor revision to 88.0: -$3.05M, an improvement of $0.90M.

**AI assist:** A4 Lincoln Output Extractor (LLM extraction with structured output, validated by code against the loan universe). A6 Impact Narrator drafts the note. Person: confirms exceptions, sends the note.

**Audit:** `tracker.draft_mark_set` (source: lincoln version id), `impact_summary.drafted`, `impact_summary.sent`.

**Acceptance:** The tracker shows the three demo loans with the exact old and new values above and a portfolio delta of -$3.95M; the impact note names the three drivers.

#### Q12 Lincoln saves PDFs (report into Box, marks into Everest)

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Lincoln's report and marks | Same |
| Owner | Lincoln (report), PM Team (loading marks into Everest) | PM Team confirms |
| Action | Report stays in Box; the marks spreadsheet is loaded into the Everest pricing panel so it shows Lincoln draft and range per loan | "Load to Everest" action writes `EVEREST.PRICING_PANEL` rows through the adapter |
| Data | Pricing panel row: Lincoln draft, range, version, date | `EVEREST.PRICING_PANEL` |
| System | Box, Everest | Simulated Box, write-back adapter |
| Output | Pricing panel populated | Same |
| Next owner | PM Team (Q13) | Same |
| Exception | Mismatch between the report PDF and the spreadsheet | A4 cross-checks the two and raises a discrepancy |

**AI assist:** A4 (report vs spreadsheet consistency).

**Audit:** `everest.pricing_panel_written`.

**Acceptance:** S10 (pricing panel) shows Lincoln's draft and range for every loan with the version and date.

#### Q13 Copy to SharePoint

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Lincoln PDFs in Box | Same |
| Owner | PM Team | PM Team |
| Action | Copy Lincoln's reports from Box into the SharePoint quarter folder so AllianceBernstein has its own official copy | "Copy to SharePoint" action, per loan or bulk, to `PrivateCredit/Valuation/2026-Q3/Lincoln/` |
| Data | File copy with version | `document` with `store = sharepoint` |
| System | Box, SharePoint | Simulated |
| Output | Internal copy exists | Same |
| Next owner | Deal Team (Q14) | Same |
| Exception | A newer Lincoln version arrives after the copy | Copy marked stale; re-copy prompted |

**AI assist:** none.

**Audit:** `document.copied`.

**Acceptance:** Each Lincoln report appears in both buckets with the same hash.

### Phase 4: Deal Team approval (Days 27 to 31)

#### Q14 Deal Team approves or sends back (Gate G1)

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Lincoln draft mark and range in the pricing panel; the agreed CMR | Same, in one screen (S10) |
| Owner | Deal Team (analyst and A/C Manager) | Same |
| Action | In the Everest pricing panel: approve, or send back with the reason and the new information Lincoln should consider | S10: side by side Lincoln's valuation and the CMR facts; A5 Challenge Assistant lists where Lincoln's assumptions differ from the CMR; the team approves or sends back with a note and evidence |
| Data | Decision, reason, evidence documents, the challenge note | `valuation_decision` (Transorg Data Spec.md section 5.6) |
| System | Everest pricing panel, email to Lincoln | ABIQ, write-back to `EVEREST.PRICING_PANEL.DEAL_TEAM_STATUS` and `DEAL_TEAM_MARK`, send-back note written to Box for Lincoln |
| Output | Approved mark, or a send-back that restarts Lincoln's work for that loan | Same |
| Next owner | Deal Team (Q15) if approved; Lincoln (Q10) if sent back | Same |
| Exception | **Loop QA** (Q14 to Q10). Repeated disagreement | Loop counter; after `g1.max_send_back_loops` cycles (assumed 3) the fifth agenda test `g1_unresolved` fires so the loan reaches the committee with "unresolved disagreement" |

**ABIQ behaviour**
1. S10 shows per loan: previous mark, Lincoln point and range, required yield, Lincoln's assumption notes, the CMR recommendation and expected direction, and the indicative cross-check: a transparent yield-to-price calculator (coupon, maturity, required yield) labelled "indicative, not a mark".
2. A5 compares Lincoln's stated assumptions with the CMR and the documents and lists differences with evidence, for example "Lincoln's report does not mention the $5M sponsor equity committed in the Northgate letter dated 6 October; debt net of the equity would be $55M and net leverage 55 / 16 = 3.4x, inside the 3.50x covenant." The note follows the source's convention of netting the equity against debt and not also netting cash; the `covenant_math` tool reports both figures with labels (Agentic AI Spec - Transorg Deck.md section 13.2).
3. Decision form, three outcomes: Approve (the Deal Team mark equals Lincoln's point and the loan status becomes `approved`); Approve at a different mark (assumed, DQ15 and DQ18: the Deal Team records its own mark with a mandatory rationale, which is what makes agenda test 4 possible); Send back with reason category (new information, factual error, methodology question, other), free text, and attached evidence. The send-back note is written to Lincoln's Box folder and emailed. Nothing is pre-selected.
4. When Lincoln's revision arrives (Q10 loop), S10 shows version 1 and version 2 side by side.

**Demo:** Maple approved at 99.25. Sunrise approved at 89.0. Harbor sent back (sponsor equity not fully reflected); Lincoln revises to 88.0 with range 86.5 to 89.5 and yield 15.5 percent; Team Blue approves 88.0 on Day 31. The tracker and the impact note update (-$3.05M).

**AI assist:** A5 Challenge Assistant (agent, read-only tools over the CMR, documents and the Lincoln report). Person: decides. The cross-check is plain code.

**Audit:** `valuation_decision.approved`, `.approved_different_mark` (with the mark and rationale) or `.sent_back` (with reason, evidence, loop number), `everest.pricing_panel_status_written`, `lincoln_note.shared`.

**Acceptance:** On Harbor, A5's note cites the sponsor letter and the net leverage recalculation; the send-back creates a Box note Lincoln can see; after the revision, approving 88.0 updates the tracker to -$3.05M.

#### Q15 Attach the approved mark to the CMR

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Approved mark | `valuation_decision.approved` |
| Owner | Deal Team | Deal Team (automatic on approval, confirmed by the analyst) |
| Action | Write the approved mark, Lincoln range, approver and date into the CMR in Everest | The CMR gets a "Mark" block: Q3 mark 88.0, Lincoln range 86.5 to 89.5, approved by Team Blue, Day 31; CMR version increments and is re-filed |
| Data | Mark block | `cmr.mark_block` |
| System | Everest | ABIQ, adapter |
| Output | CMR with the number and the explanation together | Same |
| Next owner | PM Team (Q16) | Same |
| Exception | Committee later changes the mark (Q18) | Mark block updated again at Q19 with the committee mark and rationale |

**AI assist:** none.

**Audit:** `cmr.mark_attached`, `cmr.filed` (new version).

**Acceptance:** Opening Harbor's CMR PDF shows the mark block on page 1.

### Phase 5: Valuation Committee (Days 36 to 43)

#### Q16 Build the committee agenda

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Tracker with Deal Team approved marks, risk ratings, watchlist flags, Lincoln ranges | Same |
| Owner | PM Team | PM Team |
| Action | Apply the four tests to every loan; any yes puts the loan on the agenda | Rules engine runs the four client tests plus ABIQ's fifth test `g1_unresolved` (S12); the PM can add or remove a loan with a reason |
| Data | Test results per loan, agenda | `agenda_test_result`, `committee_agenda` |
| System | Excel | ABIQ rules engine |
| Output | Agenda list with the reason per loan | Same |
| Next owner | PM Team (Q17) | Same |
| Exception | Discretionary additions (assumed allowed) | Manual add with reason, logged |

**The four tests (all flagged assumed until confirmed):** 1 on the watchlist; 2 risk rating downgraded this cycle; 3 mark moved 10 percent or more either way versus the previous final mark; 4 mark outside Lincoln's range. Demo: Maple none (off), Harbor watchlist and downgrade (on), Sunrise watchlist and 11.25 percent move (on). Test 4 is defined on the Deal Team mark versus Lincoln's latest range; it can only fire when the Deal Team approved at a different mark (Q14) and the mark is outside the range. A fifth test, `g1_unresolved` (assumed), fires when loop QA reached `g1.max_send_back_loops`.

**AI assist:** none for the tests. A6 can draft a one-line reason per agenda loan from the test results.

**Audit:** `agenda.tests_run` (with rule versions), `agenda.loan_added` or `.removed` (manual, with reason).

**Acceptance:** Unit tests cover every test on boundary values (exactly 10 percent, exactly on the range edge); the demo produces the expected agenda.

#### Q17 Email the committee (committee pack)

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Agenda, CMRs, Lincoln reports, tracker | Same |
| Owner | PM Team | PM Team |
| Action | Assemble the pack per agenda loan (CMR, Lincoln report, proposed mark, old mark, rating change, watchlist status, waiver), attach the tracker, email the committee | "Build pack" (S12): generates a cover note, a one-page summary per loan (A6), bundles the PDFs, and emails the committee; the pack is also visible in S13 |
| Data | Pack contents and versions | `committee_pack` |
| System | Outlook | Simulated Outlook, object store |
| Output | Pack received by the committee | Same |
| Next owner | Valuation Committee (Q18) | Same |
| Exception | A CMR version changes after the pack is sent | Pack marked stale with a re-send prompt |

**AI assist:** A6 Impact and Pack Narrator drafts the per-loan one-pager (facts only, every number from the tracker and CMR). Person: edits and sends.

**Audit:** `committee_pack.built` (version, contents hashes), `email.sent`.

**Acceptance:** Harbor's one-pager shows proposed 88.0, old 97, rating 3 to 5, new to watchlist, waiver requested; Sunrise's shows proposed 89.0, old 80, rating 5, remains on watchlist.

#### Q18 Committee call on the agenda (Gate G2, decision)

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Pack | Same, in S13 |
| Owner | Valuation Committee, with the Deal Teams present | Same |
| Action | Discuss each agenda loan; decide the mark, rating, watchlist, waiver; record rationale | Meeting view (S13): per loan, the pack, the discussion questions, a decision form with outcome (approve, change, send back, defer, request information), final mark, rating, watchlist, conditions, rationale (mandatory for change or send back) |
| Data | Decision per loan | `committee_decision` (Transorg Data Spec.md section 5.7) |
| System | Meeting, notes | ABIQ |
| Output | Committee marks for agenda loans; non-agenda loans keep the Deal Team mark | Same |
| Next owner | PM Team (Q19) | Same |
| Exception | **Loop QF** (assumed): send back to the Deal Team (re-enter Q14) or to Lincoln (re-enter Q10); defer to a later meeting | Loan status `sent_back` with the owner and the committee note shown on S10, loop counter QF incremented; or `deferred` with the date |

**Demo:** Harbor: 88.0 approved, rating 5, stay on watchlist, waiver approved under the stated conditions (the $5M was received on 30 October). Sunrise: proposed 89.0, decided 88.5 (recovery is improving, but the supermarket contract is three months old with a six-month termination clause); 88.5 is inside Lincoln's 87.5 to 90.5 range.

**AI assist:** A9 Ask ABIQ can answer factual questions over the pack during the meeting ("what is Sunrise's contract termination clause?"). Person: decides. No agent proposes a committee mark.

**Audit:** `committee_decision.recorded` (outcome, values, rationale, members present).

**Acceptance:** A decision with outcome `change` cannot be saved without a rationale; the tracker shows `committee_mark` 88.5 for Sunrise and the agenda shows both loans `decided`.

### Phase 6: Finalise and distribute (Days 44 to 45)

#### Q19 Finalise marks (reconciliation)

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Committee decisions, tracker, Everest pricing panel, CMR risk ratings, Sentry funded amounts | Same |
| Owner | PM Team | PM Team |
| Action | Compare the tracker with the Everest pricing panel; the Everest risk ratings with the CMR ratings; funded amounts with Sentry; fix mismatches | Reconciliation run (S14): code compares every pair, lists mismatches with both values, the PM resolves each (correct the target through the adapter, or mark as explained) |
| Data | Reconciliation items | `reconciliation_run`, `reconciliation_item` |
| System | Excel, Everest, Sentry | ABIQ, Snowflake read, adapter write |
| Output | Every record agrees; final marks schedule | Run status `clean`; `final_mark` set per loan; loan status `reconciled` |
| Next owner | PM Team (Q20) | Same |
| Exception | **Loops QD and QE** return here | Re-run after changes |

**Demo:** Sunrise: tracker 88.5, committee 88.5, Everest 89.0: mismatch found; the PM corrects Everest to 88.5 through the adapter; re-run is clean.

**AI assist:** A7 Reconciliation Explainer drafts the likely cause for each mismatch from the audit trail ("Everest still holds the Deal Team approved mark; the committee change on Day 42 was not loaded"). Person: resolves.

**Audit:** `reconciliation.run`, `reconciliation.item_resolved` (action, before, after), `everest.pricing_panel_written`.

**Acceptance:** The seeded Sunrise mismatch is found and no false mismatch is reported on the other 23 loans; after correction the run is clean and the final schedule totals $114.625M.

#### Q20 Final email to the committee (Gate G2, written approval)

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Clean reconciliation, final marks schedule | Same |
| Owner | PM Team (requests), Committee Chair (approves) | Same |
| Action | Email "Q3 2026 final marks for approval" with the schedule and any changes (Sunrise 89.0 to 88.5); the chair replies "Approved"; the analyst saves the email and the reply to OneDrive | S15: generate the approval request, send; the chair approves in ABIQ (which also sends the email reply); ABIQ saves the request and reply as a PDF bundle to the `onedrive` bucket |
| Data | Approval request, approval, evidence file | `approval_request`, `approval`, `document (store = onedrive)` |
| System | Outlook, OneDrive | Simulated |
| Output | Written approval with evidence | Same |
| Next owner | Governance Panel (Q21) | Same |
| Exception | **Loop QD**: the chair does not approve the listed changes | Status `rejected` with comments; back to Q19 |

**AI assist:** none (template email).

**Audit:** `approval_request.sent`, `approval.recorded` (approver, timestamp, evidence path), `document.saved` (onedrive).

**Acceptance:** The OneDrive bucket contains `Approvals/2026-Q3/final-marks-approval.pdf` with both messages; S15 shows "Approved by [chair] on Day 44".

#### Q21 Governance panel sign-off (Gate G3)

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Written approval | Same |
| Owner | Governance Panel | Same |
| Action | Record in Everest what was approved, who approved it, when | S15 governance tab: the panel reviews the schedule and evidence, signs off; ABIQ writes `EVEREST.GOVERNANCE_SIGNOFF` through the adapter |
| Data | Sign-off record | `governance_signoff` |
| System | Everest | ABIQ, adapter |
| Output | Audit trail complete | Same; every loan's status becomes `final` |
| Next owner | PM Team (Q22) | Same |
| Exception | **Loop QE**: the panel does not sign | Status `returned` with reasons; back to Q19 |

**AI assist:** none.

**Audit:** `governance_signoff.recorded`, `everest.governance_written`.

**Acceptance:** S21 (lineage) for Sunrise shows the full chain: documents, spread v1, CMR v1 to v3, Lincoln v1, G1 approve 89.0, committee 88.5 with rationale, reconciliation fix, written approval, governance sign-off.

#### Q22 Pull CMRs and distribute

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Final CMRs with approved marks | Same |
| Owner | PM Team | PM Team |
| Action | Export the final CMRs from Everest and send to Finance (NAV), Investor Relations and the Deal Teams | S16: distribution list per recipient group, bundle, send, log |
| Data | Distribution record | `distribution` |
| System | Everest, Outlook | ABIQ, simulated Outlook |
| Output | Quarter closed on Day 44 | Cycle status `closed`; final portfolio value shown |
| Next owner | None | None |
| Exception | Late correction after distribution | Re-open with reason, re-distribute, both logged |

**AI assist:** none.

**Audit:** `distribution.sent`, `cycle.closed`.

**Acceptance:** Finance, IR and each deal team inbox view shows the bundle; the cycle dashboard shows closed with $114.625M and -$3.175M.

---

## Part B: Monthly process, 6 steps

The monthly cycle updates marks between quarters without Lincoln. The source for the monthly steps is the AllianceBernstein process map; the loops MA to MC are implied, not drawn, and are flagged assumed.

#### M1 Create the monthly marks update file

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Pacing file, Sigma dashboard, watchlist call notes | `FINANCE.PACING_FILE` and `SIGMA.PORTFOLIO_SNAPSHOT` views in Snowflake, watchlist call notes entered or uploaded |
| Owner | PM Team | PM Team |
| Action | Build the update file listing every loan with its current mark and the inputs | S17: monthly cycle created; update file built by code from the sources; the PM reviews |
| Data | Per loan: current mark, pacing inputs, Sigma metrics, watchlist notes | `monthly_update_row` |
| System | Excel, Sigma | ABIQ |
| Output | Monthly update file | Same, version 1 |
| Next owner | PM Team (M2) | Same |
| Exception | **Loop MA**: gaps flagged by deal teams send the file back for update | Version 2 |

**AI assist:** A0 classifier tags uploaded watchlist call notes to loans; none otherwise.

**Audit:** `cycle.created` (monthly), `monthly_update_file.built` (version, sources and as-of dates), `watchlist_note.uploaded`.

**Acceptance:** For October 2026 the update file lists 24 loans with the current mark from the September Sigma snapshot, pacing status from the pacing file, and the two uploaded call notes attached to the right loans; the two DDTL facilities show "rebalance pending".

#### M2 Email deal teams

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Update file | Same |
| Owner | PM Team | PM Team |
| Action | Check completeness, flag anything missed, ask each deal team to propose marks with context | S17: completeness check, one email per team with its rows, due date |
| Data | Email, tasks | `email_message`, `task` |
| System | Outlook | Simulated |
| Output | Deal teams have their request | Same |
| Next owner | Deal Teams (M3) | Same |
| Exception | Gaps | MA loop |

**AI assist:** A3-style completeness check (code first, LLM for free-text notes).

**Audit:** `monthly_update_file.completeness_checked`, `email.sent` (monthly_request, one per team), `task.created` (M3 per loan).

**Acceptance:** Six emails go out, one per team, each listing only that team's rows and the due date; a row with a missing pacing status is flagged before sending and loop MA increments when the PM rebuilds the file.

#### M3 Deal teams propose marks

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Their rows, last mark, pacing, Sigma, watchlist notes | Same in S18 |
| Owner | Deal Team | Deal Team |
| Action | Propose a mark per loan with commentary and rationale | S18 form per loan: proposed mark, rationale, evidence; A10 Monthly Mark Assistant shows last quarter's mark, Lincoln's last range, the pacing and Sigma signals, and drafts a rationale the analyst edits |
| Data | Proposal | `monthly_mark_proposal` |
| System | Email, Excel | ABIQ |
| Output | Proposals submitted | Same |
| Next owner | PM Team (M5), or M4 if DDTL | Same |
| Exception | **Loop MC**: committee push-back sends the proposal back | Version increments |

**AI assist:** A10 (LLM call with structured output). Person: proposes the mark.

**Audit:** `monthly_mark_proposal.submitted` (version, mark, rationale, evidence), `agent_suggestion` for the A10 rationale draft with accepted, edited or rejected.

**Acceptance:** A10 drafts a rationale only after the analyst enters a mark; Harbor's October proposal shows last quarter's final mark 88.0 and Lincoln's range 86.5 to 89.5 in the signals panel; a proposal without a rationale cannot be submitted.

#### M4 Special cases: DDTL rebalance

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Funded and unfunded amounts for delayed-draw facilities | `SENTRY.DDTL_COMMITMENT`, `SENTRY.DRAW` |
| Owner | Deal Team (assumed; DQ13) | Same |
| Action | Rebalance funded and unfunded positions; apply the mark to the right amounts | S18 DDTL tab: code computes funded and unfunded after draws, shows the rebalance, the analyst confirms |
| Data | Rebalance record | `ddtl_rebalance` |
| System | Sentry, Excel | ABIQ, Snowflake read |
| Output | Rebalanced positions | Same |
| Next owner | PM Team (M5) | Same |
| Exception | Partial draws, timing | Flagged assumed; rule configurable |

**AI assist:** none.

**Audit:** `ddtl_rebalance.confirmed` (commitment, draws, funded and unfunded after, rule version and assumed flag).

**Acceptance:** For the two DDTL facilities, funded after equals drawn before plus October draws, unfunded after equals commitment minus funded after, and the mark is applied to the funded amount (assumed rule shown with its chip).

#### M5 Track responses and aggregate

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Proposals | Same |
| Owner | PM Team | PM Team |
| Action | Chase outstanding teams; consolidate into one file | S17: response board, A8 Chaser drafts reminders, consolidation by code into the monthly marks file |
| Data | Consolidated file | `monthly_marks_file` |
| System | Email, Excel | ABIQ |
| Output | One consolidated file | Same |
| Next owner | Valuation Committee (M6) | Same |
| Exception | **Loop MB**: missing teams chased, M3 and M4 repeated | Counter |

**AI assist:** A8.

**Audit:** `reminder.sent` (team, loans outstanding), `monthly_marks_file.consolidated` (version, row count).

**Acceptance:** The response board shows 5 of 6 teams submitted at the chase date; the A8 reminder draft names the outstanding loans and is sent only when the PM presses Send; consolidation produces one file with 24 rows and loop MB increments for the late team.

#### M6 Send to the Valuation Committee for approval (monthly gate)

| Field | Today | In the POC |
| --- | --- | --- |
| Input | Consolidated monthly marks | Same |
| Owner | PM Team (sends), Valuation Committee (approves) | Same |
| Action | Email the file; the committee approves the monthly marks | S15 (monthly tab): the PM sends the approval request; S19: the committee approves or pushes back per loan with rationale |
| Data | Approval | `approval`, `monthly_decision` |
| System | Email | ABIQ |
| Output | Approved monthly marks | Cycle closed; each loan's status becomes `monthly_final` and the approved mark is written to `monthly_decision` |
| Next owner | None | None |
| Exception | **Loop MC**: push-back on a mark | Back to M3 for that loan |

**AI assist:** none.

**Audit:** `approval_request.sent` (monthly_marks), `monthly_decision.recorded` per loan (outcome, mark, rationale), `cycle.closed`.

**Acceptance:** The committee approves 23 loans and pushes one back with a rationale; the pushed-back loan returns to its team in S18 with loop MC x1; after the team resubmits and the committee approves, the cycle closes and every loan shows `monthly_final`.

---

## Part C: Cross-cutting functionality

| Function | Description | Screen | Spec |
| --- | --- | --- | --- |
| Cycle Dashboard | Day counter, phase progress, loan board by step, overdue tasks, gates passed, loops fired, portfolio value so far | S01 | Transorg UI UX Spec.md S01 |
| Notifications | In-app and email for task assignment, due dates, send-backs, decisions | all | Ingestion Integration Spec - Transorg.md section 5 |
| Chaser | Rule-based reminder timing with AI-drafted text; a person always sends | S04, S17 | Agentic AI Spec - Transorg Deck.md A8 |
| Ask ABIQ | Read-only assistant over the cycle: documents, spreads, CMRs, marks, decisions, audit; cites sources; cannot act | S20 | Agentic AI Spec - Transorg Deck.md A9 |
| Mark lineage | One page per loan per cycle tracing the final mark to every input and decision | S21 | Transorg UI UX Spec.md S21 |
| Rules configuration | Thresholds, calendars, checklists, allow-lists, chase cadence, with confirmed or assumed flags and versions | S22 | Transorg Data Spec.md section 8 |
| Synthetic data loader | Generate and load the demo dataset; reset the demo | S22 | Transorg Data Spec.md section 7 |
| Evaluation dashboard | Agent accuracy, kept-sentence ratio, cost per loan, latency | S22 | Agentic AI Spec - Transorg Deck.md section 16 |
| Export | Marks tracker to Excel (same columns as the client's file), CMR to PDF, pack to PDF, audit to CSV | S11, S08, S12, S21 | Transorg UI UX Spec.md |

## Part D: Step to screen to agent matrix

This table is the union of the screen index in Transorg UI UX Spec.md section 3 and the agent catalog in Agentic AI Spec - Transorg Deck.md section 6; the roadmap workbook's Screen, Agent and Process steps columns follow it. S06 (Loan Workspace) is the hub for every per-loan step from Q4 to Q15 and is listed once.

| Step | Screens | Service | Agents | Gate or loop |
| --- | --- | --- | --- | --- |
| Q1 | S02 Loan universe, S03 Kickoff | cycle | none | |
| Q2 | S04 Intake | document, email | A0 classifier, A8 chaser | |
| Q3 | S05 Lincoln exchange | lincoln | none | |
| Q4 | S07 Spreading (in S06) | spread | A1, A11 | |
| Q5 | S08 CMR editor (in S06) | cmr | A2, A3 | |
| Q6 | S09 Review queue | review | A3 | QB |
| Q7 | S09 Review queue | review | A3 | QB |
| Q8 | S09 Review queue (File action), S08 | cmr, filing | none | |
| Q9 | S09 Review queue | review | A3 | QB |
| Q10 | S05 Lincoln exchange | lincoln | none | QC |
| Q11 | S05, S11 Tracker | tracker | A4, A6 | |
| Q12 | S05 | lincoln, adapter | A4 | |
| Q13 | S05 | document | none | |
| Q14 | S10 Pricing panel, S11 | valuation | A5, A6 (impact note update) | G1, QA |
| Q15 | S08 | cmr | none | |
| Q16 | S12 Agenda, S11 | rules | A6 (optional reasons) | |
| Q17 | S12 Agenda and pack | committee | A6 | |
| Q18 | S13 Committee meeting | committee | A9 | G2 decision, QF |
| Q19 | S14 Reconciliation, S11 | reconciliation | A7 | QD, QE return here |
| Q20 | S15 Approvals | approval | none | G2 approval, QD |
| Q21 | S15 Approvals | governance | none | G3, QE |
| Q22 | S16 Distribution | distribution | none | |
| M1 | S17 Monthly dashboard | monthly | A0 | MA |
| M2 | S17 | monthly, email | none | MA |
| M3 | S18 Monthly proposals | monthly | A10 | MC |
| M4 | S18 DDTL tab | monthly | none | |
| M5 | S17 | monthly | A8 | MB |
| M6 | S15 (request), S19 (decision) | approval | none | monthly gate, MC |
| all | S01 Dashboard, S06 Loan workspace, S20 Ask ABIQ, S21 Lineage, S22 Admin | cross-cutting | A9 | |
