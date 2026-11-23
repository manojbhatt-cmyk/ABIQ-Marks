import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Hourglass,
  Layers,
  MessagesSquare,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmt, ROLE_LABEL, useApi } from "../api";
import { Card, Chip, Empty, ErrorState, Loading, MoveChip } from "../components/ui";
import DemoControls from "../components/DemoControls";
import { DeadlineRow, DueChip, RemindButton } from "../components/Reminders";
import { useApp } from "../context";

/* Phases are told apart by their names, not by colour (Design.md 1.2: colour has a job). */
export const PHASE_STYLE = [
  { name: "Kickoff and intake", steps: ["Q1", "Q2", "Q3"] },
  { name: "Modelling and CMR", steps: ["Q4", "Q5", "Q6", "Q7", "Q8", "Q9"] },
  { name: "Lincoln draft marks", steps: ["Q10", "Q11", "Q12", "Q13"] },
  { name: "Deal Team approval", steps: ["Q14", "Q15"] },
  { name: "Valuation Committee", steps: ["Q16", "Q17", "Q18"] },
  { name: "Finalise and distribute", steps: ["Q19", "Q20", "Q21", "Q22"] },
];

export const STEP_LINK: Record<string, string> = {
  Q1: "/kickoff", Q2: "/intake", Q3: "/lincoln", Q4: "/loans", Q5: "/loans", Q6: "/reviews", Q7: "/reviews", Q8: "/reviews", Q9: "/reviews",
  Q10: "/lincoln", Q11: "/tracker", Q12: "/lincoln", Q13: "/lincoln", Q14: "/loans", Q15: "/loans", Q16: "/committee", Q17: "/committee",
  Q18: "/committee/meeting", Q19: "/reconciliation", Q20: "/approvals", Q21: "/approvals", Q22: "/distribution",
};

const who = (e: string) => e.split("@")[0];

const LOOP_LABEL: Record<string, string> = {
  QA: "sent back to Lincoln",
  QB: "CMR sent back",
  QC: "Lincoln revised",
  QF: "committee sent back",
};

/* ---------------- SECTION 2: QUARTERLY PROCESS TIMELINE ---------------- */
export function ProcessStrip({ process }: { process: any[] }) {
  const nav = useNavigate();
  if (!process?.length) return null;
  const doneAll = process.filter((s) => s.state === "done").length;
  const pct = Math.round((doneAll / process.length) * 100);

  return (
    <section className="card p-5 shadow-sm" aria-label="Quarterly process progression">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400 border border-brand-200/60 dark:border-brand-800/40">
            <Layers size={17} />
          </div>
          <div>
            <h2 className="text-[14.5px] font-bold text-ink tracking-tight">Quarterly Process Overview</h2>
            <p className="text-[12px] text-muted">22 governance steps across six valuation phases</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-brand-600 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-bold text-brand-700 dark:text-brand-400 num">{pct}%</span>
          </div>
          <span className="badge badge-gray font-semibold num !text-[11.5px] border-line">
            {doneAll} of {process.length} steps complete
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {PHASE_STYLE.map((ph, i) => {
          const steps = process.filter((x) => ph.steps.includes(x.step));
          const done = steps.filter((x) => x.state === "done").length;
          const active = steps.find((x) => x.state === "active");
          const state = done === steps.length ? "done" : active || done ? "active" : "todo";
          const target = active || steps.find((x) => x.state !== "done") || steps[steps.length - 1];

          return (
            <button
              key={ph.name}
              onClick={() => target && nav(STEP_LINK[target.step])}
              className={`card-hover group relative flex min-h-[118px] flex-col rounded-card border p-3.5 text-left transition-all ${
                state === "active"
                  ? "border-brand-500 bg-brand-50/40 dark:bg-brand-950/30 shadow-sm ring-1 ring-brand-500/20"
                  : state === "done"
                  ? "border-line bg-surface hover:border-strong"
                  : "border-line/70 bg-surface-2/60 opacity-80 hover:opacity-100 hover:border-strong"
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold num ${
                    state === "done"
                      ? "bg-success-500 text-white"
                      : state === "active"
                      ? "bg-brand-600 text-white"
                      : "bg-surface-3 text-muted"
                  }`}
                >
                  {state === "done" ? <CheckCircle2 size={13} /> : i + 1}
                </span>
                <span
                  className={`badge !text-[10px] !py-0 !h-[19px] font-semibold ${
                    state === "done"
                      ? "badge-green"
                      : state === "active"
                      ? "badge-amber"
                      : "badge-gray"
                  }`}
                >
                  {state === "done" ? "Done" : state === "active" ? "Active" : "Upcoming"}
                </span>
              </div>

              <div className={`mt-2 text-[12.5px] font-bold leading-snug line-clamp-1 ${state === "todo" ? "text-muted" : "text-ink"}`}>
                {ph.name}
              </div>

              <div className="mt-auto pt-2.5">
                <div className="flex gap-1">
                  {steps.map((x) => (
                    <span
                      key={x.step}
                      title={`${x.step}: ${x.name} (${x.done}/${x.total} loans)`}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        x.state === "done"
                          ? "bg-success-500"
                          : x.state === "active"
                          ? "bg-brand-500 animate-pulse"
                          : "bg-surface-3"
                      }`}
                    />
                  ))}
                </div>
                <div className="mt-1 truncate text-[11px] font-medium text-muted group-hover:text-ink transition-colors">
                  {state === "active" && active ? active.name : `${done}/${steps.length} steps`}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- SECTION 3: WORK PRIORITIES (DEADLINES PANEL) ---------------- */
function PrioritiesDeadlines({ cycle, limit = 5 }: { cycle: any; limit?: number }) {
  const { user } = useApp();
  const { data, reload } = useApi<DeadlineRow[]>(cycle ? `/cycles/${cycle.id}/deadlines/status` : null, [cycle?.id, cycle?.day]);
  const [sent, setSent] = useState<string | null>(null);

  if (!cycle || !user) return null;
  const pm = user.role === "pm_team" || user.role === "admin";
  const rows = (data || []).filter((r) => pm || r.owners.includes(user.email));

  return (
    <div className="card flex h-full flex-col p-5 shadow-sm">
      <div className="mb-3.5 flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-brand-600" />
          <h2 className="text-[14.5px] font-bold text-ink tracking-tight">Upcoming Deadlines</h2>
        </div>
        <span className="badge badge-gray font-semibold num !text-[11px]">
          {rows.length} {rows.length === 1 ? "milestone" : "milestones"}
        </span>
      </div>

      {sent && (
        <div role="status" className="mb-2.5 rounded-control border border-line bg-surface-2 px-3 py-1.5 text-xs text-ink font-medium">
          {sent}
        </div>
      )}

      <div className="flex-1">
        {rows.length > 0 ? (
          <ul className="divide-y divide-line/70">
            {rows.slice(0, limit).map((r) => (
              <li key={`${r.step}-${r.cycle_loan_id}`} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink" title={`Step ${String(r.step).replace("Q", "")}: ${r.step_name}`}>
                    {r.loan ? <b className="font-semibold text-brand-700 dark:text-brand-400">{r.loan}: </b> : null}
                    {r.step_name}
                  </div>
                  <div className="truncate text-[11.5px] text-muted mt-0.5">
                    {r.owners.map(who).join(", ")} · Day {r.due_day}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <DueChip days={r.days_left} />
                  <RemindButton
                    row={r}
                    onSent={() => {
                      setSent(`Reminder sent: ${r.step_name}${r.loan ? ` for ${r.loan}` : ""}.`);
                      reload();
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center py-6 text-center">
            <CheckCircle2 size={24} className="text-muted/60 mb-2" />
            <div className="text-[13px] font-semibold text-ink">No open deadlines</div>
            <div className="text-xs text-muted max-w-[220px] mt-0.5">Steps appear here once the cycle is actively progressing.</div>
          </div>
        )}
      </div>

      {rows.length > limit && (
        <div className="mt-2 pt-2 border-t border-line text-center text-[11.5px] text-muted">
          and {rows.length - limit} more milestone{rows.length - limit === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

/* ---------------- SECTION 4: WHERE EACH LOAN STANDS (FULL WIDTH) ---------------- */
function FullWidthLoanTable({ loans }: { loans: any[] }) {
  const nav = useNavigate();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="card p-5 shadow-sm" aria-label="Loan portfolio status table">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3.5">
        <div>
          <h2 className="text-[15px] font-bold text-ink tracking-tight flex items-center gap-2">
            Where Each Loan Stands
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Autonomous loan progression across governance checkpoints. Click any loan to inspect rework loops and decision history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-gray font-semibold num !text-[11.5px] border-line">
            {loans.length} Facilities
          </span>
        </div>
      </div>

      {/* DESKTOP TABLE: 5 Columns with proportional widths, no horizontal scrolling */}
      <div className="hidden md:block overflow-hidden">
        <table className="w-full table-fixed text-left border-collapse">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-[11.5px] font-bold uppercase tracking-wider text-ink">
              <th className="py-2.5 px-3 w-[24%]">Facility & Deal Team</th>
              <th className="py-2.5 px-3 w-[20%]">Current Step</th>
              <th className="py-2.5 px-3 w-[24%]">Waiting On</th>
              <th className="py-2.5 px-3 w-[16%]">Lincoln Status</th>
              <th className="py-2.5 px-3 w-[16%]">Governance Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {loans.map((l) => (
              <Fragment key={l.id}>
                <tr
                  className="group cursor-pointer transition-colors hover:bg-surface-2"
                  onClick={() => setOpen(open === l.id ? null : l.id)}
                >
                  {/* 1. Facility & Deal Team */}
                  <td className="py-3 px-3 align-top">
                    <div className="font-bold text-[13.5px] text-ink leading-snug group-hover:text-brand-700 dark:group-hover:text-brand-400 transition-colors">
                      {l.borrower}
                    </div>
                    <div className="text-[11.5px] text-muted mt-0.5 flex items-center gap-1.5">
                      <span className="num font-semibold text-faint">{l.facility_id}</span>
                      <span>·</span>
                      <span>{l.team}</span>
                    </div>
                  </td>

                  {/* 2. Current Step */}
                  <td className="py-3 px-3 align-top">
                    <div className="text-[13px] font-semibold text-ink leading-snug">
                      {l.now}
                    </div>
                    <div className="text-[11.5px] text-muted mt-0.5 flex items-center gap-1.5">
                      <span className="badge badge-gray !py-0 !h-[18px] !text-[10.5px] num">
                        Step {String(l.step || "").replace("Q", "")}
                      </span>
                    </div>
                  </td>

                  {/* 3. Waiting On */}
                  <td className="py-3 px-3 align-top">
                    <div className="text-[13px] text-ink leading-snug">
                      {l.waiting_on}
                    </div>
                    <div className="mt-1">
                      {l.due_day != null && (
                        l.late_days > 0 ? (
                          <span className="text-[11.5px] font-semibold text-danger-600 num flex items-center gap-1">
                            <AlertCircle size={12} />
                            {l.late_days} day{l.late_days === 1 ? "" : "s"} overdue (Day {l.due_day})
                          </span>
                        ) : (
                          <span className="text-[11.5px] text-muted num">
                            Due Day {l.due_day}
                          </span>
                        )
                      )}
                    </div>
                  </td>

                  {/* 4. Lincoln Status */}
                  <td className="py-3 px-3 align-top">
                    <span className={`badge !text-[11px] ${l.lincoln === "Not shared" ? "badge-gray" : "badge-info"}`}>
                      {l.lincoln}
                    </span>
                  </td>

                  {/* 5. Governance Flags */}
                  <td className="py-3 px-3 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {Object.entries(l.loops || {})
                        .filter(([, n]) => (n as number) > 0)
                        .map(([k, n]) => (
                          <Chip key={k} tone="amber">
                            {LOOP_LABEL[k] || k} {(n as number) > 1 ? `×${n}` : ""}
                          </Chip>
                        ))}
                      <MoveChip move={l.move} quiet />
                      {!Object.entries(l.loops || {}).some(([, n]) => (n as number) > 0) && !l.move && (
                        <span className="text-[11.5px] text-faint">—</span>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded Decision History Row */}
                {open === l.id && (
                  <tr className="bg-surface-2/70 border-b border-line">
                    <td colSpan={5} className="p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-4 mb-2.5">
                        <div className="text-[11.5px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                          <Clock size={13} /> Loan Journey & Decision History ({l.borrower})
                        </div>
                        <button
                          className="btn btn-secondary btn-sm gap-1.5 text-xs font-semibold"
                          onClick={(e) => {
                            e.stopPropagation();
                            nav(`/loans/${l.id}`);
                          }}
                        >
                          <span>Open Loan Workspace</span>
                          <ExternalLink size={13} />
                        </button>
                      </div>

                      {(l.journey || []).length ? (
                        <ol className="flex flex-wrap items-center gap-2 text-[12px]">
                          {l.journey.map((j: any, k: number) => (
                            <li key={k} className="flex items-center gap-2">
                              {k > 0 && <span className="text-faint" aria-hidden="true">→</span>}
                              <span
                                className={`rounded-control border px-2.5 py-1 text-xs font-medium ${
                                  j.kind === "back"
                                    ? "border-danger-200 bg-danger-50 text-danger-700 dark:bg-danger-950/40 dark:border-danger-800"
                                    : j.kind === "loop"
                                    ? "border-warning-200 bg-warning-50 text-warning-700 dark:bg-warning-950/40 dark:border-warning-800"
                                    : j.kind === "flag"
                                    ? "border-warning-200 bg-warning-50 text-warning-700 dark:bg-warning-950/40 dark:border-warning-800"
                                    : "border-line bg-surface text-ink"
                                }`}
                              >
                                <span className="num font-semibold text-muted">Day {j.day}:</span> {j.text}
                              </span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <div className="text-[12.5px] text-muted italic">
                          No decision events or rework loops recorded for this facility yet.
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* MOBILE / TABLET VIEW: Stacked Responsive Loan Summary Cards */}
      <div className="md:hidden space-y-3">
        {loans.map((l) => (
          <div
            key={l.id}
            className="rounded-card border border-line bg-surface p-4 text-left transition-colors hover:border-strong"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-[14px] text-ink">{l.borrower}</div>
                <div className="text-xs text-muted mt-0.5">{l.facility_id} · {l.team}</div>
              </div>
              <span className={`badge !text-[10.5px] ${l.lincoln === "Not shared" ? "badge-gray" : "badge-info"}`}>
                {l.lincoln}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs border-t border-line/60 pt-2.5">
              <div>
                <span className="text-muted block text-[11px]">Current Step</span>
                <span className="font-semibold text-ink">{l.now} (Step {String(l.step || "").replace("Q", "")})</span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Waiting On</span>
                <span className="text-ink">{l.waiting_on}</span>
                {l.due_day != null && (
                  <div className="mt-0.5">
                    {l.late_days > 0 ? (
                      <span className="text-danger-600 font-semibold num">{l.late_days}d overdue</span>
                    ) : (
                      <span className="text-muted num">Due Day {l.due_day}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between border-t border-line/60 pt-2.5">
              <div className="flex flex-wrap items-center gap-1">
                {Object.entries(l.loops || {})
                  .filter(([, n]) => (n as number) > 0)
                  .map(([k, n]) => (
                    <Chip key={k} tone="amber">
                      {LOOP_LABEL[k] || k}
                    </Chip>
                  ))}
                <MoveChip move={l.move} quiet />
              </div>
              <button
                className="btn btn-secondary btn-sm !h-[26px] !text-[11.5px] font-semibold"
                onClick={() => nav(`/loans/${l.id}`)}
              >
                Workspace →
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- MAIN WORK COMPONENT ---------------- */
export default function Work() {
  const { user, cycle } = useApp();
  const { data, error, loading, reload } = useApi<any>(`/work${cycle ? `?cycle_id=${cycle.id}` : ""}`, [cycle?.id, cycle?.day]);
  const msgs = useApi<any[]>("/messages", [cycle?.day]);
  const nav = useNavigate();

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;

  const actions = (data.items || []).filter((i: any) => i.kind === "action");
  const waiting = (data.items || []).filter((i: any) => i.kind === "waiting");
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const firstName = user ? user.name.split(" ")[0] : "";
  const primaryAction = actions.length > 0 ? actions[0] : null;
  const secondaryActions = actions.length > 1 ? actions.slice(1) : [];
  const inbox = (msgs.data || []).filter((m) => !m.sent).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* SECTION 1 — PAGE HEADER & COMPACT METRICS */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-1">
            <span>Operational Command Center</span>
            <span>·</span>
            <span>{ROLE_LABEL[user!.role]}</span>
          </div>
          <h1 className="text-[24px] sm:text-[26px] font-bold tracking-tight text-ink">
            Good {greeting}, {firstName}
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {data.cycle ? (
              <>
                Quarterly Cycle <b>{data.cycle.period}</b> · {actions.length === 0 ? "All operational tasks up to date" : `${actions.length} action${actions.length === 1 ? "" : "s"} requiring your input`}
              </>
            ) : (
              "No active valuation cycle in progress"
            )}
          </p>
        </div>

        {data.cycle && (
          <div className="flex items-center gap-2">
            <span className="badge badge-info font-bold num !text-[12px] !py-1 !px-3">
              {data.cycle.period}
            </span>
            <span className={`badge !text-[12px] !py-1 !px-3 font-semibold ${data.cycle.status === "closed" ? "badge-gray" : data.cycle.status === "draft" ? "badge-amber" : "badge-green"}`}>
              {data.cycle.status === "closed" ? "Closed" : data.cycle.status === "draft" ? "Kickoff Pending" : "In Progress"}
            </span>
          </div>
        )}
      </div>

      {/* DEMO CONTROLS (Visually Secondary Sandboxed Utility Bar) */}
      <DemoControls />

      {/* SECTION 2 — QUARTERLY PROCESS OVERVIEW (FULL WIDTH) */}
      <ProcessStrip process={data.process} />

      {/* SECTION 3 — WORK PRIORITIES (BALANCED TWO-COLUMN LAYOUT) */}
      <section aria-label="Work Priorities" className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* LEFT COLUMN: Next Recommended Action (lg:col-span-7) */}
        <div className="flex flex-col justify-between lg:col-span-7">
          <div className="card flex h-full flex-col justify-between p-5 shadow-sm">
            <div>
              <div className="mb-3.5 flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-amber-500 fill-amber-500" />
                  <h2 className="text-[14.5px] font-bold text-ink tracking-tight">Next Recommended Action</h2>
                </div>
                {primaryAction ? (
                  <span className="badge badge-green font-semibold !text-[11px]">Ready for action</span>
                ) : (
                  <span className="badge badge-gray font-semibold !text-[11px]">Up to date</span>
                )}
              </div>

              {primaryAction ? (
                <div className="rounded-card border border-brand-200/80 bg-brand-50/20 dark:bg-brand-950/20 dark:border-brand-800/40 p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="badge badge-info font-bold num !text-[11px]">
                      STEP {String(primaryAction.step).replace("Q", "")} · {primaryAction.step_name}
                    </span>
                  </div>
                  <h3 className="text-[17px] font-bold text-ink tracking-tight leading-snug">
                    {primaryAction.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted max-w-xl">
                    {primaryAction.detail}
                  </p>
                  <div className="mt-4 pt-1">
                    <button
                      onClick={() => nav(primaryAction.link)}
                      className="btn btn-primary btn-md shadow-sm gap-2 text-[13px] font-semibold"
                    >
                      <span>Open Workflow</span>
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                /* COMPACT EMPTY STATE (Does not occupy excessive space!) */
                <div className="flex flex-col items-center justify-center py-6 text-center rounded-card border border-line bg-surface-2/40 px-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-50 text-success-600 dark:bg-success-950/50 dark:text-success-400 mb-2.5">
                    <CheckCircle2 size={20} />
                  </div>
                  <h3 className="text-[14px] font-bold text-ink">All tasks up to date</h3>
                  <p className="mt-1 text-xs text-muted max-w-sm">
                    {data.cycle?.status === "closed"
                      ? "The valuation cycle is closed and all marks are distributed."
                      : "No immediate actions require your input. ABIQ will notify you when new reviews or inputs are assigned."}
                  </p>
                </div>
              )}
            </div>

            {/* Additional Secondary Actions if any */}
            {secondaryActions.length > 0 && (
              <div className="mt-4 pt-3 border-t border-line space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Other Pending Actions ({secondaryActions.length})
                </div>
                {secondaryActions.map((i: any, k: number) => (
                  <button
                    key={k}
                    onClick={() => nav(i.link)}
                    className="card-hover flex w-full items-center justify-between gap-3 rounded-control border border-line bg-surface p-2.5 text-left transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink">{i.title}</div>
                      <div className="text-[11.5px] text-muted truncate">{i.detail}</div>
                    </div>
                    <span className="btn btn-secondary btn-sm !h-[26px] !text-[11.5px] shrink-0 gap-1">
                      Open <ArrowRight size={12} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Upcoming Deadlines (lg:col-span-5) */}
        <div className="flex flex-col lg:col-span-5">
          <PrioritiesDeadlines cycle={data.cycle} />
        </div>
      </section>

      {/* SECTION 4 — WHERE EACH LOAN STANDS (FULL WIDTH PORTFOLIO TABLE) */}
      {(data.loans || []).length > 0 && <FullWidthLoanTable loans={data.loans} />}

      {/* SECTION 5 — COMMUNICATIONS & COUNTERPARTS (SUPPORTING SECTION) */}
      <section aria-label="Communications and Counterparts" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Messages & Governed Notifications */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <MessagesSquare size={16} className="text-brand-600" /> Messages & Notifications
            </span>
          }
          subtitle="Governed communications and workflow alerts"
          actions={
            <button className="btn btn-secondary btn-sm !text-xs font-semibold" onClick={() => nav("/messages")}>
              View all
            </button>
          }
          className="shadow-sm"
        >
          {inbox.length ? (
            <div className="-mx-2 space-y-1">
              {inbox.map((m) => (
                <button
                  key={m.id}
                  onClick={() => nav(m.link || "/messages")}
                  className="flex w-full items-start gap-2.5 rounded-control p-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      m.read ? "bg-transparent" : "bg-brand-500 shadow-sm"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`text-[13px] text-ink leading-tight ${m.read ? "font-normal" : "font-semibold"}`}>
                      {m.subject}
                    </div>
                    <div className="text-[11.5px] text-muted mt-0.5 flex items-center gap-1.5">
                      <span className="font-medium text-ink">{m.from.split("@")[0]}</span>
                      <span>·</span>
                      <span className="num">{fmt.date(m.at)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              text="No unread messages"
              hint="Kickoff notifications, impact notes and committee packs will appear here."
            />
          )}
        </Card>

        {/* External Counterparts Waiting Queue */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <Hourglass size={16} className="text-amber-500" /> External Counterparts
            </span>
          }
          subtitle="Stages awaiting borrower, sponsor, or committee inputs"
          className="shadow-sm"
        >
          {waiting.length > 0 ? (
            <div className="-mx-2 space-y-1.5">
              {waiting.map((i: any, k: number) => (
                <button
                  key={k}
                  onClick={() => nav(i.link)}
                  className="card-hover flex w-full items-center gap-3 rounded-control border border-line bg-surface-2/40 px-3 py-2 text-left transition-colors"
                >
                  <Hourglass size={14} className="text-muted shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-ink text-[12.5px] truncate">{i.title}</div>
                    <div className="text-[11.5px] text-muted truncate">{i.detail}</div>
                  </div>
                  <ChevronRight size={14} className="text-faint shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[140px] flex-col items-center justify-center py-6 text-center">
              <ShieldCheck size={24} className="text-success-500/80 mb-2" />
              <div className="text-[13px] font-semibold text-ink">No counterpart blockers</div>
              <div className="text-xs text-muted max-w-xs mt-0.5">
                All external dependencies are satisfied or running on schedule.
              </div>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
