import { Activity, AlertCircle, Building2, Calendar, Coins, Download, Filter, Layers, Printer, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmt, useApi } from "../api";
import { Card, Chip, Delta, Empty, ErrorState, Kpi, Loading, Loops, MoveChip, PageHeader, StatusChip, useAction } from "../components/ui";
import DemoControls from "../components/DemoControls";
import { useApp } from "../context";
import { ProcessStrip } from "./Work";
import { dayDate } from "../display";

const DT_COLS = [
  ["Intake", ["Q1", "Q2", "Q3"]],
  ["Spread", ["Q4"]],
  ["CMR", ["Q5"]],
  ["Review", ["Q6", "Q7", "Q8", "Q9"]],
  ["Agreed", ["Q10", "Q11", "Q12", "Q13", "Q14", "Q15", "Q16", "Q17", "Q18", "Q19", "Q20", "Q21", "Q22"]],
] as const;

const LN_COLS = [
  ["Not shared", ["Q1", "Q2", "Q3"]],
  ["Package shared", ["Q10"]],
  ["Marks received", ["Q11"]],
  ["Loaded", ["Q12", "Q13"]],
] as const;

const G1_COLS = [
  ["G1 Approval", ["Q14"]],
  ["Approved", ["Q15"]],
  ["Agenda", ["Q16", "Q17", "Q18"]],
  ["Decided / Recon", ["Q19", "Q20", "Q21"]],
  ["Final Marks", ["Q22"]],
] as const;

function LoanCard({ l }: { l: any }) {
  const nav = useNavigate();
  const mark = l.final_mark ?? l.committee_mark ?? l.deal_team_mark ?? l.lincoln_mark;
  return (
    <button
      onClick={() => nav(`/loans/${l.id}`)}
      className="card-hover mb-2.5 w-full rounded-control border border-line bg-surface p-3 text-left shadow-sm transition-all hover:border-strong"
    >
      <div className="flex items-start justify-between gap-1">
        <span className="truncate text-[13px] font-bold text-ink">{l.borrower}</span>
        <span className="text-[11px] font-mono text-muted">{l.facility_id}</span>
      </div>
      <div className="mt-0.5 text-[11.5px] text-muted">{l.team}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusChip status={l.package_status === "late" ? "late" : l.status} />
        {mark !== null && mark !== undefined && (
          <span className="badge badge-info !text-[10.5px] num">
            {fmt.mark(mark)}
          </span>
        )}
        {l.on_agenda && <span className="badge badge-amber !text-[10.5px]">Agenda</span>}
        <Loops loops={l.loops} />
      </div>
    </button>
  );
}

function Lane({
  title,
  cols,
  loans,
  stepKey,
}: {
  title: string;
  cols: readonly (readonly [string, readonly string[]])[];
  loans: any[];
  stepKey: string;
}) {
  return (
    <div className="mb-6 last:mb-0">
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted flex items-center justify-between">
        <span>{title}</span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="grid gap-3 min-w-[760px]" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
          {cols.map(([name, steps]) => {
            const ls = loans.filter((l) => steps.includes(l[stepKey]));
            return (
              <div key={name} className="rounded-card border border-line bg-surface-2/40 p-2.5 flex flex-col">
                <div className="mb-2.5 flex items-center justify-between border-b border-line pb-1.5 px-1">
                  <span className="text-[12px] font-semibold text-ink truncate">{name}</span>
                  <span className="badge badge-gray !py-0 !h-[18px] num text-[10.5px]">{ls.length}</span>
                </div>
                <div className="max-h-[360px] overflow-y-auto pr-0.5 flex-1">
                  {ls.length > 0 ? (
                    ls.map((l) => <LoanCard key={l.id} l={l} />)
                  ) : (
                    <div className="py-6 text-center text-[11px] text-muted">Empty</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { cycle } = useApp();
  const nav = useNavigate();
  const { data, error, loading, reload } = useApi<any>(
    cycle ? `/dashboard?cycle_id=${cycle.id}` : "/dashboard",
    [cycle?.id, cycle?.day]
  );
  const work = useApi<any>(cycle ? `/work?cycle_id=${cycle.id}` : null, [cycle?.id, cycle?.day]);
  const [team, setTeam] = useState("");
  const act = useAction();

  if (loading && !data) return <Loading />;
  if (error) {
    return (
      <>
        <PageHeader title="Cycle Dashboard" />
        <ErrorState error={error} retry={reload} />
        {error.status === 404 && (
          <div className="mt-4">
            <Link className="btn btn-primary" to="/kickoff">
              Open the Kickoff wizard
            </Link>
          </div>
        )}
      </>
    );
  }

  const d = data!;
  const k = d.kpis;
  const loans = d.loans.filter((l: any) => !team || l.team === team);
  const teams = Array.from(new Set(d.loans.map((l: any) => l.team))) as string[];
  const preG1 = d.loans.some(
    (l: any) =>
      ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11", "Q12", "Q13", "Q14"].includes(l.current_step) &&
      l.status !== "approved"
  );
  const g1Loans = loans.map((l: any) => ({
    ...l,
    g1step: l.status === "waiting_on_lincoln" ? "Q14" : l.current_step,
  }));
  const currentDay = k.day ?? d.cycle.current_day ?? 0;
  const totalDays = k.length ?? 45;
  const internalPhases = (d.phases || []).filter((p: any) => p.phase !== 3);
  const lincolnPhases = (d.phases || []).filter((p: any) => p.phase === 3);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cycle Dashboard"
        subtitle={`Governance tracking for the ${d.cycle.period} quarterly cycle. Quarter end: ${d.cycle.day0}, final distribution deadline: ${d.cycle.deadline}.`}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                className="input !h-[34px] !py-0 !pl-2.5 !pr-7 text-xs font-semibold"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
              >
                <option value="">All Deal Teams</option>
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-secondary btn-sm gap-1.5" onClick={() => window.print()}>
              <Printer size={13} />
              <span>Export PDF</span>
            </button>
          </div>
        }
      />

      {act.node}

      {/* 5 Executive KPI Tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi
          label="Quarter Cycle"
          value={d.cycle.period}
          sub={d.cycle.status === "closed" ? "Closed" : d.cycle.status === "draft" ? "Kickoff pending" : "In Progress"}
        />
        <Kpi label="Loans in Cycle" value={k.loans} sub="All active facilities" />
        <Kpi
          label="Gate 1 Passed"
          value={`G1 ${k.g1_passed}/${k.loans}`}
          sub={`${Math.round((k.g1_passed / (k.loans || 1)) * 100)}% approved`}
        />
        <Kpi
          label="Portfolio Value"
          value={fmt.m(k.portfolio_current)}
          sub={
            <span className="flex items-center gap-1">
              <Delta v={k.delta} /> vs {fmt.m(k.portfolio_previous)}
            </span>
          }
          tone={k.delta < 0 ? "red" : "green"}
        />
        <Kpi
          label="Tasks Overdue"
          value={k.overdue}
          sub={k.overdue > 0 ? "Requires escalation" : "On schedule"}
          tone={k.overdue ? "red" : "green"}
        />
      </div>

      <DemoControls />

      {/* Process Strip */}
      <ProcessStrip process={work.data?.process || []} />

      {/* 45-Day Cycle Calendar & Milestone Timeline */}
      <Card
        title={
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
              <Calendar size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span>Cycle Calendar & Milestones</span>
                <span className="badge badge-brand !text-[11px] font-semibold py-0 px-2">
                  45-Day Schedule
                </span>
              </div>
            </div>
          </div>
        }
        subtitle="Operational timeline across six statutory valuation phases and 22 governance milestones."
        actions={
          <div className="flex items-center gap-3 text-xs">
            {currentDay > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-line font-medium text-ink">
                <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                <span>Current: <b className="num">Day {currentDay}</b> of {totalDays}</span>
              </div>
            )}
            <span className="badge badge-gray font-semibold text-[11px]">
              {d.deadlines.length} Milestone Deadlines
            </span>
          </div>
        }
        className="shadow-sm overflow-hidden"
      >
        <div className="space-y-4">
          {/* Scrollable Timeline Tracks Container */}
          <div className="overflow-x-auto pb-1">
            <div className="min-w-[820px] space-y-3.5 pr-2">
              {/* Track 1: Internal Valuation Workflow (Deal Team & PM) */}
              <div className="flex items-center gap-3">
                <div className="w-44 shrink-0 text-right pr-2">
                  <div className="text-xs font-bold text-ink leading-tight">Internal Workflow</div>
                  <div className="text-[10.5px] text-muted">Deal Team & PM</div>
                </div>
                <div className="relative h-9 flex-1 rounded-card bg-surface-2/60 border border-line/70 p-1">
                  {/* Subtle 5-day grid lines */}
                  {[0, 10, 20, 30, 40].map((dMarker) => (
                    <div
                      key={dMarker}
                      className="absolute top-0 bottom-0 border-r border-line/40 pointer-events-none"
                      style={{ left: `${(dMarker / 45) * 100}%` }}
                    />
                  ))}

                  {/* Track 1 Phase Bars (Phases 1, 2, 4, 5, 6) */}
                  {internalPhases.map((p: any) => {
                    const left = (Math.max(p.start, 0) / 45) * 100;
                    const width = Math.min(((p.end - p.start + 1) / 45) * 100, 100 - left);
                    const isCurrent = currentDay >= p.start && currentDay <= p.end;
                    const isDone = currentDay > p.end;

                    return (
                      <div
                        key={p.phase}
                        title={`Phase ${p.phase}: ${p.name} (Days ${p.start}–${p.end}) · Steps ${p.steps.join(", ")}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        className={`absolute top-1 bottom-1 flex items-center justify-between px-2 rounded-[6px] border text-[11px] font-semibold transition-all shadow-xs overflow-hidden group cursor-pointer ${isCurrent
                          ? "bg-brand-500 text-white border-brand-600 shadow-sm"
                          : isDone
                            ? "bg-surface border-line text-ink hover:bg-surface-2"
                            : "bg-surface-2 border-line text-muted hover:text-ink hover:bg-surface-3"
                          }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isCurrent ? "bg-white/20 text-white" : "bg-surface-3 text-muted"
                              }`}
                          >
                            {p.phase}
                          </span>
                          <span className="truncate">{p.name}</span>
                        </div>
                        <span className={`text-[10px] num opacity-80 shrink-0 ml-1 hidden sm:inline ${isCurrent ? "text-white/90" : "text-muted"}`}>
                          d{p.start}–{p.end}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Track 2: Lincoln External Valuation Exchange */}
              <div className="flex items-center gap-3">
                <div className="w-44 shrink-0 text-right pr-2">
                  <div className="text-xs font-bold text-ink leading-tight">External Valuation</div>
                  <div className="text-[10.5px] text-muted">Lincoln International</div>
                </div>
                <div className="relative h-9 flex-1 rounded-card bg-surface-2/60 border border-line/70 p-1">
                  {/* Subtle 5-day grid lines */}
                  {[0, 10, 20, 30, 40].map((dMarker) => (
                    <div
                      key={dMarker}
                      className="absolute top-0 bottom-0 border-r border-line/40 pointer-events-none"
                      style={{ left: `${(dMarker / 45) * 100}%` }}
                    />
                  ))}

                  {/* Track 2 Phase Bars (Phase 3) */}
                  {lincolnPhases.map((p: any) => {
                    const left = (Math.max(p.start, 0) / 45) * 100;
                    const width = Math.min(((p.end - p.start + 1) / 45) * 100, 100 - left);
                    const isCurrent = currentDay >= p.start && currentDay <= p.end;
                    const isDone = currentDay > p.end;

                    return (
                      <div
                        key={p.phase}
                        title={`Phase ${p.phase}: ${p.name} (Days ${p.start}–${p.end}) · Steps ${p.steps.join(", ")}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        className={`absolute top-1 bottom-1 flex items-center justify-between px-2.5 rounded-[6px] border text-[11px] font-semibold transition-all shadow-xs overflow-hidden group cursor-pointer ${isCurrent
                          ? "bg-purple-600 text-white border-purple-700 shadow-sm"
                          : isDone
                            ? "bg-surface border-line text-ink hover:bg-surface-2"
                            : "bg-surface-2 border-line text-muted hover:text-ink hover:bg-surface-3"
                          }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isCurrent ? "bg-white/20 text-white" : "bg-surface-3 text-muted"
                              }`}
                          >
                            {p.phase}
                          </span>
                          <span className="truncate">{p.name}</span>
                        </div>
                        <span className={`text-[10px] num opacity-80 shrink-0 ml-1 ${isCurrent ? "text-white/90" : "text-muted"}`}>
                          d{p.start}–{p.end}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Time Axis & Milestone Deadlines */}
              <div className="flex items-start gap-3 pt-1">
                <div className="w-44 shrink-0 text-right pr-2">
                  <div className="text-[11px] font-semibold text-muted">Milestones & Days</div>
                </div>
                <div className="relative flex-1 pt-1 pb-4">
                  {/* Axis Baseline */}
                  <div className="h-0.5 w-full bg-line rounded-full" />

                  {/* Axis Day Numbers */}
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45].map((dMarker) => (
                    <div
                      key={dMarker}
                      className="absolute top-2 -translate-x-1/2 flex flex-col items-center"
                      style={{ left: `${(dMarker / 45) * 100}%` }}
                    >
                      <div className="h-1.5 w-0.5 bg-line" />
                      <span className="text-[10px] font-mono text-muted mt-0.5">Day {dMarker}</span>
                    </div>
                  ))}

                  {/* Today / Current Day Indicator Marker */}
                  {currentDay > 0 && currentDay <= 45 && (
                    <div
                      className="absolute -top-24 bottom-0 -translate-x-1/2 flex flex-col items-center pointer-events-none z-10"
                      style={{ left: `${(currentDay / 45) * 100}%` }}
                    >
                      <span className="badge badge-brand !text-[9.5px] font-bold shadow-xs py-0 px-1.5 mb-0.5 whitespace-nowrap animate-bounce">
                        Today
                      </span>
                      <div className="w-0.5 flex-1 bg-brand-500/80 border-r border-dashed border-brand-400" />
                      <div className="h-2 w-2 rounded-full bg-brand-600 ring-2 ring-brand-200" />
                    </div>
                  )}

                  {/* Milestone Deadline Pins along the axis */}
                  {d.deadlines.map((x: any) => {
                    const pos = Math.min((x.day / 45) * 100, 99.5);
                    return (
                      <div
                        key={x.step}
                        title={`${x.step} · ${x.label} (Due: Day ${x.day}, ${x.date})${x.assumed ? " [Assumed DQ]" : ""}`}
                        className="group/milestone absolute -top-1 -translate-x-1/2 flex flex-col items-center cursor-pointer"
                        style={{ left: `${pos}%` }}
                      >
                        <div className="h-2.5 w-1 rounded-full bg-brand-500 group-hover/milestone:scale-125 group-hover/milestone:bg-brand-700 transition-all shadow-xs" />
                        {/* Hover Tooltip */}
                        <div className="pointer-events-none absolute bottom-full mb-1.5 hidden -translate-x-1/2 rounded bg-ink px-2 py-1 text-[10.5px] font-medium text-white shadow-lg whitespace-nowrap z-20 group-hover/milestone:block">
                          <span className="font-bold text-brand-300 mr-1">{x.step}</span>
                          <span>{x.label}</span>
                          <span className="text-muted text-[9.5px] ml-1.5 font-mono">Day {x.day}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Phase Summary Legend Strip (6 Columns) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 pt-2 border-t border-line">
            {d.phases.map((p: any) => {
              const isCurrent = currentDay >= p.start && currentDay <= p.end;
              const isDone = currentDay > p.end;

              return (
                <div
                  key={p.phase}
                  className={`p-2.5 rounded-control border transition-all text-xs ${isCurrent
                    ? "border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 ring-1 ring-brand-500/20"
                    : isDone
                      ? "border-line bg-surface-2/40 text-muted"
                      : "border-line bg-surface text-ink"
                    }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold num text-[11px] text-brand-600 dark:text-brand-400">
                      Phase {p.phase}
                    </span>
                    <span className="badge badge-gray !text-[9.5px] !py-0 !px-1 num font-semibold">
                      d{p.start}–{p.end}
                    </span>
                  </div>
                  <div className="font-semibold text-ink text-[12px] truncate leading-tight" title={p.name}>
                    {p.name}
                  </div>
                  <div className="text-[10.5px] text-muted mt-1 font-mono">
                    Steps: {p.steps[0]}–{p.steps[p.steps.length - 1]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Section 4: Full-Width Master Loan Value Movement Table */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-brand-600" />
            <span>Loan Value Movement</span>
          </div>
        }
        subtitle="Previous quarter vs current quarter marks, valuation movements, and net portfolio change"
        className="shadow-sm overflow-hidden"
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {/* Category Grouping Tier */}
              <tr className="border-b border-line bg-surface-2 text-[10.5px] font-bold uppercase tracking-wider text-ink select-none">
                <th className="py-2 px-4 border-r border-line text-ink font-bold min-w-[220px]">
                  <span className="flex items-center gap-1.5">
                    <Building2 size={13} className="text-brand-600 dark:text-brand-400" />
                    <span className="text-ink font-bold">Facility & Position</span>
                  </span>
                </th>
                <th
                  colSpan={3}
                  className="py-2 px-3 border-r border-line bg-brand-50/70 dark:bg-brand-950/40 text-ink font-bold"
                >
                  <span className="flex items-center gap-1.5">
                    <TrendingUp size={13} className="text-brand-600 dark:text-brand-400" />
                    <span className="text-ink font-bold">Mark Evolution (Price)</span>
                  </span>
                </th>
                <th
                  colSpan={3}
                  className="py-2 px-3 border-r border-line bg-success-50/70 dark:bg-success-50/20 text-right text-ink font-bold"
                >
                  <span className="flex items-center justify-end gap-1.5">
                    <Coins size={13} className="text-success-600 dark:text-success-400" />
                    <span className="text-ink font-bold">Portfolio Valuation ($M)</span>
                  </span>
                </th>
                <th className="py-2 px-4 bg-warning-50/70 dark:bg-warning-50/20 text-ink font-bold">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck size={13} className="text-warn-600 dark:text-warn-400" />
                    <span className="text-ink font-bold">Governance</span>
                  </span>
                </th>
              </tr>

              {/* Column Headers Tier */}
              <tr className="border-b border-line bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-ink">
                <th className="py-2.5 px-4 whitespace-nowrap sticky left-0 bg-surface z-20 border-r border-line shadow-xs min-w-[220px]">
                  Borrower & Facility
                </th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[100px]">Previous Mark</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[105px]">Current Mark</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap min-w-[120px] border-r border-line">Move</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[105px]">Previous Val</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[105px]">Current Val</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[110px] border-r border-line">Change</th>
                <th className="py-2.5 px-4 whitespace-nowrap min-w-[130px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70 text-[12.5px]">
              {loans.map((l: any) => {
                const mark = l.final_mark ?? l.committee_mark ?? l.deal_team_mark ?? l.lincoln_mark;
                const change =
                  l.previous_value != null && l.current_value != null
                    ? l.current_value - l.previous_value
                    : null;

                return (
                  <tr
                    key={l.id}
                    className="group cursor-pointer hover:bg-brand-50/30 dark:hover:bg-brand-950/20 transition-colors"
                    onClick={() => nav(`/loans/${l.cycle_loan_id || l.id}`)}
                  >
                    <td className="py-3 px-4 whitespace-nowrap sticky left-0 bg-surface group-hover:bg-surface-2 z-10 border-r border-line shadow-xs min-w-[220px]">
                      <div className="font-bold text-ink group-hover:text-brand-600 transition-colors">
                        {l.borrower}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[11px] text-muted">{l.facility_id}</span>
                        <span className="text-muted/60">·</span>
                        <span className="badge badge-gray !text-[9.5px] !py-0 !px-1 font-medium">{l.team}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-medium num text-muted whitespace-nowrap">
                      {fmt.mark(l.previous_mark)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold num text-ink whitespace-nowrap">
                      {fmt.mark(mark)}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap border-r border-line">
                      <MoveChip move={l.move} />
                    </td>
                    <td className="py-3 px-3 text-right font-medium num text-muted whitespace-nowrap">
                      {fmt.num(l.previous_value, 3)}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold num text-ink whitespace-nowrap">
                      {fmt.num(l.current_value, 3)}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap border-r border-line">
                      {change == null ? <span className="text-muted">—</span> : <Delta v={change} />}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusChip status={l.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Table Summary Footer */}
            <tfoot>
              <tr className="border-t-2 border-line bg-surface-2/60 text-xs font-semibold text-ink">
                <td className="py-3 px-4 whitespace-nowrap sticky left-0 bg-surface-2 z-10 border-r border-line shadow-xs">
                  <div className="font-bold text-ink">Portfolio Total</div>
                  <div className="text-[11px] text-muted font-normal">{loans.length} Facilities</div>
                </td>
                <td className="py-3 px-3 text-right text-muted num font-medium whitespace-nowrap">—</td>
                <td className="py-3 px-3 text-right text-muted num font-medium whitespace-nowrap">—</td>
                <td className="py-3 px-3 text-center text-muted whitespace-nowrap border-r border-line">—</td>
                <td className="py-3 px-3 text-right num text-muted whitespace-nowrap">
                  {fmt.num(k.portfolio_previous, 3)}
                </td>
                <td className="py-3 px-3 text-right num font-bold text-ink whitespace-nowrap">
                  {fmt.num(k.portfolio_current, 3)}
                </td>
                <td className="py-3 px-3 text-right whitespace-nowrap border-r border-line">
                  <Delta v={k.delta} />
                </td>
                <td className="py-3 px-4 text-muted whitespace-nowrap font-normal">
                  Cycle active
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Section 5: Balanced Operational Priorities & Audit Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Card 1: Action Required & Immediate Escalations */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <AlertCircle size={16} className="text-danger-500" />
              <span>Action Required</span>
            </span>
          }
          subtitle="Milestones requiring immediate escalation and awaiting partner input"
          className="h-full flex flex-col shadow-sm"
        >
          <div className="flex-1 flex flex-col justify-between">
            <div>
              {d.attention.length ? (
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {d.attention.map((a: any, i: number) => (
                    <Link
                      to={`/loans/${a.cycle_loan_id}`}
                      key={i}
                      className="card-hover flex items-center justify-between gap-3 rounded-control border border-danger-200/80 bg-danger-50/50 dark:bg-danger-950/20 p-2.5 text-xs text-danger-700 dark:text-danger-300 transition-colors"
                    >
                      <span className="font-semibold truncate">{a.title}</span>
                      <span className="badge badge-red !text-[10.5px] num shrink-0">Due {dayDate(a.day)}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty text="Nothing overdue" hint="All cycle milestones are currently running on schedule." />
              )}

              {d.loans.filter((l: any) => l.status === "sent_back" || l.status === "waiting_on_lincoln").length > 0 && (
                <div className="mt-4 pt-3 border-t border-line space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Awaiting Action</div>
                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                    {d.loans
                      .filter((l: any) => l.status === "sent_back" || l.status === "waiting_on_lincoln")
                      .map((l: any) => (
                        <Link
                          to={`/loans/${l.id}`}
                          key={l.id}
                          className="card-hover flex items-center justify-between rounded-control border border-warn-200/80 bg-warn-50/50 dark:bg-warn-950/20 p-2 text-xs text-warn-800 dark:text-warn-300 transition-colors"
                        >
                          <span className="font-semibold text-ink">{l.borrower}</span>
                          <StatusChip status={l.status} />
                        </Link>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2.5 text-xs text-muted border-t border-line/60 mt-3 flex items-center justify-between">
              <span>Escalation Status</span>
              <span className="font-semibold text-danger-600 num">
                {d.attention.length} Overdue Milestones
              </span>
            </div>
          </div>
        </Card>

        {/* Card 2: Rework Loops Audited */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <Activity size={16} className="text-brand-600" />
              <span>Rework Loops Audited</span>
            </span>
          }
          subtitle="Governance audit trail across valuation loops QA through QF"
          className="h-full flex flex-col shadow-sm"
        >
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <div className="grid grid-cols-3 gap-2.5 text-center">
                {Object.entries(d.loops).map(([kk, v]: any) => (
                  <div key={kk} className="rounded-control border border-line bg-surface-2/40 p-2.5 flex flex-col justify-between">
                    <div className="text-[22px] font-bold num text-ink">{v}</div>
                    <div className="text-[11px] font-bold text-brand-700 dark:text-brand-300 mt-1">{kk}</div>
                    <div className="text-[10px] text-muted truncate mt-0.5">
                      {kk === "QA" ? "Lincoln send-backs" :
                        kk === "QB" ? "Review notes" :
                          kk === "QC" ? "Model revisions" :
                            kk === "QD" ? "Internal rejects" :
                              kk === "QE" ? "Approval rejects" :
                                "Committee returns"}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3.5 text-[11.5px] text-muted leading-relaxed bg-surface-2/30 p-2.5 rounded-control border border-line/50">
                Every loop triggers an audit trail record and notifies the counterpart automatically.
              </div>
            </div>

            <div className="pt-2.5 text-xs text-muted border-t border-line/60 mt-3 flex items-center justify-between">
              <span>Total Loop Events</span>
              <span className="font-semibold text-ink num">
                {(Object.values(d.loops || {}) as any[]).reduce((a: number, b: any) => a + Number(b || 0), 0)} Audited
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Section 6: Full-Width Real-Time Loan Workflow Board (Kanban) */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-brand-600" />
            <span>Loan Workflow Board</span>
          </div>
        }
        subtitle="Real-time loan stages mapped across operational tracks (Deal Team, Lincoln, and Gate 1 Governance)"
        className="shadow-sm overflow-hidden"
      >
        {preG1 && (
          <>
            <Lane title="Deal Team Track (Intake → Spread → CMR → Review → Agreement)" cols={DT_COLS} loans={loans} stepKey="dt_step" />
            <Lane title="Lincoln Track (Not Shared → Package Shared → Draft Received → Loaded)" cols={LN_COLS} loans={loans} stepKey="lincoln_step" />
          </>
        )}
        <Lane
          title={preG1 ? "Gate 1 Through Distribution" : "Consolidated Governance Track (G1 → Final)"}
          cols={G1_COLS}
          loans={g1Loans.filter(
            (l: any) =>
              ["Q14", "Q15", "Q16", "Q17", "Q18", "Q19", "Q20", "Q21", "Q22"].includes(l.g1step) &&
              l.status !== "in_progress"
          )}
          stepKey="g1step"
        />
      </Card>
    </div>
  );
}
