import { HelpCircle, X } from "lucide-react";
import { useEffect } from "react";

/** "How this screen works" (Design.md 8.12): a short intro and numbered steps for the current route. */
const HELP: [RegExp, string, string, string[]][] = [
  [/^\/work/, "My Work", "Everything that needs you, worked out from the cycle. Nothing to chase.", ["Each card is one action with the step it belongs to.", "Go opens the exact screen and item.", "Waiting on others shows what you are not blocked on.", "The process strip shows how far every loan has got."]],
  [/^\/messages/, "Messages", "Internal communication stays in TIQ. Email is only for borrowers and Lincoln.", ["Kickoff, impact notes, the committee pack and approvals arrive here.", "Attachments open in a new tab or download.", "Send a new message to any colleague from the top right."]],
  [/^\/dashboard/, "Cycle dashboard", "Where the quarter stands across every loan and team.", ["KPIs show the portfolio value so far and gates passed.", "The lanes show each loan's step; click a loan to open it.", "Attention lists anything overdue."]],
  [/^\/universe/, "Loan universe", "The loans in scope for the quarter, read from the warehouse.", ["Filter by team, rating or valuation method.", "Change a loan's valuation method with a reason.", "Refresh pulls the latest positions."]],
  [/^\/kickoff/, "Kickoff", "Create the cycle and send the kickoff, inside TIQ.", ["Create the cycle from the warehouse.", "Check the calendar; every assumed date is marked.", "Confirm ownership, preview one message per team, then send."]],
  [/^\/intake/, "Intake", "Borrower packages, tracked against what is required.", ["Pick a loan to see its documents and how TIQ classified them.", "Accept or change any classification below the confidence threshold.", "Send the reminders TIQ drafted for late borrowers.", "Share complete packages with Lincoln."]],
  [/^\/lincoln/, "Lincoln exchange", "Packages to Lincoln, draft marks back, loads to Everest and SharePoint.", ["Share all complete packages in one action.", "Lincoln's marks arrive in Box and are read automatically.", "Load to Everest and copy to SharePoint when ready."]],
  [/^\/loans\/[^/]+/, "Loan workspace", "One loan from documents to the Gate 1 decision.", ["Spread: run the spreading agent, check add-backs, approve.", "CMR: draft with TIQ, accept or edit each section, submit.", "Pricing (G1): compare Lincoln with what the deal team knows, then decide.", "Lineage: where every number came from."]],
  [/^\/loans/, "Loans", "Every loan in the cycle with its step and status.", ["Search or filter, then open a loan."]],
  [/^\/reviews/, "Review queue", "A/C Manager, PM Team and SCT reviews, then filing.", ["Pick a CMR waiting at your stage.", "Comment on a section; comments go straight to the analyst.", "Pass, or send back with at least one comment.", "The PM Team files and re-files the report."]],
  [/^\/pricing/, "Pricing panel", "Gate 1 for your team's loans.", ["Open a loan to see Lincoln's mark next to the evidence.", "Run the challenge assistant, then approve or send back."]],
  [/^\/tracker/, "Marks tracker", "Derived from its sources on every change, never hand-edited.", ["Previous, Lincoln, deal team, committee and final marks side by side.", "Draft the impact note with TIQ and send it to Finance."]],
  [/^\/committee/, "Valuation committee", "Agenda, pack and meeting for Gate 2.", ["Run the agenda tests and build the agenda.", "Build the pack and send it to the committee.", "Organise the meeting; the invitation goes out in TIQ.", "During the meeting the chair records each decision."]],
  [/^\/reconciliation/, "Reconciliation", "TIQ against Everest, the CMRs and positions.", ["Run reconciliation.", "Each break shows both values and the explainer agent's reason.", "Correct the right side, then run again until it is clean."]],
  [/^\/approvals/, "Approvals", "Written approval of the final marks and governance sign-off.", ["The PM Team sends the request.", "The chair approves; governance signs off (Gate 3)."]],
  [/^\/distribution/, "Distribution", "Send the final marks and close the cycle.", ["Check the recipients and files.", "Send and close the cycle."]],
  [/^\/inbox/, "External mail", "Email with parties outside AllianceBernstein.", ["Borrower packages to the deal teams, PM Team copied.", "Reminders to borrowers and send-backs to Lincoln.", "Download any attachment or the original email."]],
  [/^\/lineage/, "Lineage", "Where a number came from.", ["Pick a loan; every document, agent run, review and decision is listed with who and when."]],
];

export function helpFor(path: string) {
  return HELP.find(([re]) => re.test(path));
}

export default function HelpPanel({ path, onClose }: { path: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const h = helpFor(path);
  return (
    <>
      <div className="anim-scrim fixed inset-0 z-[45]" style={{ background: "rgba(11,20,55,.25)" }} onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label="How this screen works" className="anim-panel fixed inset-y-0 right-0 z-[46] flex w-[min(420px,100vw)] flex-col bg-white shadow-raised">
        <div className="flex h-[60px] items-center justify-between border-b border-line-200 px-5">
          <h2 className="flex items-center gap-2 text-base font-bold"><HelpCircle size={18} className="text-brand-600" aria-hidden="true" /> How this screen works</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {h ? (
            <>
              <h3 className="text-[15px] font-semibold">{h[1]}</h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-slate-500">{h[2]}</p>
              <ol className="mt-4 space-y-3">
                {h[3].map((s, i) => (
                  <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed text-ink-700">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{i + 1}</span>{s}
                  </li>))}
              </ol>
            </>
          ) : <p className="text-[13.5px] text-slate-500">Agents prepare every step; people decide. My Work always lists what needs you next.</p>}
        </div>
      </aside>
    </>
  );
}
