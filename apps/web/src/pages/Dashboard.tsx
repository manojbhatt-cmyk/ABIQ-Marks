import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmt, useApi } from "../api";
import { Card, Chip, Delta, Empty, ErrorState, Kpi, Loading, Loops, MoveChip, PageHeader, StatusChip, useAction } from "../components/ui";
import DemoControls from "../components/DemoControls";
import { useApp } from "../context";
import { PHASE_STYLE, ProcessStrip } from "./Work";
import { dayDate } from "../display";

const DT_COLS = [["Intake", ["Q1", "Q2", "Q3"]], ["Spread", ["Q4"]], ["CMR", ["Q5"]], ["Review", ["Q6", "Q7", "Q8", "Q9"]], ["Agreed", ["Q10", "Q11", "Q12", "Q13", "Q14", "Q15", "Q16", "Q17", "Q18", "Q19", "Q20", "Q21", "Q22"]]] as const;
const LN_COLS = [["Not shared", ["Q1", "Q2", "Q3"]], ["Package shared", ["Q10"]], ["Marks received", ["Q11"]], ["Loaded", ["Q12", "Q13"]]] as const;
const G1_COLS = [["G1", ["Q14"]], ["Approved", ["Q15"]], ["Agenda", ["Q16", "Q17", "Q18"]], ["Decided / Reconciled", ["Q19", "Q20", "Q21"]], ["Final", ["Q22"]]] as const;

function LoanCard({ l }: { l: any }) {
  const nav = useNavigate();
  const mark = l.final_mark ?? l.committee_mark ?? l.deal_team_mark ?? l.lincoln_mark;
  return (
    <button onClick={() => nav(`/loans/${l.id}`)} className="mb-2 w-full rounded-xl border-l-4 border-sky-500 bg-white p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-1"><span className="truncate text-[13px] font-semibold">{l.borrower}</span><span className="text-[11px] text-slate-400">{l.facility_id}</span></div>
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
      <div className="mb-2 text-xs font-medium text-slate-500">{title}</div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
        {cols.map(([name, steps]) => {
          const ls = loans.filter((l) => steps.includes(l[stepKey]));
          return (
            <div key={name} className="rounded-control border border-line bg-raised p-2">
              <div className="mb-2 flex justify-between px-1 text-[12px] font-medium text-muted"><span>{name}</span><span className="text-[11px] text-faint num">{ls.length}</span></div>
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
  if (error) return <><PageHeader title="Cycle dashboard" /><ErrorState error={error} retry={reload} />{error.status === 404 && <div className="mt-4"><Link className="btn-primary" to="/kickoff">Open the Kickoff wizard</Link></div>}</>;
  const d = data!;
  const k = d.kpis;
  const loans = d.loans.filter((l: any) => !team || l.team === team);
  const teams = Array.from(new Set(d.loans.map((l: any) => l.team))) as string[];
  const preG1 = d.loans.some((l: any) => ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11", "Q12", "Q13", "Q14"].includes(l.current_step) && l.status !== "approved");
  const g1Loans = loans.map((l: any) => ({ ...l, g1step: l.status === "waiting_on_lincoln" ? "Q14" : l.current_step }));
  return (
    <>
      <PageHeader title="Cycle dashboard" subtitle={`${d.cycle.period} quarterly cycle, quarter end ${d.cycle.day0}, deadline ${d.cycle.deadline}`}
        actions={<>
          <select className="input w-40" value={team} onChange={(e) => setTeam(e.target.value)}><option value="">All deal teams</option>{teams.map((t) => <option key={t}>{t}</option>)}</select>
          <button className="btn-secondary" onClick={() => window.print()}>Export PDF</button>
        </>} />
      {act.node}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Cycle" value={d.cycle.period} sub={d.cycle.status === "closed" ? "Closed" : d.cycle.status === "draft" ? "Kickoff pending" : "Open"} />
        <Kpi label="Loans in cycle" value={k.loans} sub="in scope" />
        <Kpi label="Gates passed" value={`G1 ${k.g1_passed} of ${k.loans}`} />
        <Kpi label="Portfolio value so far" value={fmt.m(k.portfolio_current)} sub={<><Delta v={k.delta} /> vs {fmt.m(k.portfolio_previous)}; all {k.loans} loans</>} tone={k.delta < 0 ? "red" : undefined} />
        <Kpi label="Open tasks overdue" value={k.overdue} tone={k.overdue ? "red" : "green"} />
      </div>
      <DemoControls />
      <ProcessStrip process={work.data?.process || []} />
      <Card title="Cycle calendar" subtitle="The six phases and the deadline for each step" className="mb-6">
        <div className="relative h-[84px]">
          {d.phases.map((p: any, i: number) => {
            const left = (Math.max(p.start, 0) / 45) * 100;
            const width = Math.min(((p.end - p.start + 1) / 45) * 100, 100 - left);
            return (
              <div key={p.phase} title={`${p.name}`} style={{ left: `${left}%`, width: `${width}%`, top: (i % 2) * 34 }}
                className="absolute h-7 overflow-hidden truncate rounded-chip border border-line bg-sunken px-2 text-[11.5px] font-medium leading-[26px] text-ink">{p.phase}. {p.name}</div>
            );
          })}
          {d.deadlines.map((x: any) => <div key={x.step} title={`${x.step} ${x.label}: day ${x.day}`} className="absolute bottom-0 h-3 w-0.5 rounded-full bg-strong" style={{ left: `${Math.min((x.day / 45) * 100, 99.6)}%` }} />)}
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="Loan values" subtitle="Every loan: last quarter, this quarter and how far the mark moved" className="mb-4">
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr><th className="th">Loan</th><th className="th text-right">Previous mark</th><th className="th text-right">Current mark</th><th className="th">Move</th><th className="th text-right">Previous value</th><th className="th text-right">Current value</th><th className="th text-right">Change</th><th className="th">Status</th></tr></thead>
              <tbody>{loans.map((l: any) => {
                const mark = l.final_mark ?? l.committee_mark ?? l.deal_team_mark ?? l.lincoln_mark;
                const change = l.previous_value != null && l.current_value != null ? l.current_value - l.previous_value : null;
                return (
                  <tr key={l.id}><td className="td font-medium">{l.borrower}<div className="text-xs text-muted">{l.facility_id}</div></td>
                    <td className="tdn">{fmt.mark(l.previous_mark)}</td><td className="tdn">{fmt.mark(mark)}</td><td className="td"><MoveChip move={l.move} /></td>
                    <td className="tdn">{fmt.num(l.previous_value, 3)}</td><td className="tdn">{fmt.num(l.current_value, 3)}</td>
                    <td className="tdn">{change == null ? "-" : <Delta v={change} />}</td><td className="td"><StatusChip status={l.status} /></td></tr>);
              })}</tbody>
            </table></div>
          </Card>
          <Card title="Loan board">
            {preG1 && <><Lane title="Deal Team track" cols={DT_COLS} loans={loans} stepKey="dt_step" /><Lane title="Lincoln track" cols={LN_COLS} loans={loans} stepKey="lincoln_step" /></>}
            <Lane title={preG1 ? "From G1" : "Single lane from G1"} cols={G1_COLS} loans={g1Loans.filter((l: any) => ["Q14", "Q15", "Q16", "Q17", "Q18", "Q19", "Q20", "Q21", "Q22"].includes(l.g1step) && (l.status !== "in_progress"))} stepKey="g1step" />
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Needs attention">
            {d.attention.length ? d.attention.map((a: any, i: number) => <Link to={`/loans/${a.cycle_loan_id}`} key={i} className="mb-2 flex items-center justify-between gap-3 rounded-control border border-danger-100 bg-danger-50 px-3 py-2 text-[13px] text-danger-700"><span>{a.title}</span><span className="text-xs">due {dayDate(a.day)}</span></Link>)
              : <Empty text="Nothing overdue" />}
            {d.loans.filter((l: any) => l.status === "sent_back" || l.status === "waiting_on_lincoln").map((l: any) => <Link to={`/loans/${l.id}`} key={l.id} className="mb-2 flex items-center justify-between rounded-control border border-warn-100 bg-warn-50 px-4 py-2.5 text-[13.5px] text-warn-700"><span>{l.borrower}</span><StatusChip status={l.status} /></Link>)}
          </Card>
          <Card title="Loops fired">
            <div className="grid grid-cols-3 gap-2 text-center">
              {Object.entries(d.loops).map(([kk, v]: any) => <div key={kk} className="rounded-control border border-line py-2.5"><div className="text-[18px] font-semibold num">{v}</div><div className="text-[11px] text-muted">{kk}</div></div>)}
            </div>
            <div className="mt-3 text-[11px] text-slate-400">QA G1 send-back to Lincoln, QB review comments to analyst, QC Lincoln re-draft, QD approval rejected, QE governance returned, QF committee send-back.</div>
          </Card>
        </div>
      </div>
    </>
  );
}
