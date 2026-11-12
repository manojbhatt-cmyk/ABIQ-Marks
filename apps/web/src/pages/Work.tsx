import { ArrowRight, CheckCircle2, Clock, FastForward, Hourglass, MessagesSquare, Play } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmt, ROLE_LABEL, useApi } from "../api";
import { Card, Empty, ErrorState, Loading, PageHeader } from "../components/ui";
import DemoControls from "../components/DemoControls";
import { useApp } from "../context";

export const PHASE_STYLE = [
  { name: "Kickoff and intake", steps: ["Q1", "Q2", "Q3"], bg: "bg-brand-600", soft: "bg-brand-50 text-brand-700 border-brand-200" },
  { name: "Modelling and CMR", steps: ["Q4", "Q5", "Q6", "Q7", "Q8", "Q9"], bg: "bg-sky-500", soft: "bg-sky-50 text-sky-700 border-sky-100" },
  { name: "Lincoln draft marks", steps: ["Q10", "Q11", "Q12", "Q13"], bg: "bg-teal-400", soft: "bg-teal-50 text-teal-700 border-teal-100" },
  { name: "Deal Team approval", steps: ["Q14", "Q15"], bg: "bg-leaf-400", soft: "bg-leaf-50 text-leaf-700 border-leaf-100" },
  { name: "Valuation Committee", steps: ["Q16", "Q17", "Q18"], bg: "bg-lime-400", soft: "bg-lime-50 text-lime-700 border-lime-100" },
  { name: "Finalise and distribute", steps: ["Q19", "Q20", "Q21", "Q22"], bg: "bg-navy-900", soft: "bg-canvas-100 text-navy-900 border-canvas-200" },
];
export const STEP_LINK: Record<string, string> = {
  Q1: "/kickoff", Q2: "/intake", Q3: "/lincoln", Q4: "/loans", Q5: "/loans", Q6: "/reviews", Q7: "/reviews", Q8: "/reviews", Q9: "/reviews",
  Q10: "/lincoln", Q11: "/tracker", Q12: "/lincoln", Q13: "/lincoln", Q14: "/loans", Q15: "/loans", Q16: "/committee", Q17: "/committee",
  Q18: "/committee/meeting", Q19: "/reconciliation", Q20: "/approvals", Q21: "/approvals", Q22: "/distribution",
};
const phaseOf = (step: string) => PHASE_STYLE.find((p) => p.steps.includes(step)) || PHASE_STYLE[0];

export function ProcessStrip({ process }: { process: any[] }) {
  const nav = useNavigate();
  if (!process?.length) return null;
  return (
    <div className="card mb-6 p-4">
      <div className="mb-3 flex flex-wrap gap-3 text-[11px]">{PHASE_STYLE.map((p, i) => <span key={p.name} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${p.bg}`} />{i + 1} {p.name}</span>)}</div>
      <div className="grid grid-cols-11 gap-1.5 xl:grid-cols-22" style={{ gridTemplateColumns: "repeat(22, minmax(0, 1fr))" }}>
        {process.map((s) => {
          const ph = phaseOf(s.step);
          const pct = Math.round((s.done / s.total) * 100);
          return (
            <button key={s.step} title={`${s.step} ${s.name}: ${s.done} of ${s.total} loans past this step`} onClick={() => nav(STEP_LINK[s.step])}
              className={`group rounded-lg border p-1.5 text-left transition hover:-translate-y-0.5 ${s.state === "active" ? `${ph.soft} ring-2 ring-offset-1 ring-sky-500` : s.state === "done" ? ph.soft : "border-canvas-200 bg-white text-slate-400"}`}>
              <div className="flex items-center justify-between text-[10px] font-bold">{s.step}{s.state === "done" && <CheckCircle2 size={11} />}</div>
              <div className="mt-0.5 line-clamp-2 h-7 text-[9.5px] leading-tight">{s.name}</div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/5"><div className={`h-full ${ph.bg}`} style={{ width: `${pct}%` }} /></div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Work() {
  const { user, cycle } = useApp();
  const { data, error, loading, reload } = useApi<any>(`/work${cycle ? `?cycle_id=${cycle.id}` : ""}`, [cycle?.id, cycle?.day]);
  const msgs = useApi<any[]>("/messages", [cycle?.day]);
  const nav = useNavigate();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const actions = data.items.filter((i: any) => i.kind === "action");
  const waiting = data.items.filter((i: any) => i.kind === "waiting");
  const hour = new Date().getHours();
  const pm = user?.role === "pm_team" || user?.role === "admin";
  const inbox = (msgs.data || []).filter((m) => !m.sent).slice(0, 6);
  return (
    <>
      <PageHeader title={`Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${user!.name.split(" ")[0]}`}
        subtitle={`${ROLE_LABEL[user!.role]}${data.cycle ? ` · ${data.cycle.period}` : " · no cycle yet"} · ${actions.length} thing${actions.length === 1 ? "" : "s"} need you`} />
      <DemoControls />
      <ProcessStrip process={data.process} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-navy-900">Your next actions</h2><span className="text-xs text-slate-400">Worked out from the cycle, nothing to chase</span></div>
          {actions.length ? actions.map((i: any, k: number) => {
            const ph = phaseOf(i.step);
            return (
              <button key={k} onClick={() => nav(i.link)} className="card flex w-full items-center gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-white ${ph.bg}`}><span className="text-xs font-bold">{i.step}</span></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{i.step_name}</div>
                  <div className="font-semibold text-navy-900">{i.title}</div>
                  <div className="text-sm text-slate-500">{i.detail}</div>
                </div>
                <span className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white">Go <ArrowRight size={14} /></span>
              </button>);
          }) : <div className="card"><Empty text={data.cycle?.status === "closed" ? "The cycle is closed. Nothing left to do." : "Nothing needs you right now"} /></div>}
          {waiting.length > 0 && <>
            <h3 className="pt-2 text-sm font-semibold text-slate-500">Waiting on others</h3>
            {waiting.map((i: any, k: number) => <button key={k} onClick={() => nav(i.link)} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-canvas-200 bg-white/60 px-4 py-2.5 text-left text-sm"><Hourglass size={15} className="text-lime-700" /><span className="font-medium">{i.title}</span><span className="text-slate-400">{i.detail}</span></button>)}
          </>}
        </div>
        <div className="space-y-6">
          <Card title={<span className="flex items-center gap-2"><MessagesSquare size={15} className="text-brand-600" /> Messages</span>} actions={<button className="btn-ghost" onClick={() => nav("/messages")}>Open</button>}>
            {inbox.length ? inbox.map((m) => <button key={m.id} onClick={() => nav(m.link || "/messages")} className={`mb-2 block w-full rounded-xl px-3 py-2 text-left ${m.read ? "bg-canvas-50" : "bg-sky-50"}`}>
              <div className="text-sm font-medium">{m.subject}</div><div className="text-[11px] text-slate-500">from {m.from} · {fmt.date(m.at)}</div></button>)
              : <div className="text-sm text-slate-400">No messages yet</div>}
          </Card>
        </div>
      </div>
    </>
  );
}
