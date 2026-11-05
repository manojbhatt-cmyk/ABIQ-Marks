import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmt, useApi } from "../api";
import { Card, Chip, Delta, Empty, ErrorState, Kpi, Loading, Loops, PageHeader, StatusChip, useAction } from "../components/ui";
import { useApp } from "../context";
import { PHASE_STYLE, ProcessStrip } from "./Work";

const DT_COLS = [["Intake", ["Q1", "Q2", "Q3"]], ["Spread", ["Q4"]], ["CMR", ["Q5"]], ["Review", ["Q6", "Q7", "Q8", "Q9"]], ["Agreed", ["Q10", "Q11", "Q12", "Q13", "Q14", "Q15", "Q16", "Q17", "Q18", "Q19", "Q20", "Q21", "Q22"]]] as const;
const LN_COLS = [["Not shared", ["Q1", "Q2", "Q3"]], ["Package shared", ["Q10"]], ["Marks received", ["Q11"]], ["Loaded", ["Q12", "Q13"]]] as const;
const G1_COLS = [["G1", ["Q14"]], ["Approved", ["Q15"]], ["Agenda", ["Q16", "Q17", "Q18"]], ["Decided / Reconciled", ["Q19", "Q20", "Q21"]], ["Final", ["Q22"]]] as const;

function LoanCard({ l }: { l: any }) {
  const nav = useNavigate();
  const mark = l.final_mark ?? l.committee_mark ?? l.deal_team_mark ?? l.lincoln_mark;
  return (
    <button onClick={() => nav(`/loans/${l.id}`)} className="mb-2 w-full rounded-xl border-l-4 border-sky-500 bg-white p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-1"><span className="truncate text-[13px] font-semibold">{l.borrower}</span><span className="text-[10px] text-slate-400">{l.facility_id}</span></div>
      <div className="mt-0.5 text-[11px] text-slate-500">{l.team}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <StatusChip status={l.package_status === "late" ? "late" : l.status} />
        {mark !== null && mark !== undefined && <Chip tone="violet">{fmt.mark(mark)}</Chip>}
        {l.on_agenda && <Chip tone="blue">agenda</Chip>}
        <Loops loops={l.loops} />
      </div>
    </button>
  );
}

function Lane({ title, cols, loans, stepKey }: { title: string; cols: readonly (readonly [string, readonly string[]])[]; loans: any[]; stepKey: string }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
        {cols.map(([name, steps]) => {
          const ls = loans.filter((l) => steps.includes(l[stepKey]));
          return (
            <div key={name} className="rounded-xl border border-brand-100 bg-gradient-to-b from-brand-50 to-white p-2">
              <div className="mb-2 flex justify-between px-1 text-[11px] font-semibold text-brand-700"><span>{name}</span><span className="rounded-full bg-brand-600 px-1.5 text-white">{ls.length}</span></div>
              <div className="max-h-[420px] overflow-y-auto">{ls.map((l) => <LoanCard key={l.id} l={l} />)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { cycle, refreshCycles } = useApp();
  const { data, error, loading, reload } = useApi<any>(cycle ? `/dashboard?cycle_id=${cycle.id}` : "/dashboard", [cycle?.id, cycle?.day]);
  const work = useApi<any>(cycle ? `/work?cycle_id=${cycle.id}` : null, [cycle?.id, cycle?.day]);
  const [team, setTeam] = useState("");
  const act = useAction();
  if (loading && !data) return <Loading />;
  if (error) return <><PageHeader title="Cycle Dashboard" /><ErrorState error={error} retry={reload} />{error.status === 404 && <div className="mt-4"><Link className="btn-primary" to="/kickoff">Open the Kickoff wizard</Link></div>}</>;
  const d = data!;
  const k = d.kpis;
  const loans = d.loans.filter((l: any) => !team || l.team === team);
  const teams = Array.from(new Set(d.loans.map((l: any) => l.team))) as string[];
  const preG1 = d.loans.some((l: any) => ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11", "Q12", "Q13", "Q14"].includes(l.current_step) && l.status !== "approved");
  const g1Loans = loans.map((l: any) => ({ ...l, g1step: l.status === "waiting_on_lincoln" ? "Q14" : l.current_step }));
  return (
    <>
      <PageHeader title="Cycle Dashboard" subtitle={`${d.cycle.period} quarterly cycle, day 0 ${d.cycle.day0}, deadline ${d.cycle.deadline}`}
        actions={<>
          <select className="input w-40" value={team} onChange={(e) => setTeam(e.target.value)}><option value="">All deal teams</option>{teams.map((t) => <option key={t}>{t}</option>)}</select>
          <button className="btn-secondary" title="Demo clock: borrowers and Lincoln act on their days" disabled={d.cycle.status === "draft"} onClick={() => act.run(async () => { await api(`/cycles/${d.cycle.id}/advance`, { body: { days: 1 } }); await reload(); await refreshCycles(); })}>Next day</button>
          <button className="btn-secondary" onClick={() => window.print()}>Export PDF</button>
        </>} />
      {act.node}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Day of cycle" value={`${k.day} of ${k.length}`} sub={d.cycle.status === "closed" ? "Cycle closed" : d.cycle.status} />
        <Kpi label="Loans in cycle" value={k.loans} sub="in scope" />
        <Kpi label="Gates passed" value={`G1 ${k.g1_passed} of ${k.loans}`} />
        <Kpi label="Portfolio value so far" value={fmt.m(k.portfolio_current)} sub={<><Delta v={k.delta} /> vs {fmt.m(k.portfolio_previous)}; story loans {fmt.m(k.story_current)}</>} tone={k.delta < 0 ? "red" : undefined} />
        <Kpi label="Open tasks overdue" value={k.overdue} tone={k.overdue ? "red" : "green"} />
      </div>
      <ProcessStrip process={work.data?.process || []} />
      <Card title="45-day timeline" className="mb-6">
        <div className="relative h-16">
          {d.phases.map((p: any) => (
            <div key={p.phase} className={`absolute top-0 h-7 rounded-lg px-2 text-[11px] font-semibold leading-7 text-white shadow-sm ${PHASE_STYLE[p.phase - 1]?.bg || "bg-brand-600"} ${p.phase === 5 ? "!text-navy-900" : ""}`} style={{ left: `${(p.start / 45) * 100}%`, width: `${((p.end - p.start + 1) / 45) * 100}%`, top: p.phase === 3 ? 30 : 0 }} title={`${p.name}, days ${p.start} to ${p.end}${p.assumed ? " (assumed)" : ""}`}>
              <span className="truncate">{p.phase} {p.name}</span>
            </div>
          ))}
          {d.deadlines.map((x: any) => <div key={x.step} title={`${x.step} ${x.label}: day ${x.day}${x.assumed ? " (assumed)" : ""}`} className={`absolute bottom-0 h-3 w-0.5 ${x.day < k.day ? "bg-slate-300" : "bg-slate-500"}`} style={{ left: `${(x.day / 45) * 100}%` }} />)}
          <div className="absolute -top-1 bottom-0 w-1 rounded bg-danger-600" style={{ left: `${(k.day / 45) * 100}%` }} title={`Today: day ${k.day}`} />
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="Loan board">
            {preG1 && <><Lane title="Deal Team track" cols={DT_COLS} loans={loans} stepKey="dt_step" /><Lane title="Lincoln track" cols={LN_COLS} loans={loans} stepKey="lincoln_step" /></>}
            <Lane title={preG1 ? "From G1" : "Single lane from G1"} cols={G1_COLS} loans={g1Loans.filter((l: any) => ["Q14", "Q15", "Q16", "Q17", "Q18", "Q19", "Q20", "Q21", "Q22"].includes(l.g1step) && (l.status !== "in_progress"))} stepKey="g1step" />
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Needs attention">
            {d.attention.length ? d.attention.map((a: any, i: number) => <Link to={`/loans/${a.cycle_loan_id}`} key={i} className="mb-2 flex items-center justify-between rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700"><span>{a.title}</span><span className="text-xs">due day {a.day}</span></Link>)
              : <Empty text="Nothing overdue" />}
            {d.loans.filter((l: any) => l.status === "sent_back" || l.status === "waiting_on_lincoln").map((l: any) => <Link to={`/loans/${l.id}`} key={l.id} className="mb-2 flex items-center justify-between rounded-lg bg-warn-100 px-3 py-2 text-sm text-warn-700"><span>{l.borrower}</span><StatusChip status={l.status} /></Link>)}
          </Card>
          <Card title="Loops fired">
            <div className="grid grid-cols-3 gap-2 text-center">
              {Object.entries(d.loops).map(([kk, v]: any) => <div key={kk} className="rounded-lg bg-canvas-100 py-2"><div className="text-lg font-bold num">{v}</div><div className="text-[11px] text-slate-500">{kk}</div></div>)}
            </div>
            <div className="mt-3 text-[11px] text-slate-400">QA G1 send-back to Lincoln, QB review comments to analyst, QC Lincoln re-draft, QD approval rejected, QE governance returned, QF committee send-back.</div>
          </Card>
        </div>
      </div>
    </>
  );
}
