import {
  ArrowRight, Calendar, CalendarDays, Check, CheckCircle2, ChevronRight,
  Database, ExternalLink, Info, Mail, Send, ShieldCheck, Users
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, useApi } from "../api";
import { AssumedChip, Card, Chip, Field, PageHeader, useAction, useConfirm } from "../components/ui";
import { useApp } from "../context";

const STEPS = [
  { id: 0, title: "Period & Quarter End", short: "Period" },
  { id: 1, title: "Calendar Milestones", short: "Calendar" },
  { id: 2, title: "Loan Universe", short: "Universe" },
  { id: 3, title: "Team Ownership", short: "Ownership" },
  { id: 4, title: "Message Preview", short: "Messages" },
  { id: 5, title: "Send in ABIQ", short: "Send" },
];

export default function Kickoff() {
  const { cycle, refreshCycles, setCycleId } = useApp();
  const [step, setStep] = useState(cycle ? 1 : 0);
  const [period, setPeriod] = useState("2026-Q3");
  const [day0, setDay0] = useState("2026-09-30");
  const dl = useApi<any[]>(cycle ? `/cycles/${cycle.id}/deadlines` : null, [cycle?.id]);
  const loans = useApi<any[]>(cycle ? `/cycles/${cycle.id}/loans` : null, [cycle?.id]);
  const preview = useApi<any[]>(cycle && step >= 4 ? `/cycles/${cycle.id}/kickoff` : null, [cycle?.id, step]);
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const act = useAction();
  const confirm = useConfirm();
  const nav = useNavigate();
  const sent = cycle && cycle.status !== "draft";
  const inScope = (loans.data || []).filter((l) => l.in_scope);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="border-b border-line pb-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-1">
          <span>Quarterly Governance Workflow</span>
          <span>·</span>
          <span>Phase 1</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-ink">
              Quarterly Kickoff
            </h1>
            <p className="mt-1 text-[13.5px] text-muted">
              Initialize the valuation cycle, calibrate milestone deadlines, and dispatch governed kickoff packages to all deal teams.
            </p>
          </div>
          {cycle && (
            <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-full border border-line shadow-sm">
              <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
              <span className="text-xs font-bold text-ink num">Cycle: {cycle.period}</span>
              <span className="badge badge-gray text-[11px] font-semibold">{cycle.status}</span>
            </div>
          )}
        </div>
      </div>

      {act.node}
      {confirm.node}

      {/* Stepper Navigation */}
      <div className="card p-2 shadow-sm overflow-x-auto">
        <nav aria-label="Kickoff step navigation" className="flex items-center justify-between gap-1 min-w-[700px]">
          {STEPS.map((s, i) => {
            const isCompleted = i < step || sent;
            const isCurrent = i === step;
            const isClickable = cycle || i === 0;

            return (
              <button
                key={s.id}
                onClick={() => isClickable && setStep(i)}
                disabled={!isClickable}
                className={`group flex flex-1 items-center gap-2.5 rounded-control px-3 py-2 text-left transition-all ${
                  isCurrent
                    ? "bg-brand-50 text-brand-700 font-semibold ring-1 ring-brand-500/30"
                    : isCompleted
                    ? "text-ink hover:bg-surface-2"
                    : "text-muted opacity-60 cursor-not-allowed"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
                    isCompleted
                      ? "bg-success-600 text-white"
                      : isCurrent
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-surface-3 text-muted"
                  }`}
                >
                  {isCompleted ? <Check size={13} strokeWidth={2.5} /> : i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-semibold text-muted tracking-wider">
                    Step {i + 1}
                  </div>
                  <div className="text-[12.5px] truncate font-medium">
                    {s.short}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Status banner when sent */}
      {sent && (
        <div className="flex items-center gap-3 rounded-card border border-success-200 bg-success-50/80 px-4 py-3 text-[13.5px] text-success-800 shadow-sm">
          <CheckCircle2 size={18} className="text-success-600 shrink-0" />
          <div className="font-medium">
            Kickoff was successfully dispatched for <b>{cycle!.period}</b>. All loan tasks and deal team workflows are currently active.
          </div>
        </div>
      )}

      {/* STEP 0: Period and Quarter End */}
      {step === 0 && (
        <Card 
          title="1. Period and Quarter End Calibration"
          subtitle="Define the reporting quarter and Day 0 baseline date for deadline calculation."
          className="shadow-sm"
        >
          {cycle ? (
            <div className="space-y-4">
              <div className="rounded-card border border-brand-200 bg-brand-50/50 p-4">
                <div className="flex items-center gap-2 font-semibold text-brand-800 text-[14px]">
                  <CheckCircle2 size={16} className="text-brand-600" />
                  Valuation Cycle {cycle.period} Initialized
                </div>
                <p className="mt-1 text-xs text-brand-700">
                  The quarter end date is calibrated to <b>{cycle.day0 || "30 September 2026"}</b>. You may proceed directly to the Calendar milestones.
                </p>
              </div>
              <button className="btn btn-primary" onClick={() => setStep(1)}>
                Continue to Calendar <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div className="space-y-5 max-w-xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Reporting Period" help="E.g. 2026-Q3">
                  <input
                    className="input font-semibold"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  />
                </Field>
                <Field label="Quarter End (Day 0)" help="Official closing date">
                  <input
                    className="input font-semibold num"
                    type="date"
                    value={day0}
                    onChange={(e) => setDay0(e.target.value)}
                  />
                </Field>
              </div>
              <div>
                <button
                  className="btn btn-primary btn-lg shadow-md gap-2"
                  disabled={act.busy}
                  onClick={() =>
                    act.run(async () => {
                      const c = await api("/cycles", { body: { period, day0 } });
                      setCycleId(c.id);
                      await refreshCycles();
                      setStep(1);
                    })
                  }
                >
                  <Database size={15} />
                  <span>Create Cycle from Snowflake</span>
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* STEP 1: Calendar Milestones */}
      {step === 1 && cycle && (
        <Card
          title="2. Governance Calendar & Step Deadlines"
          subtitle="Calibrate target completion dates for all 22 quarterly milestones. Edits auto-save on change."
          actions={
            <button className="btn btn-primary shadow-sm gap-2" onClick={() => setStep(2)}>
              <span>Next: Loan Universe</span>
              <ArrowRight size={15} />
            </button>
          }
          className="shadow-sm"
        >
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className="th w-20">Step</th>
                  <th className="th">Milestone / Deliverable</th>
                  <th className="th w-48">Target Date</th>
                  <th className="th">Source Note</th>
                  <th className="th w-28">Source Type</th>
                </tr>
              </thead>
              <tbody>
                {(dl.data || []).map((d) => (
                  <tr key={d.step} className="hover:bg-surface-2 transition-colors">
                    <td className="td font-bold num text-brand-700 dark:text-brand-400">
                      {d.step}
                    </td>
                    <td className="td font-medium text-ink">
                      {d.label}
                    </td>
                    <td className="td">
                      <input
                        className="input num !h-8 font-medium text-xs max-w-[160px] bg-surface"
                        type="date"
                        defaultValue={d.date}
                        disabled={!!sent}
                        onBlur={(e) => {
                          const day =
                            cycle.day0 && e.target.value
                              ? Math.round((Date.parse(e.target.value) - Date.parse(cycle.day0)) / 86400000)
                              : d.day;
                          if (day !== d.day)
                            act.run(async () => {
                              await api(`/cycles/${cycle.id}/deadlines/${d.step}`, { method: "PUT", body: { day } });
                              dl.reload();
                            });
                        }}
                      />
                    </td>
                    <td className="td text-xs text-muted">
                      {d.source}
                    </td>
                    <td className="td">
                      {d.assumed ? (
                        <Chip tone="neutral">Standard Calendar</Chip>
                      ) : (
                        <Chip tone="green">Source Note</Chip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* STEP 2: Loan Universe */}
      {step === 2 && cycle && (
        <Card
          title={`3. Loan Universe Reconciliation: ${inScope.length} Facilities in Scope`}
          subtitle="Live synchronisation of private credit facilities from DealCloud, Everest and Sentry."
          actions={
            <button className="btn btn-primary shadow-sm gap-2" onClick={() => setStep(3)}>
              <span>Next: Team Ownership</span>
              <ArrowRight size={15} />
            </button>
          }
          className="shadow-sm"
        >
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-card border border-line bg-surface-2/60 p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Facilities in Scope</div>
                <div className="mt-2 text-2xl font-bold num text-brand-600 dark:text-brand-400">{inScope.length}</div>
                <div className="mt-1 text-xs text-muted">Term loans & delayed draws</div>
              </div>
              <div className="rounded-card border border-line bg-surface-2/60 p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Source Warehouse</div>
                <div className="mt-2 text-2xl font-bold text-ink">Snowflake</div>
                <div className="mt-1 text-xs text-muted">DealCloud · Everest · Sentry</div>
              </div>
              <div className="rounded-card border border-line bg-surface-2/60 p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Unowned Loans</div>
                <div className="mt-2 text-2xl font-bold num text-success-600">
                  {inScope.filter((l) => !l.team).length}
                </div>
                <div className="mt-1 text-xs text-muted">100% assigned to deal teams</div>
              </div>
            </div>

            <div className="rounded-card border border-line bg-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="font-semibold text-ink text-[14px]">Scope Management & Adjustments</h4>
                <p className="text-xs text-muted mt-0.5">
                  {(loans.data || []).length} total records evaluated. Review revolving credit exclusions or manual valuation overrides on the Loan Universe screen.
                </p>
              </div>
              <button 
                className="btn btn-secondary shrink-0 gap-1.5" 
                onClick={() => nav("/universe")}
              >
                <span>Open Loan Universe</span>
                <ExternalLink size={14} />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 3: Deal Team Ownership */}
      {step === 3 && cycle && (
        <Card
          title="4. Deal Team Ownership & Portfolio Assignments"
          subtitle="Confirm that every in-scope loan has an assigned deal analyst and lead before kickoff broadcast."
          actions={
            <button className="btn btn-primary shadow-sm gap-2" onClick={() => setStep(4)}>
              <span>Confirm Ownership</span>
              <ArrowRight size={15} />
            </button>
          }
          className="shadow-sm"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Object.entries(
              inScope.reduce((acc: any, l: any) => {
                (acc[l.team] = acc[l.team] || []).push(l);
                return acc;
              }, {})
            ).map(([team, ls]: any) => (
              <div
                key={team}
                className="rounded-card border border-line bg-surface p-4 shadow-sm hover:border-strong transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5 mb-3">
                    <span className="font-bold text-ink text-[14px] flex items-center gap-1.5">
                      <Users size={15} className="text-brand-600" />
                      {team}
                    </span>
                    <span className="badge badge-gray font-semibold num !text-[11px]">
                      {ls.length} {ls.length === 1 ? "loan" : "loans"}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {ls.map((l: any) => (
                      <div key={l.id} className="rounded-control bg-surface-2 p-2.5 border border-line/60">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-ink text-[13px]">{l.borrower}</span>
                          <span className={`badge !text-[10px] ${l.cmr_type === "watchlist" ? "badge-amber" : "badge-gray"}`}>
                            {l.cmr_type || "standard"}
                          </span>
                        </div>
                        <div className="text-[11.5px] text-muted font-mono mt-1">
                          Facility {l.facility_id}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* STEP 4: Message Preview */}
      {step === 4 && cycle && (
        <Card
          title="5. Governed Kickoff Messages per Deal Team"
          subtitle="Messages are dispatched securely inside ABIQ (no external email). Deal teams receive assigned loans and deadlines."
          actions={
            <button className="btn btn-primary shadow-sm gap-2" onClick={() => setStep(5)}>
              <span>Next: Final Review</span>
              <ArrowRight size={15} />
            </button>
          }
          className="shadow-sm"
        >
          <div className="space-y-4">
            {(preview.data || []).map((p) => (
              <div key={p.deal_team_id} className="rounded-card border border-line bg-surface p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <Mail size={15} className="text-brand-600" />
                    <span className="font-bold text-ink text-[13.5px]">{p.team_name}</span>
                  </div>
                  <div className="text-xs text-muted">
                    Recipients: <span className="font-medium text-ink">{p.to.join(", ")}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted">Subject Line</label>
                  <input
                    className="input font-semibold text-ink"
                    defaultValue={p.subject}
                    onChange={(e) =>
                      setEdits({
                        ...edits,
                        [p.deal_team_id]: {
                          subject: e.target.value,
                          body: edits[p.deal_team_id]?.body ?? p.body,
                        },
                      })
                    }
                  />
                </div>
                <div className="mt-3 space-y-2">
                  <label className="text-xs font-semibold text-muted">Message Content (Markdown / Monospace)</label>
                  <textarea
                    className="input h-40 font-mono text-xs bg-surface-2/40 leading-relaxed"
                    defaultValue={p.body}
                    onChange={(e) =>
                      setEdits({
                        ...edits,
                        [p.deal_team_id]: {
                          subject: edits[p.deal_team_id]?.subject ?? p.subject,
                          body: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* STEP 5: Send in ABIQ */}
      {step === 5 && cycle && (
        <Card
          title="6. Final Confirmation & Kickoff Broadcast"
          subtitle="Initiate the 2026-Q3 quarterly valuation cycle across all systems."
          className="shadow-sm"
        >
          <div className="space-y-6 max-w-2xl">
            <div className="rounded-card border border-line bg-surface-2/50 p-5 space-y-3">
              <h4 className="font-bold text-ink text-[14.5px] flex items-center gap-2">
                <ShieldCheck size={18} className="text-brand-600" />
                Workflow Execution Summary
              </h4>
              <ul className="space-y-2 text-[13px] text-muted list-disc list-inside">
                <li>
                  Dispatches <b>{(preview.data || []).length} internal governed messages</b>, one per deal team.
                </li>
                <li>
                  Automatically transitions the cycle status from <b>Draft</b> to <b>Active</b>.
                </li>
                <li>
                  Generates per-loan task queues and deadline trackers in each team member's <b>My Work</b>.
                </li>
                <li>
                  Deal teams request initial reporting packages from borrowers via tracked email ingestion.
                </li>
              </ul>
            </div>

            <div className="pt-2">
              <button
                className="btn btn-primary btn-lg shadow-md gap-2"
                disabled={!!sent}
                onClick={() =>
                  confirm.ask(
                    <>
                      You are sending the <b>{cycle.period}</b> kickoff inside ABIQ to{" "}
                      <b>{(preview.data || []).length} deal teams</b>:{" "}
                      {(preview.data || []).map((p) => p.team_name).join(", ")}.
                    </>,
                    async () => {
                      await api(`/cycles/${cycle.id}/kickoff`, { body: { edits } });
                      await refreshCycles();
                      nav("/work");
                    }
                  )
                }
              >
                <Send size={16} />
                <span>{sent ? "Kickoff Dispatched" : "Send Kickoff in ABIQ"}</span>
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
