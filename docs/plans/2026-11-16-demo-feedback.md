# Plan: demo feedback round (16 Nov 2026)

Status: **approved 16 Nov 2026**. Decisions recorded as D22 to D27 in `docs/decisions.md`.

Source: the PM's feedback list of 16 Nov 2026, and clarifications given the same day:
- `stone-sage-ui-design.md` governs the **frontend look only**. The other requests may change the backend.
- Portfolio: keep 5 loans, the 3 story loans plus 2 routine ones.
- "Negative spacing" means whitespace and layout.
- Challenge Assistant: fix the **output layout**.

## Spec changes to record first

These depart from `docs/specs/`. Each one goes in `docs/decisions.md` and the tracker's Decisions tab before its part starts.

| # | Change | Spec affected |
|---|---|---|
| D-a | Demo portfolio cut to 5 in-scope loans: F-0001, F-0002 Harbor, F-0003 Sunrise, F-0004, F-0006. The story totals ($117.80M → $114.625M) stay, because they are computed on the story loans | Master Spec section 1 (portfolio), Data Spec (synthetic universe) |
| D-b | Demo autopilot is on by default for every loan except Harbor; the "Autofill other loans" button is removed | Demo script only (autopilot is a demo device, not a spec feature) |
| D-c | Ask TIQ moves from the sidebar to a floating chat button at the bottom right | Master Spec screen list (S-Ask) |
| D-d | Frontend restyled to Stone & Sage (`stone-sage-ui-design.md`), replacing the current Design.md look | Design.md |
| D-e | Automatic deadline reminders to every task owner (e.g. "2 days left"), plus manual reminders from the PM Team | Functional Spec (chasing, A10) |
| D-f | CMR "tell TIQ what it missed": the analyst gives an instruction and the agent redrafts the section. The draft stays a suggestion; the analyst still accepts it | Agentic AI Spec A2 |

## Parts

One branch and one pull request per part. Order is by demo risk: fixes first, then features, then the restyle (which touches every screen, so it goes last to avoid merge churn).

### Part 1. Bulk copy to SharePoint (bug), branch `p2/2.1-sharepoint-copy`
- **Finding so far:** the endpoint copies only the reports that have not been copied yet, and the button gives no feedback. The phase card stays on "Now: Copy to SharePoint" until *every* in-scope loan passes Q13. A loan whose Lincoln draft is not loaded to Everest yet, or Harbor (never autofilled), keeps it there. **To verify against the live database** (Docker was down when I looked).
- Fix: show the result ("Copied 3 reports; 2 waiting for Lincoln's report"), and say on the phase card which loans are holding the step.
- Test: route test for the counts and the step advance.

### Part 2. Faster Everest loading and autofill (latency), branch `p2/2.2-latency`
- Bulk load to Everest makes one select and one write per loan, each a Snowflake round trip (80 to 130 ms per call measured; writes are slower). Change: one batched `MERGE` per bulk action.
- Autofill (from the 13 Nov investigation): read covenants, template and undrawn amounts once per loan instead of on every metrics recompute; batch the Everest spread writes; recompute the tracker once per loan instead of after every step.
- Target: bulk Everest load under 3 s for 5 loans, and an autofill pass under 10 s.
- Test: count warehouse calls in a DuckDB test (a regression guard, since tests never touch Snowflake).

### Part 3. 5-loan portfolio and autofill always on, branch `p2/2.3-five-loans-autofill`
- Synthetic universe trimmed to the 5 loans in D-a; all seeds, scripted events and the eval set updated; story totals checked.
- Autopilot setting defaults to "all except F-0002" on reset; the button and its badge are removed from Demo controls ("Clear cycle" and the outside-world events stay).
- Demo scripts updated (both the technical and the business script).
- Test: reset → play to Q22 reproduces the story numbers; autopilot runs without being switched on.

### Part 4. Reminders, branch `p2/2.4-reminders`
- **Automatic:** when the demo clock advances, every open task due within 2 days (configurable rule `reminder.lead_days`) sends its owner an in-app notification and message: "2 days left to complete Q6 A/C Manager review for Harbor Logistics (due 21 Oct)". There is one reminder per task per threshold (2 days, due today, overdue), so nobody is spammed. This builds on the existing reminder service.
- **Manual:** PM Team gets a "Send reminder" action on My Work, the Tracker and each loan's task list, with an editable message, for a person or a whole step. Every reminder is audited.
- Test: advancing the clock creates exactly one reminder per threshold; manual send is PM-only.

### Part 5. CMR: tell TIQ what it missed, and a better CMR output, branch `p2/2.5-cmr-rewrite`
- In the CMR editor, every section gets "Tell TIQ what's missing". The analyst types an instruction, e.g. "add the truck appraisal date and customer concentration". A2 redrafts that section using the current text, the instruction and the loan's documents and spread. The result is shown **as a suggestion** next to the current text, with Accept, Edit or Reject (agents prepare, people decide). Each instruction and redraft is stored on the agent run.
- "Draft all with TIQ" accepts an optional instruction for the whole CMR.
- CMR in the editor and the read view: clear section separation (numbered headings, hairline dividers, consistent spacing), and citations shown as small chips under each section.

### Part 6. Report PDFs with structure, branch `p2/2.6-pdf-layout`
- The CMR PDF (`/api/cmr/{id}/pdf`) and the generated Lincoln report PDFs get a real layout. That means a header band with loan, period and version, boxed sections with a title bar, a bordered key-figures table (mark, range, rating, leverage vs covenant), a bordered recommendation block, and footer page numbers. ReportLab is already used, so no new dependency.
- Colours follow the Stone & Sage palette (graphite, sage, hairlines).

### Part 7. Challenge Assistant output layout, branch `p2/2.7-challenge-layout`
- Pricing (G1) tab: show the challenge as structured cards. Each card holds the assumption quoted from Lincoln, the finding, the evidence chips (open the document at the page), the math in a monospace block (55 / 16 = 3.4x vs 3.50x covenant), and the materiality badge. The draft send-back note goes below in an AI note with Copy and Use buttons. "TIQ suggests: consider send-back" stays a hint and is never pre-selected.

### Part 8. Ask TIQ as a floating chat, branch `p2/2.8-ask-tiq-launcher`
- Remove Ask TIQ from the sidebar and the top-bar search. Add a round launcher button at the bottom right on every page. It opens a chat panel (about 400 × 600, docked bottom right; full screen on phones) that keeps the conversation while you move between pages and knows the current page's loan or cycle.

### Part 9. Stone & Sage restyle (frontend only), branch `p2/2.9-stone-sage`
- Tokens from `stone-sage-ui-design.md` section 8 go into the global CSS and are mapped in `tailwind.config`. Remove every blue and purple class, and add light and dark themes.
- **Chips:** replace the current filled green and yellow pills with the guide's badge, a white chip with a hairline border, a 6px status dot and the word. This is the "looks Claude-ish" fix.
- Buttons (graphite primary, one per view), cards on hairlines with no shadows, tables, tabs, segmented filters, nav rail (sage active icon), toasts, empty and error states, and AI chip and AI note for everything an agent produced.
- **Whitespace:** apply the spacing scale everywhere (20px card padding, 16px grid gap, 24px between sections, 44px table rows, page width capped at 1320px), and fix the cramped areas found in screenshots (Lincoln table, CMR editor, phase cards).
- No API changes in this part.

### Part 10. Before vs now flow chart, branch `p2/2.10-process-flow`
- One long page (in-app at `/process`, plus a shareable artifact). It shows two swimlane flows side by side: the old process (email, Excel, re-keying between Box, Everest and SharePoint) and the TIQ process (the same 22 steps; agents prepare, people decide). Each step is marked manual, assisted or automated.
- **% manual effort reduced:** the specs hold no baseline hours. Proposed method: count the manual actions per step before and now (re-keying, copying, chasing, drafting from blank), and show the reduction per step and overall. The count method is stated on the page. **If the client has baseline hours per step, send them and the page will use those instead.**

## Exit demo

From a reset with 5 loans:
1. Autofill runs by itself.
2. Present Harbor end to end, with the new reminders firing as the clock moves.
3. Show the "tell TIQ what's missing" redraft on Harbor's CMR.
4. Show the new Challenge Assistant layout and the bordered PDFs.
5. Ask TIQ works from the floating button on every page.
6. Every screen is in Stone & Sage, light and dark.

## Answered in this round (no code needed)

**Where does the Deal Team get Lincoln's report to compare by hand?** There are two places:
- On the loan page, the **Pricing (G1)** tab has one card per Lincoln version, each with a **report** button.
- On the **Lincoln exchange** page, the "Lincoln report" column links each loan's latest report.

Once copied, the official copy is also in SharePoint under `PrivateCredit/Valuation/2026-Q3/Lincoln/`.
