# Demo script: 2026-Q3 marks cycle (Harbor Logistics)

Open http://localhost:5173. Every password is `demo`. On screen, steps show as numbers (Q14 appears as 14) and there is no day counter. Use **My Work** at each step: it lists the signed-in user's next action, with a **Go** button.

## 0. Before the demo

```bash
cd infra && docker compose up -d          # Postgres + API
cd apps/web && npm run dev                # web
```

1. Sign in as `pm.analyst@ab-poc.local`.
2. Click **Clear cycle** (top bar) and wait until it reaches Q0.
3. Nothing to switch on: after a clear, every loan except Harbor (F-0002) moves on by itself as the clock moves, so the demo shows only Harbor.

| Who | Login |
|---|---|
| PM Team | `pm.analyst@ab-poc.local` |
| Harbor Deal Team (Team Blue) | `team.blue.analyst@` / `team.blue.lead@ab-poc.local` |
| A/C Manager | `acm.one@ab-poc.local` |
| SCT | `sct.reviewer@ab-poc.local` |
| Valuation Committee chair | `vc.chair@ab-poc.local` |
| Governance | `governance@ab-poc.local` |

## 1. Kickoff and intake (Q1 to Q3): PM Team

1. **Q1 Kickoff:** create the cycle from Snowflake (5 loans), check the calendar, preview the message for each team, then **send the kickoff inside TIQ**. Internal communication never uses email.
2. **Outside world:** in Demo controls, click **Borrowers send their packages**, then **Late borrowers reply to the reminders**. Borrowers email their financials to the deal teams, with the PM Team copied. (There is no clock on screen; this one button always names what borrowers or Lincoln do next.)
3. **Q2 Intake:** in **External mail** (Inbox), TIQ has pulled out each attachment and classified it. It also tracks each package and drafts reminders to borrowers who are late.
4. **Q3 Share with Lincoln:** **Share all complete packages** sends them to Lincoln in one click (no manual download and upload).

## 2. Modelling and CMR (Q4 to Q9): Harbor

5. **Q4 Spread** (`team.blue.analyst`): A1 proposes the spread from the borrower's financials. The analyst checks the add-backs and approves. Leverage is **3.75x against a 3.50x covenant**, which is a breach.
6. **Q5 CMR:** A2 drafts each section, the analyst edits and accepts, A3 runs the checks, and the analyst submits.
7. **Q6 A/C Manager review** (`acm.one`): passed.
8. **Q7 PM Team review** (`pm.analyst`): send it back with 3 comments (appraisal date, customer concentration, sponsor support). The analyst fixes them, attaches the sponsor letter and resubmits. The PM Team passes it.
9. **Q8:** the CMR is filed to SharePoint and written to Everest.
10. **Q9 SCT review** (`sct.reviewer`): one comment, "State the waiver conditions". The analyst resolves it and the CMR is re-filed as v2.

## 3. Valuation and Gate 1 (Q10 to Q14)

11. **Q10 Lincoln:** click **Lincoln sends draft marks**. Lincoln's draft marks arrive: Harbor **86.5** (range 85.0 to 88.0).
12. **Q11 Impact note:** the PM Team sends it in TIQ. Story-loan delta is **−3.95M**.
13. **Q12/Q13:** the PM Team loads the marks to Everest and copies them to SharePoint.
14. **Gate 1** (`team.blue.lead`): run the **A5 challenge**. It uses the sponsor's 55 / 16 = 3.4x, which is inside the covenant. **Send back** to Lincoln with the TIQ-drafted note.
15. Click **Lincoln sends the revised valuation**. **Lincoln v2: 88.0** arrives, and the PM Team loads it.
16. **Gate 1 again:** the lead **approves 88.0**. Impact note v2 shows **−3.05M**.

## 4. Valuation Committee, Gate 2 (Q15 to Q18)

17. **Q16 Agenda** (`pm.analyst`): TIQ builds it from the rules: **Harbor, Sunrise, Orchard**.
18. **Q17 Pack:** build the committee pack and send it in TIQ.
19. **Organise meeting:** TIQ drafts the date, time slots and attendees. Edit if needed, then **Send invitation in TIQ**. Attendees get the message, a calendar file (.ics) and the pack.
20. **Q18 Meeting** (`vc.chair`, Committee → Meeting tab):
    - Harbor: **Approve 88.0**
    - Sunrise: **Change the mark** from 89.0 to **88.5** and enter a rationale. The screen shows the value impact and the Lincoln range.
    - Orchard: **Approve**
    - If a decision is recorded wrongly, use **Revise decision** with a reason. The earlier decision is kept and audited.

## 5. Close (Q19 to Q22)

21. **Q19 Reconciliation** (`pm.analyst`): run it. TIQ finds **one break: Sunrise is 88.5 in TIQ but 89 in Everest**. Resolve it (correct Everest), then **re-run**. The result is clean.
22. **Q20 Written approval:** the PM Team requests approval of the final marks, and `vc.chair` approves.
23. **Q21 Governance, Gate 3** (`governance`): sign off.
24. **Q22 Distribute** (`pm.analyst`): send the final marks in TIQ. The cycle closes.

**End result for the 3 story loans:** **114.625M**, down from 117.8M (**−3.175M**). Maple Dental 99.25, Harbor 88.0, Sunrise 88.5.

## Points to make during the demo

- **Agents prepare, people decide.** No gate decision is made by an agent (the audit trail shows only human roles).
- **Lineage** (Harbor): every number traces back to its source document, agent run and decision.
- **Tracker:** the live mark and value for each loan through the cycle.
- **Messages:** internal communication stays in TIQ. Email is only for borrowers and Lincoln.
