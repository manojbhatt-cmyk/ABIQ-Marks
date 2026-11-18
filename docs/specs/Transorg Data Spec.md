# Data Specification

What data the system uses, where each piece lives, its schema, and how the synthetic dataset is produced. All schemas for client systems are **assumed** reconstructions from the process notes and the discovery questionnaire (DQ4, DQ6, DQ7, DQ14, DQ16) and are versioned so they can be replaced when AllianceBernstein confirms the real ones.

---

## 1. Storage map

| Data | System of record today | Where the POC reads or writes it | Format | Notes |
| --- | --- | --- | --- | --- |
| Borrowers, sponsors, deals, facilities, deal team assignments | DealCloud | **Snowflake** `DEALCLOUD` schema (read) | Tables | Confirmed: DealCloud data is in Snowflake |
| Standard financial model (spreads), CMRs, risk ratings, pricing panel, governance sign-off | Everest | **Snowflake** `EVEREST` schema (read); writes through the write-back adapter | Tables | Confirmed: Everest data is in Snowflake. Writes are assumed possible in the POC (synthetic); production write path is an open item |
| Funded and unfunded amounts, DDTL commitments and draws | Sentry | **Snowflake** `SENTRY` schema (read) | Tables | Assumed in Snowflake (open item 1) |
| Monthly portfolio dashboard | Sigma on Snowflake | **Snowflake** `SIGMA` views (read) | Views | Assumed |
| Pacing file | Finance (Excel) | **Snowflake** `FINANCE.PACING_FILE` loaded from an Excel file by the generator | Table plus the source xlsx | Assumed layout |
| Borrower financial packages, waiver requests, sponsor letters | Outlook (email attachments) | Simulated **Outlook** mailbox (inbox API) and the `uploads` bucket | .eml plus PDF, XLSX, DOCX attachments | |
| Package shared with Lincoln; Lincoln reports; Lincoln marks; send-back notes | Box | Simulated **Box** bucket `box` | PDF, XLSX, JSON manifests | |
| Filed CMR PDFs, copies of Lincoln reports | SharePoint | Simulated **SharePoint** bucket `sharepoint` | PDF | Folder convention from the source note |
| Approval emails (request and reply) | OneDrive | Simulated **OneDrive** bucket `onedrive` | PDF bundle plus .eml | |
| Kickoff emails, chase emails, impact notes, committee pack emails, approval emails, distribution | Outlook | Simulated Outlook (send and inbox API) | .eml | |
| Marks tracker | Excel | **Postgres** `marks_tracker_row` with an Excel export that reproduces the client's columns | Table, xlsx export | ABIQ becomes the tracker in the POC |
| Workflow state, tasks, reviews, decisions, approvals, reconciliation, audit, agent runs | Not systematised today | **Postgres** application schema | Tables | ABIQ is the system of record for these |
| Document text, tables, page images, embeddings | Not systematised today | Postgres (`document_page`, `document_table`) and pgvector; page images in the `uploads` bucket | Rows, PNG | |
| LangGraph checkpoints and long-term store | n/a | Postgres (`langgraph_*` tables) | | |

## 2. Snowflake: synthetic source schemas

### 2.1 Conventions

- One Snowflake database `TIQ_POC` with schemas `DEALCLOUD`, `EVEREST`, `SENTRY`, `SIGMA`, `FINANCE`.
- Column names in upper snake case. Every table has `LOADED_AT TIMESTAMP_NTZ` and `SOURCE_BATCH_ID STRING` so loads are traceable.
- Identifiers: `BORROWER_ID` (B-0001), `SPONSOR_ID` (SP-001), `DEAL_ID` (D-0001), `FACILITY_ID` (F-0001), `POSITION_ID` (P-0001). The facility is the unit of valuation (assumed, DQ2).
- Money in USD millions as `NUMBER(18,4)`; marks as `NUMBER(8,4)` on a 0 to 100 scale; ratios as `NUMBER(8,4)`; percentages stored as fractions (0.165 means 16.5 percent).

### 2.2 DEALCLOUD schema

| Table | Columns | Purpose |
| --- | --- | --- |
| `BORROWER` | BORROWER_ID, LEGAL_NAME, SHORT_NAME, INDUSTRY, COUNTRY, SPONSOR_ID, PRIMARY_CONTACT_EMAIL, EMAIL_DOMAIN, FISCAL_YEAR_END_MONTH, STATUS | One row per borrower; `EMAIL_DOMAIN` drives inbound email matching |
| `SPONSOR` | SPONSOR_ID, NAME, CONTACT_EMAIL | Private equity sponsor (Northgate Capital for Harbor) |
| `DEAL` | DEAL_ID, BORROWER_ID, DEAL_NAME, DEAL_TEAM_ID, ORIGINATION_DATE, STATUS, DEALCLOUD_URL | Deal master record |
| `FACILITY` | FACILITY_ID, DEAL_ID, FACILITY_TYPE (`term_loan`, `ddtl`, `revolver`), COMMITMENT_AMOUNT, CURRENCY, COUPON_RATE, SPREAD_BPS, MATURITY_DATE, SENIORITY, STATUS, CMR_TYPE (`standard`, `watchlist`) | One row per facility; `COUPON_RATE` and `MATURITY_DATE` feed the indicative cross-check |
| `COVENANT` | COVENANT_ID, FACILITY_ID, COVENANT_TYPE (`max_leverage`, `min_interest_cover`, `min_liquidity`), OPERATOR (`<`, `<=`, `>`, `>=`), THRESHOLD, TEST_FREQUENCY, DEFINITION_NOTES | Harbor: `max_leverage`, `<`, 3.50 |
| `DEAL_TEAM` | DEAL_TEAM_ID, TEAM_NAME, LEAD_USER_EMAIL, ANALYST_USER_EMAIL, AC_MANAGER_USER_EMAIL | Team Blue, Team Green, Team Red and others |
| `DEAL_TEAM_ASSIGNMENT` | FACILITY_ID, DEAL_TEAM_ID, EFFECTIVE_FROM, EFFECTIVE_TO | History of ownership |
| `CONTACT` | CONTACT_ID, BORROWER_ID, NAME, EMAIL, ROLE | Borrower finance contacts (senders of packages) |

### 2.3 EVEREST schema

| Table | Columns | Purpose |
| --- | --- | --- |
| `SPREAD_TEMPLATE` | TEMPLATE_ID, TEMPLATE_VERSION, LINE_CODE, LINE_LABEL, LINE_GROUP (`income`, `adjustments`, `balance`, `cash_flow`, `debt`), SORT_ORDER, IS_CALCULATED, FORMULA, UNIT | The standard model definition (section 5.3 lists the lines) |
| `SPREAD_MODEL` | SPREAD_ID, FACILITY_ID, PERIOD_END_DATE, PERIOD_TYPE (`quarter`, `ltm`, `fy`), VERSION, STATUS (`draft`, `approved`), CREATED_BY, APPROVED_BY, APPROVED_AT, SOURCE_SYSTEM (`tiq` when written back) | Header per spread |
| `SPREAD_VALUE` | SPREAD_ID, LINE_CODE, VALUE, CURRENCY, SOURCE_DOC_REF, NOTE | One row per line |
| `ADJUSTMENT` | ADJUSTMENT_ID, SPREAD_ID, ADJ_TYPE (`severance`, `restructuring`, `non_recurring_legal`, `other`), AMOUNT, DESCRIPTION, ALLOWED_FLAG, SOURCE_DOC_REF | Add-backs |
| `CMR` | CMR_ID, FACILITY_ID, PERIOD (`2026-Q3`), VERSION, CMR_TYPE, STATUS (`draft`, `in_review`, `filed`, `agreed`, `final`), AUTHOR, FILED_AT, SHAREPOINT_PATH, MARK, MARK_RANGE_LOW, MARK_RANGE_HIGH, MARK_APPROVED_BY, MARK_APPROVED_AT, COMMITTEE_MARK, COMMITTEE_RATIONALE | Header plus the mark block |
| `CMR_SECTION` | CMR_ID, SECTION_CODE, SECTION_TITLE, BODY_TEXT, SORT_ORDER | Narrative sections |
| `RISK_RATING` | FACILITY_ID, PERIOD, RATING (1 to 5), PREVIOUS_RATING, WATCHLIST_FLAG, WAIVER_STATUS (`none`, `requested`, `approved`, `rejected`), WAIVER_CONDITIONS, SET_BY, SET_AT | Current rating per period |
| `PRICING_PANEL` | FACILITY_ID, PERIOD, LINCOLN_VERSION, LINCOLN_POINT, LINCOLN_RANGE_LOW, LINCOLN_RANGE_HIGH, REQUIRED_YIELD, VALUATION_DATE, DEAL_TEAM_STATUS (`pending`, `approved`, `sent_back`), DEAL_TEAM_MARK, DEAL_TEAM_DECIDED_BY, DEAL_TEAM_DECIDED_AT, SEND_BACK_REASON, FINAL_MARK | The pricing panel the Deal Team sees |
| `GOVERNANCE_SIGNOFF` | SIGNOFF_ID, PERIOD, CYCLE_TYPE, SIGNED_BY, SIGNED_AT, SCHEDULE_HASH, SCHEDULE_DOC_REF, NOTES | Gate G3 record |

### 2.4 SENTRY schema

| Table | Columns | Purpose |
| --- | --- | --- |
| `POSITION` | POSITION_ID, FACILITY_ID, FUND_ID, AS_OF_DATE, FUNDED_AMOUNT, UNFUNDED_AMOUNT, PAR_AMOUNT, COST_BASIS | Funded amounts per facility per fund, the reconciliation source for amounts |
| `DDTL_COMMITMENT` | FACILITY_ID, TOTAL_COMMITMENT, DRAWN_TO_DATE, UNDRAWN, AVAILABILITY_END_DATE | Delayed-draw facilities |
| `DRAW` | DRAW_ID, FACILITY_ID, DRAW_DATE, AMOUNT, STATUS | Individual draws in the month |

Local fallback: if a Snowflake account is not available in an environment, the same DDL is loaded into DuckDB from the generator's parquet files and the Snowflake connector is pointed at it (Ingestion Integration Spec - Transorg.md section 2.2). Nothing above the connector changes.

### 2.5 SIGMA views and FINANCE schema (monthly inputs)

| Object | Columns | Purpose |
| --- | --- | --- |
| `SIGMA.PORTFOLIO_SNAPSHOT` (view) | FACILITY_ID, AS_OF_MONTH, CURRENT_MARK, RISK_RATING, WATCHLIST_FLAG, LAST_FINANCIALS_PERIOD, LTM_LEVERAGE, LTM_INTEREST_COVER, LEVERAGE_TREND (`up`, `flat`, `down`), INTEREST_RECEIVED_MTD | What the Sigma dashboard shows per loan |
| `FINANCE.PACING_FILE` | FACILITY_ID, AS_OF_MONTH, FUNDED_AMOUNT, EXPECTED_INTEREST, INTEREST_RECEIVED, PACING_STATUS (`on_track`, `behind`, `ahead`), NOTES, SOURCE_FILE_NAME | Loaded from the pacing Excel; layout assumed (open item 4) |
| `FINANCE.WATCHLIST_CALL_NOTE` | NOTE_ID, FACILITY_ID, CALL_DATE, ATTENDEES, NOTE_TEXT, UPLOADED_BY | Watchlist call notes, uploaded in ABIQ and mirrored here for the Sigma view |

### 2.6 The loan universe query (Q1)

Active facilities as of the cycle's day 0, with everything the kickoff and tracker need:

```sql
select f.facility_id, f.deal_id, d.deal_name, b.borrower_id, b.short_name as borrower,
       b.email_domain, sp.name as sponsor, f.facility_type, f.commitment_amount, f.currency,
       f.coupon_rate, f.maturity_date, f.cmr_type,
       dt.deal_team_id, dt.team_name, dt.lead_user_email, dt.analyst_user_email, dt.ac_manager_user_email,
       pp.final_mark as previous_final_mark, rr.rating as previous_rating, rr.watchlist_flag as previous_watchlist,
       pos.funded_amount, pos.unfunded_amount
from dealcloud.facility f
join dealcloud.deal d on d.deal_id = f.deal_id
join dealcloud.borrower b on b.borrower_id = d.borrower_id
left join dealcloud.sponsor sp on sp.sponsor_id = b.sponsor_id
join dealcloud.deal_team_assignment a on a.facility_id = f.facility_id
     and :day0 between a.effective_from and coalesce(a.effective_to, '9999-12-31')
join dealcloud.deal_team dt on dt.deal_team_id = a.deal_team_id
left join everest.pricing_panel pp on pp.facility_id = f.facility_id and pp.period = :previous_period
left join everest.risk_rating rr on rr.facility_id = f.facility_id and rr.period = :previous_period
left join (select facility_id, sum(funded_amount) funded_amount, sum(unfunded_amount) unfunded_amount
           from sentry.position where as_of_date = :day0 group by facility_id) pos on pos.facility_id = f.facility_id
where f.status = 'active' and d.status = 'active';
```

## 3. Document stores and mailbox: layouts and formats

### 3.1 Bucket layouts (MinIO, S3 API)

```
box/
  <period>/<borrower-slug>/package-v<n>/            documents shared with Lincoln plus manifest.json
  <period>/lincoln-out/<valuation-date>/             Lincoln's report PDFs and marks xlsx
  <period>/<borrower-slug>/send-back-v<n>.json       Deal Team send-back note plus evidence refs

sharepoint/
  PrivateCredit/Valuation/<period>/CMRs/<borrower-slug>-<facility-id>-v<n>.pdf
  PrivateCredit/Valuation/<period>/Lincoln/<file>.pdf
  PrivateCredit/Valuation/<period>/Committee/pack-v<n>.pdf

onedrive/
  Approvals/<period>/final-marks-approval.pdf        request plus reply bundle
  Approvals/<period>/final-marks-schedule-v<n>.xlsx

uploads/
  inbox/<message-id>/<attachment>                    raw inbound attachments
  pages/<document-id>/<page>.png                     page images for evidence links
```

### 3.2 `manifest.json` (Lincoln package)

```json
{
  "period": "2026-Q3",
  "facility_id": "F-0002",
  "borrower": "Harbor Logistics",
  "package_version": 1,
  "shared_at": "2026-10-09T10:15:00Z",
  "shared_by": "pm.analyst@ab-poc.local",
  "previous_mark": 97.0,
  "cmr_type": "watchlist",
  "documents": [
    {"doc_id": "DOC-0101", "type": "financial_statements", "file": "harbor-q3-2026-financials.pdf", "sha256": "..."},
    {"doc_id": "DOC-0102", "type": "covenant_certificate", "file": "harbor-q3-2026-covenant-cert.pdf", "sha256": "..."},
    {"doc_id": "DOC-0103", "type": "sponsor_letter", "file": "northgate-equity-commitment.pdf", "sha256": "..."},
    {"doc_id": "DOC-0104", "type": "waiver_request", "file": "harbor-waiver-request.pdf", "sha256": "..."}
  ]
}
```

### 3.3 Lincoln marks spreadsheet (assumed format, open item 3)

Sheet `Marks`, one row per facility:

| Column | Example (Harbor v1) | Example (Harbor v2) |
| --- | --- | --- |
| Facility ID | F-0002 | F-0002 |
| Borrower | Harbor Logistics | Harbor Logistics |
| Valuation date | 2026-10-18 | 2026-10-29 |
| Version | 1 | 2 |
| Point estimate | 86.5 | 88.0 |
| Range low | 85.0 | 86.5 |
| Range high | 88.0 | 89.5 |
| Required yield | 16.5% | 15.5% |
| Methodology | Yield-based, cross-checked with recovery | Yield-based, cross-checked with recovery |
| Key assumptions | Lost major customer; covenant breach; no sponsor support assumed | $5M sponsor equity committed by Northgate Capital (letter of 6 Oct); debt net of equity $55M; net leverage 3.4x |
| Comments | | Revised after Deal Team note of 27 Oct |

Lincoln's report PDF per loan carries the same numbers plus a narrative. The generator produces both so that A4 can cross-check them.

### 3.4 Send-back note (`send-back-v<n>.json`)

```json
{
  "facility_id": "F-0002", "period": "2026-Q3", "lincoln_version_challenged": 1,
  "decided_by": "team.blue.lead@ab-poc.local", "decided_at": "2026-10-27T16:40:00Z",
  "reason_category": "new_information",
  "note": "Lincoln's valuation does not fully reflect the $5M sponsor equity committed by Northgate Capital (letter dated 6 Oct, attached). Debt net of the equity is $55M; LTM adjusted EBITDA $16M; net leverage 3.4x, inside the 3.50x covenant.",
  "evidence": [{"doc_id": "DOC-0103", "page": 1}, {"spread_id": "SPR-0002-v1", "lines": ["TOTAL_DEBT", "CASH", "LTM_ADJ_EBITDA"]}]
}
```

### 3.5 Email templates

| Template | Trigger | Fields merged |
| --- | --- | --- |
| `kickoff` | Q1 | team name, loans with CMR type, financials due, CMR due, Lincoln dates, SCT review dates, committee date, final sign-off date |
| `chase_borrower`, `chase_team` | Q2, M5 | loan, missing items, due date, days overdue |
| `impact_summary` | Q11, Q14 | portfolio delta, drivers per loan, version |
| `committee_pack` | Q17 | agenda loans, pack link, meeting date |
| `final_marks_approval_request` | Q20 | schedule table, changes since the committee, approval link |
| `distribution` | Q22 | recipient group, CMR list, portfolio value |
| `monthly_request` | M2 | team rows, due date |
| `monthly_approval_request` | M6 | consolidated marks |

Every template is plain text plus an HTML variant, with no em dashes, and is stored in `email_template` so it can be edited in S22.

### 3.6 Pacing file (assumed xlsx layout)

Sheet `Pacing`: Facility ID, Borrower, Month, Funded amount, Expected interest, Interest received, Pacing status, Notes. The generator writes it and the loader fills `FINANCE.PACING_FILE`.

## 4. Document pipeline outputs

| Table (Postgres) | Columns | Purpose |
| --- | --- | --- |
| `document` | id, store (`uploads`, `box`, `sharepoint`, `onedrive`), path, sha256, file_name, mime, size, source (`email`, `box_watch`, `upload`, `generated`), email_message_id, facility_id, borrower_id, period, doc_type, doc_type_confidence, doc_type_confirmed_by, period_detected, status (`received`, `parsed`, `classified`, `indexed`, `failed`), created_at | Every file the system knows |
| `document_page` | document_id, page_no, text, image_path, token_count | Page text and image for evidence |
| `document_table` | id, document_id, page_no, table_index, caption, header_json, rows_json, bbox | Extracted tables; the Spreading Agent's main input |
| `document_chunk` | id, document_id, page_no, chunk_index, text, embedding (vector 1536), metadata_json | Retrieval index for A2, A5, A9 |
| `email_message` | id, direction (`in`, `out`), message_id, thread_id, from_addr, to_addrs, cc_addrs, subject, body_text, body_html, received_at, sent_at, matched_facility_id, matched_borrower_id, match_method (`domain`, `subject`, `manual`), template_code, cycle_id, status | Inbound and outbound mail |

## 5. Application schema (Postgres)

All tables carry `id uuid`, `created_at`, `created_by`, `updated_at`, `updated_by`. Foreign keys are named by convention `<table>_id`. Enumerations are Postgres enums.

### 5.1 Identity and configuration

| Table | Key columns |
| --- | --- |
| `app_user` | email, display_name, role (`pm_team`, `deal_analyst`, `deal_lead`, `ac_manager`, `sct`, `lincoln`, `committee_member`, `committee_chair`, `governance`, `finance_ir`, `admin`), deal_team_id, active |
| `deal_team_ref` | deal_team_id (mirrors DealCloud), team_name, members |
| `rule_config` | key, value_json, value_type, description, confirmed_by_client (bool), confirmed_source, version, effective_from, updated_by |
| `email_template` | code, subject, body_text, body_html, version |
| `calendar_template` | cycle_type, phase, step_codes, start_day_offset, end_day_offset, assumed |

### 5.2 Cycle and workflow

| Table | Key columns |
| --- | --- |
| `valuation_cycle` | cycle_type (`quarterly`, `monthly`), period, day0_date, deadline_date, status (`draft`, `open`, `closed`, `reopened`), opened_by, closed_at, final_portfolio_value, previous_portfolio_value |
| `cycle_loan` | cycle_id, facility_id, borrower_id, deal_team_id, cmr_type, previous_mark, previous_rating, previous_watchlist, funded_amount, current_step (`Q1`..`Q22` or `M1`..`M6`), status (see Transorg Functional Spec.md section 0), lincoln_track_status, deal_team_track_status, loop_counts_json, late_addition (bool) |
| `deadline` | cycle_id, cycle_loan_id (nullable for cycle-wide), step_code, due_date, assumed, source |
| `task` | cycle_loan_id, step_code, title, owner_user_id, owner_role, due_date, status (`open`, `done`, `overdue`, `cancelled`), completed_at, completed_by |
| `reminder` | task_id, scheduled_for, sent_at, email_message_id, drafted_by_agent_run_id, approved_by |

### 5.3 Spreads and metrics

The standard template (assumed, DQ7) has these lines; the generator and the metrics engine share the codes.

| Line code | Group | Calculated | Formula or source |
| --- | --- | --- | --- |
| `REVENUE` | income | no | borrower statements |
| `COGS`, `OPEX` | income | no | borrower statements |
| `REPORTED_EBITDA` | income | no | operating profit before depreciation as reported |
| `ADDBACK_TOTAL` | adjustments | yes | sum of accepted `adjustment` rows |
| `ADJ_EBITDA` | adjustments | yes | `REPORTED_EBITDA + ADDBACK_TOTAL` |
| `LTM_ADJ_EBITDA` | adjustments | yes | sum of `ADJ_EBITDA` over the last four quarters |
| `CASH` | balance | no | borrower statements |
| `TOTAL_DEBT` | debt | no | borrower statements and facility records |
| `NET_DEBT` | debt | yes | `TOTAL_DEBT - CASH` |
| `INTEREST_EXPENSE_LTM` | debt | no | borrower statements (yearly interest) |
| `LEVERAGE` | ratios | yes | `TOTAL_DEBT / LTM_ADJ_EBITDA` |
| `NET_LEVERAGE` | ratios | yes | `NET_DEBT / LTM_ADJ_EBITDA` |
| `INTEREST_COVER` | ratios | yes | `LTM_ADJ_EBITDA / INTEREST_EXPENSE_LTM` |
| `REVENUE_YOY`, `EBITDA_YOY` | ratios | yes | change versus the same quarter last year |

| Table | Key columns |
| --- | --- |
| `financial_spread` | cycle_loan_id, facility_id, period_end, version, status (`proposed`, `in_review`, `approved`, `superseded`), proposed_by_agent_run_id, approved_by, approved_at, template_version, source_document_ids, written_back_spread_id (Everest) |
| `spread_line_item` | spread_id, line_code, period_type (`quarter`, `ltm`, `prior_quarter`, `same_quarter_last_year`), value, currency, unit, confidence (0 to 1), evidence_json (`{doc_id, page, table_index, row, col, text}`), proposed_value, edited (bool), edit_reason |
| `adjustment` | spread_id, adj_type, amount, description, allowed (bool from the allow-list), evidence_json, proposed_by (`agent`, `user`), accepted (bool), decided_by |
| `metric` | spread_id, line_code, value, formula_text, inputs_json |
| `covenant_test` | spread_id, covenant_id, metric_line_code, actual, threshold, operator, result (`pass`, `fail`), headroom, note |

### 5.4 CMR

| Table | Key columns |
| --- | --- |
| `cmr` | cycle_loan_id, facility_id, period, version, cmr_type, status (`draft`, `in_review`, `filed`, `agreed`, `final`), author_user_id, template_version, spread_id, mark_block_json (`{mark, range_low, range_high, approved_by, approved_at, committee_mark, committee_rationale}`), sharepoint_path, everest_cmr_id |
| `cmr_section` | cmr_id, section_code (`summary`, `financial_performance`, `covenants_liquidity`, `risks`, `mitigants`, `sponsor_collateral`, `recommendation`, `mark_direction`, `evidence`), title, body_markdown, drafted_by_agent_run_id, draft_body_markdown, kept_sentence_ratio, citations_json |
| `cmr_recommendation` | cmr_id, proposed_rating, previous_rating, watchlist_action (`add`, `keep`, `remove`, `none`), waiver_requested (bool), waiver_conditions, expected_mark_direction (`down`, `flat`, `up`), rationale, agent_suggestion_id |
| `cmr_evidence` | cmr_id, document_id, supports (`recommendation`, `mitigant`, `risk`, `other`), note |
| `cmr_review` | cmr_id, stage (`ac_manager`, `pm_team`, `sct`), reviewer_user_id, started_at, decided_at, outcome (`passed`, `sent_back`), checklist_results_json, loop_no |
| `cmr_review_comment` | cmr_review_id, section_code, text, resolved (bool), resolved_by, resolution_note |
| `cmr_file` | cmr_id, version, pdf_path (sharepoint), sha256, filed_by, filed_at |

### 5.5 Lincoln exchange and valuations

| Table | Key columns |
| --- | --- |
| `lincoln_package` | cycle_loan_id, version, manifest_path, document_ids, shared_by, shared_at, acknowledged_at |
| `lincoln_valuation` | cycle_loan_id, facility_id, version, valuation_date, point_estimate, range_low, range_high, required_yield, methodology, key_assumptions, comments, report_document_id, marks_file_document_id, sharepoint_copy_path, extracted_by_agent_run_id, extraction_confidence, discrepancy_flag, discrepancy_note, received_at |
| `valuation_crosscheck` | lincoln_valuation_id, coupon_rate, years_to_maturity, required_yield, indicative_price, method (`annual_coupon_discount`), note |

### 5.6 Gate G1 and the tracker

| Table | Key columns |
| --- | --- |
| `valuation_decision` | cycle_loan_id, lincoln_valuation_id, loop_no, outcome (`approved`, `approved_different_mark`, `sent_back`), approved_mark, rationale (mandatory for `approved_different_mark`), reason_category (`new_information`, `factual_error`, `methodology_question`, `other`), note, evidence_json, challenge_agent_run_id, decided_by, co_decided_by, decided_at, send_back_note_path (box) |
| `marks_tracker_row` | cycle_id, cycle_loan_id, facility_id, borrower, deal_team, funded_amount, previous_mark, lincoln_draft_mark, lincoln_range_low, lincoln_range_high, lincoln_version, deal_team_mark, committee_mark, final_mark, previous_value, draft_value, final_value, delta_value, previous_rating, current_rating, watchlist_flag, waiver_status, status, agenda_flag, agenda_reasons_json, last_updated_from (`lincoln`, `g1`, `committee`, `reconciliation`) |
| `impact_summary` | cycle_id, version, portfolio_previous_value, portfolio_current_value, delta, drivers_json, body_text, drafted_by_agent_run_id, sent_to, sent_at, email_message_id |

Value formulas: `previous_value = funded_amount * previous_mark / 100`; `draft_value = funded_amount * lincoln_draft_mark / 100`; `final_value = funded_amount * final_mark / 100`; `delta_value = current_value - previous_value` where current is the latest available mark in the order final, committee, deal team, Lincoln draft.

### 5.7 Committee

| Table | Key columns |
| --- | --- |
| `agenda_test_result` | cycle_loan_id, run_id, test_code (`watchlist`, `downgrade`, `mark_move_10pct`, `outside_lincoln_range`, `g1_unresolved`), result (bool), inputs_json, rule_version, assumed |
| `committee_agenda` | cycle_id, version, meeting_date, built_by, built_at |
| `committee_agenda_item` | agenda_id, cycle_loan_id, reasons_json, source (`rules`, `manual_add`), manual_reason, sort_order |
| `committee_pack` | agenda_id, version, cover_note, pdf_path, document_ids, built_at, sent_email_message_id, stale (bool) |
| `committee_pack_summary` | pack_id, cycle_loan_id, body_markdown, drafted_by_agent_run_id, edited (bool) |
| `committee_decision` | agenda_item_id, outcome (`approve`, `change`, `send_back`, `defer`, `request_information`), proposed_mark, decided_mark, rating, watchlist_action, waiver_decision, conditions, rationale, members_present_json, recorded_by, recorded_at, send_back_to (`deal_team`, `lincoln`, null), loop_qf_no |

### 5.8 Reconciliation, approvals, governance, distribution

| Table | Key columns |
| --- | --- |
| `reconciliation_run` | cycle_id, run_no, started_at, status (`mismatches`, `clean`), item_count, mismatch_count |
| `reconciliation_item` | run_id, cycle_loan_id, check_code (`mark_tracker_vs_everest`, `rating_everest_vs_cmr`, `funded_tracker_vs_sentry`, `mark_cmr_vs_tracker`), field, source_a, value_a, source_b, value_b, status (`match`, `mismatch`, `resolved`, `explained`), resolution_action (`corrected_target`, `corrected_tracker`, `explained`), explanation, explainer_agent_run_id, resolved_by, resolved_at |
| `approval_request` | cycle_id, kind (`final_marks`, `monthly_marks`), schedule_json, changes_json, sent_email_message_id, requested_by, requested_at, status (`pending`, `approved`, `rejected`) |
| `approval` | approval_request_id, approver_user_id, decision (`approved`, `rejected`), comments, decided_at, reply_email_message_id, evidence_path (onedrive) |
| `governance_signoff` | cycle_id, signed_by, signed_at, schedule_hash, evidence_path, everest_signoff_id, status (`signed`, `returned`), return_reasons |
| `distribution` | cycle_id, recipient_group (`finance`, `investor_relations`, `deal_teams`), recipients_json, document_ids, sent_at, email_message_id |

### 5.9 Monthly

| Table | Key columns |
| --- | --- |
| `monthly_update_row` | cycle_id, facility_id, deal_team_id, current_mark, pacing_json, sigma_json, watchlist_notes_json, completeness_status, version |
| `monthly_mark_proposal` | cycle_id, facility_id, version, proposed_mark, rationale, evidence_json, assistant_agent_run_id, proposed_by, proposed_at, status (`draft`, `submitted`, `pushed_back`, `approved`) |
| `ddtl_rebalance` | cycle_id, facility_id, total_commitment, drawn_before, draws_in_month, funded_after, unfunded_after, mark_applied_to (`funded`, `funded_and_unfunded`), confirmed_by, confirmed_at, assumed_rule |
| `monthly_marks_file` | cycle_id, version, rows_json, xlsx_path, consolidated_by, consolidated_at |
| `monthly_decision` | cycle_id, facility_id, outcome (`approved`, `pushed_back`), approved_mark, rationale, decided_by, decided_at |

### 5.10 Audit and agents

| Table | Key columns |
| --- | --- |
| `audit_event` | occurred_at, actor_user_id, actor_role, action (dot-coded as in Transorg Functional Spec.md), entity_type, entity_id, cycle_id, cycle_loan_id, before_json, after_json, evidence_json, agent_run_id, ip, request_id |
| `agent_run` | component (`A0`..`A11`), graph_name, cycle_loan_id, thread_id, started_at, finished_at, status, input_summary, output_summary, model_names_json, prompt_tokens, completion_tokens, cost_usd, steps, trace_url, error |
| `agent_suggestion` | agent_run_id, kind (`spread`, `cmr_section`, `recommendation`, `review_finding`, `extraction`, `challenge`, `narrative`, `explanation`, `reminder`, `monthly_rationale`), target_entity_type, target_entity_id, payload_json, confidence, status (`proposed`, `accepted`, `edited`, `rejected`), decided_by, decided_at, edit_distance |

### 5.11 Platform tables

| Table | Key columns |
| --- | --- |
| `ingestion_run` | source (`snowflake`, `duckdb`, `box`, `mailbox`), dataset, as_of, started_at, finished_at, rows, status (`success`, `failed`), error |
| `writeback_change` | target_schema, target_table, target_key_json, payload_json, before_json, mode (`synthetic_write`, `queue`, `api`), status (`pending`, `applied`, `failed`, `noop`), requested_by, requested_at, applied_by, applied_at, tiq_entity_type, tiq_entity_id, tiq_entity_version |
| `notification` | user_id, kind, entity_type, entity_id, cycle_id, title, body, created_at, read_at, emailed_at |
| `job` | kind, payload_json, natural_key, status (`queued`, `running`, `done`, `failed`), attempts, run_after, locked_by, locked_at, last_error |

## 6. Vector index

| Namespace | Chunks from | Used by |
| --- | --- | --- |
| `docs:<facility_id>` | borrower documents, Lincoln reports, sponsor letters | A2, A5, A9 |
| `cmr:<facility_id>` | current and prior CMR sections | A2 (prior quarter language), A9 |
| `decisions:<cycle_id>` | committee rationales, send-back notes, review comments | A7, A9 |
| `rules` | rule descriptions and checklists | A3, A9 |

Chunking: 400 to 800 tokens, 15 percent overlap, tables kept whole; embedding model configurable (default a small embedding model); hybrid retrieval (BM25 on `text` plus vector) with facility and period filters always applied.

## 7. Synthetic dataset

### 7.1 Shape

| Dimension | Count | Notes |
| --- | --- | --- |
| Borrowers | 22 | 22 deals; four borrowers have two facilities each, giving 26 facilities |
| Facilities | 26, of which 24 in scope | In scope: 20 term loans, 2 DDTL, 2 second-lien term loans. Out of scope: 2 revolvers (excluded from marks, included to test the scope filter) |
| Sponsors | 8 | Northgate Capital sponsors Harbor |
| Deal teams | 6 | Team Blue (Harbor), Team Green (Sunrise), Team Red (Maple), Team Amber, Team Grey, Team Violet |
| Quarters of history | 2 completed (2026-Q1, 2026-Q2) plus the live 2026-Q3 | Previous final marks, ratings and CMRs exist for every facility |
| Monthly cycles | 1 completed (August 2026) plus the live October 2026 | |
| Borrower packages | 22 for Q3 (one per borrower; a borrower with two facilities sends one package) | 3 format families (section 7.3); 4 late, 2 incomplete, 1 with a scanned page |
| Lincoln outputs | 2 versions of the marks file and 24 plus 1 reports (one per in-scope facility, plus Harbor's revision) | Version 2 contains only the revised Harbor row and report |
| Emails | roughly 120 | kickoff, packages, chases, Lincoln notes, impact notes, pack, approvals, distribution |
| Users | 22 | covering every role, with demo logins |

### 7.2 The worked example rows (must match the source notes exactly)

| Facility | Borrower | Team | Commitment | Coupon | Maturity | Previous mark | Previous rating | Watchlist before | Covenant |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- | --- |
| F-0001 | Maple Dental | Team Red | $40M | 9.0% | 2030-06-30 | 99.0 | 2 | no | max leverage < 4.00x |
| F-0002 | Harbor Logistics | Team Blue | $60M | 10.3% | 2029-09-30 | 97.0 | 3 | no | max leverage < 3.50x |
| F-0003 | Sunrise Foods | Team Green | $25M | 11.0% | 2029-03-31 | 80.0 | 5 | yes | max leverage < 4.50x |

Harbor Q3 2026 spread ground truth (USD millions): revenue 41.0 (same quarter last year 48.0), reported EBITDA 4.1 (was 7.2), severance add-back 0.3, adjusted EBITDA 4.4, LTM adjusted EBITDA 16.0, cash 1.4, total debt 60.0, net debt 58.6, yearly interest 6.2, leverage 3.75x, net leverage 3.66x, interest cover 2.58x (shown as about 2.6x), covenant max leverage 3.50x: fail, revenue change -15 percent, EBITDA change -43 percent. Harbor's coupon (10.3 percent) and three years to maturity make the indicative cross-check at a 16.5 percent required yield about 86.2, consistent with the source note; Lincoln's point of 86.5 blends in a recovery-based view.

Lincoln outputs, decisions and values:

| Facility | Lincoln v1 point | Range v1 | Yield v1 | Lincoln v2 | Range v2 | Yield v2 | G1 | Agenda tests | Committee | Final | Previous value | Final value |
| --- | ---: | --- | ---: | ---: | --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| F-0001 Maple | 99.25 | 98.75 to 99.75 | | | | | approve | none | not on agenda | 99.25 | 39.60 | 39.70 |
| F-0002 Harbor | 86.5 | 85.0 to 88.0 | 16.5% | 88.0 | 86.5 to 89.5 | 15.5% | send back, then approve 88.0 | watchlist, downgrade | approve 88.0, rating 5, stay on watchlist, waiver approved with conditions | 88.0 | 58.20 | 52.80 |
| F-0003 Sunrise | 89.0 | 87.5 to 90.5 | | | | | approve | watchlist, move 11.25% | change to 88.5 | 88.5 | 20.00 | 22.125 |

Portfolio checkpoints for the three loans: previous $117.80M; after Lincoln v1 $113.85M (delta -$3.95M); after Harbor revision $114.75M (delta -$3.05M, improvement $0.90M); final $114.625M (delta -$3.175M). The other 21 loans are generated so that their deltas net to zero at each checkpoint, so the portfolio totals in the demo equal these three-loan totals. Sunrise's Everest pricing panel row is seeded with 89.0 after the committee so that reconciliation finds the mismatch.

Other seeded situations: one more watchlist loan (Team Amber) that passes G1 and the committee unchanged; one loan (Team Grey) where the Deal Team uses the G1 outcome "approve at a different mark" with a rationale and lands 0.5 below Lincoln's range, so agenda test 4 fires; one borrower whose package arrives on Day 12 (late); one whose covenant certificate is missing until chased; two DDTL facilities with draws in October for the monthly rebalance.

### 7.3 Borrower package format families

| Family | Looks like | Why |
| --- | --- | --- |
| A, "management accounts" | Excel workbook with an income statement, balance sheet and a notes tab; line names differ from the template (for example "Freight revenue plus fuel surcharge income") | Tests mapping of unfamiliar labels |
| B, "audited style PDF" | Text PDF with formal statements, footnotes with one-off items (Harbor's severance footnote) | Tests footnote-driven add-backs |
| C, "scanned pack" | PDF of page images with a cover letter, some tables as images | Tests OCR and low-confidence flags |

Every package also has a covenant certificate (PDF, one page, the borrower's own covenant calculation, sometimes wrong on purpose) and, for watchlist loans, a sponsor letter. Harbor's package includes the Northgate Capital letter (6 October 2026, $5M commitment; the funds arrive on 30 October, before the committee meets) and a waiver request.

### 7.4 Generator design

- Python package `synth/` with deterministic seeds; `make synth` produces parquet files per Snowflake table, PDFs and XLSX via reportlab and openpyxl, `.eml` files, and a `ground_truth/` folder with the expected spread values, classifications, agenda results and reconciliation mismatches per facility.
- Loader `synth load --target snowflake|duckdb` creates the schemas and loads the tables; `synth seed-app` loads users, rule config, calendar templates and email templates into Postgres; `synth play --until Q11` drives the mailbox and Box with the right files in day order so a demo can be started from any step.
- Reset: `synth reset` drops and reloads everything.

## 8. Rules configuration (initial values, all `assumed` unless noted)

| Key | Value | Confirmed |
| --- | --- | --- |
| `calendar.quarterly` | phases as in Transorg Functional Spec.md section 0; step deadlines in the table below | no |
| `cycle.length_days` | 45 | no |
| `intake.required_docs.standard` | financial_statements, covenant_certificate | no |
| `intake.required_docs.watchlist` | plus sponsor_letter | no |
| `chase.cadence_days` | -3, 0, +2, +4, +6 | no |
| `spread.addback_allowlist` | severance, restructuring, non_recurring_legal | no |
| `spread.ltm_quarters` | 4 | no |
| `review.stage_order` | ac_manager, pm_team, file, sct | no |
| `review.checklist.pm_team` | ratios_on_ltm, addbacks_allowed, recommendation_consistent, evidence_attached | no (from the source note) |
| `agenda.tests` | watchlist, downgrade, mark_move_10pct, outside_lincoln_range, g1_unresolved | no (the fifth is a ABIQ addition) |
| `agenda.mark_move_threshold` | 0.10 | no |
| `agenda.manual_add_allowed` | true | no |
| `g1.max_send_back_loops` | 3 | no |
| `g1.allow_different_mark` | true (Deal Team may approve at a mark other than Lincoln's point, with a rationale) | no (DQ15, DQ18) |
| `g1.co_decision_required` | false | no |
| `committee.send_back_allowed` | true (loop QF) | no (DQ18) |
| `classify.confidence_threshold` | 0.8 | n/a (POC choice) |
| `cert.tolerance` | 0.05x (covenant certificate vs ABIQ ratio) | no |
| `committee.outcomes` | approve, change, send_back, defer, request_information | no |
| `committee.rationale_required_for` | change, send_back, defer | no |
| `reconciliation.checks` | the four check codes in 5.8 | no |
| `reconciliation.mark_tolerance` | 0.0 | no |
| `monthly.ddtl.mark_applied_to` | funded | no |
| `source.dealcloud.location` | snowflake | yes (user) |
| `source.everest.location` | snowflake | yes (user) |
| `source.sentry.location` | snowflake | no |
| `writeback.mode` | synthetic_write | n/a (POC choice; production default `queue`) |


Default step deadlines for the quarterly calendar (Day 0 is quarter end; days marked * come from the source notes, the rest are interpolated and assumed):

| Step | Deadline (day) | Step | Deadline (day) |
| --- | ---: | --- | ---: |
| Q1 kickoff sent | 1* | Q12 marks loaded to Everest | 28 |
| Q2 borrower packages due | 8* (received Days 3 to 8*) | Q13 Lincoln reports copied | 28 |
| Q3 package shared with Lincoln | 9* | Q14 G1 decision | 31* |
| Q4 and Q5 spread and CMR draft | 18 | Q15 mark attached to CMR | 31* |
| Q6 A/C Manager review | 19* | Q16 agenda built | 36 |
| Q7 PM Team review | 21 | Q17 pack sent | 38 |
| Q8 CMR filed | 24 | Q18 committee meeting | 42 |
| Q9 SCT review | 26 | Q19 reconciliation clean | 44 |
| Q10 Lincoln first draft | 20* (re-drafts through 26) | Q20 written approval | 44 |
| Q11 tracker and impact note | 27 | Q21 governance sign-off | 44 |
| | | Q22 distribution, cycle closed | 44* |

## 9. Data quality and lineage rules

- Every numeric value shown in the UI carries its origin: `source` (Snowflake table and row, document and page, agent run, user edit) and `as_of`.
- A spread line without evidence is shown with a grey "no evidence" chip and cannot be approved without a note.
- Lincoln values are never edited by hand; a correction is a new Lincoln version or a discrepancy record.
- Marks are stored to four decimals and displayed to two. Ratios are stored to four decimals and displayed to two (3.44x); narrative text generated from them may round to one decimal where the source does (3.4x), and the exact figure is always one hover away.
- The tracker is recomputed from its sources on every change; it is never a hand-edited table. The Excel export is a view.
- Deleting is not allowed on business entities; superseding is.
