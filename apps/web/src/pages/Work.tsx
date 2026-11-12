import { ArrowRight, CheckCircle2, Clock, FastForward, Hourglass, MessagesSquare, Play } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmt, ROLE_LABEL, useApi } from "../api";
import { Card, Empty, ErrorState, Loading, PageHeader } from "../components/ui";
import DemoControls from "../components/DemoControls";
import { useApp } from "../context";

/* Phases are told apart by their names, not by colour (Design.md 1.2: colour has a job). */
const SOFT = "bg-brand-50 text-brand-700 border-brand-300";
export const PHASE_STYLE = [
  { name: "Kickoff and intake", steps: ["Q1", "Q2", "Q3"], bg: "bg-brand-600", soft: SOFT },
  { name: "Modelling and CMR", steps: ["Q4", "Q5", "Q6", "Q7", "Q8", "Q9"], bg: "bg-brand-600", soft: SOFT },
  { name: "Lincoln draft marks", steps: ["Q10", "Q11", "Q12", "Q13"], bg: "bg-brand-600", soft: SOFT },
  { name: "Deal Team approval", steps: ["Q14", "Q15"], bg: "bg-brand-600", soft: SOFT },
  { name: "Valuation Committee", steps: ["Q16", "Q17", "Q18"], bg: "bg-brand-600", soft: SOFT },
  { name: "Finalise and distribute", steps: ["Q19", "Q20", "Q21", "Q22"], bg: "bg-brand-600", soft: SOFT },
];
export const STEP_LINK: Record<string, string> = {
  Q1: "/kickoff", Q2: "/intake", Q3: "/lincoln", Q4: "/loans", Q5: "/loans", Q6: "/reviews", Q7: "/reviews", Q8: "/reviews", Q9: "/reviews",
  Q10: "/lincoln", Q11: "/tracker", Q12: "/lincoln", Q13: "/lincoln", Q14: "/loans", Q15: "/loans", Q16: "/committee", Q17: "/committee",
  Q18: "/committee/meeting", Q19: "/reconciliation", Q20: "/approvals", Q21: "/approvals", Q22: "/distribution",
};

/** The 22 steps as a stepper (Design.md 8.10): done filled blue with a check, current ringed with a halo, to do grey. */
export function ProcessStrip({ process }: { process: any[] }) {
  const nav = useNavigate();
  if (!process?.length) return null;
  const current = process.filter((s) => s.state === "active");
  const done = process.filter((s) => s.state === "done").length;
  return (
    <section className="card mb-6 px-6 py-5" aria-label="Process">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">The quarter, step by step</h2>
        <span className="text-[12.5px] text-slate-500">{done} of 22 steps done{current.length ? ` · now: ${current.slice(0, 2).map((s) => `${s.step.replace("Q", "")} ${s.name}`).join(", ")}` : ""}</span>
      </div>
      <div className="grid gap-x-2" style={{ gridTemplateColumns: "3fr 6fr 4fr 2fr 3fr 4fr" }}>
        {PHASE_STYLE.map((ph, i) => {
          const steps = process.filter((s) => ph.steps.includes(s.step));
          return (
            <div key={ph.name} className="min-w-0">
              <div className="truncate pb-2 text-[11.5px] font-semibold uppercase tracking-[0.03em] text-slate-500" title={ph.name}>{i + 1}. {ph.name}</div>
              <div className="relative flex justify-between">
                <span className="absolute left-3 right-3 top-[13px] h-0.5 bg-line-200" aria-hidden="true" />
                {steps.map((s) => (
                  <button key={s.step} onClick={() => nav(STEP_LINK[s.step])} aria-label={`Step ${s.step.replace("Q", "")}: ${s.name}, ${s.done} of ${s.total} loans past it`}
                    title={`${s.step.replace("Q", "")}. ${s.name}: ${s.done} of ${s.total} loans past this step`}
                    className={`relative z-[1] flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-colors duration-150 ${s.state === "done" ? "bg-brand-600 text-white hover:bg-brand-500" : s.state === "active" ? "border-2 border-brand-600 bg-white text-brand-700 ring-4 ring-brand-100" : "border-2 border-slate-300 bg-white text-slate-400 hover:border-brand-300"}`}>
                    {s.state === "done" ? <CheckCircle2 size={14} aria-hidden="true" /> : s.step.replace("Q", "")}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
          <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">Your next actions</h2><span className="text-xs text-slate-500">Worked out from the cycle, nothing to chase</span></div>
          {actions.length ? actions.map((i: any, k: number) => {
            return (
              <button key={k} onClick={() => nav(i.link)} className="card card-hover flex w-full items-center gap-4 px-5 py-4 text-left">
                <span className="tile bg-brand-100 text-[13px] font-bold text-brand-700">{String(i.step).replace("Q", "")}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] font-semibold uppercase tracking-[0.03em] text-slate-500">{i.step_name}</div>
                  <div className="text-[15px] font-semibold text-ink-900">{i.title}</div>
                  <div className="text-[13.5px] text-slate-500">{i.detail}</div>
                </div>
                <span className="btn-secondary btn-sm">Go <ArrowRight size={14} aria-hidden="true" /></span>
              </button>);
          }) : <div className="card"><Empty text={data.cycle?.status === "closed" ? "The cycle is closed. Nothing left to do." : "Nothing needs you right now"} /></div>}
          {waiting.length > 0 && <>
            <h3 className="pt-2 text-[13px] font-semibold text-slate-500">Waiting on others</h3>
            {waiting.map((i: any, k: number) => <button key={k} onClick={() => nav(i.link)} className="flex w-full items-center gap-3 rounded-panel border border-dashed border-line-200 bg-surface-50 px-4 py-2.5 text-left text-[13.5px] transition-colors duration-150 hover:border-brand-300"><Hourglass size={16} className="text-slate-400" aria-hidden="true" /><span className="font-medium text-ink-900">{i.title}</span><span className="text-slate-500">{i.detail}</span></button>)}
          </>}
        </div>
        <div className="space-y-6">
          <Card title={<span className="flex items-center gap-2"><MessagesSquare size={18} className="text-brand-600" aria-hidden="true" /> Messages</span>} subtitle="Internal communication, inside TIQ" actions={<button className="btn-ghost btn-sm" onClick={() => nav("/messages")}>Open</button>}>
            {inbox.length ? inbox.map((m) => <button key={m.id} onClick={() => nav(m.link || "/messages")} className={`mb-2 block w-full rounded-tile border px-3 py-2 text-left transition-colors duration-150 hover:border-brand-300 ${m.read ? "border-line-200 bg-white" : "border-info-100 bg-info-100"}`}>
              <div className="text-[13.5px] font-medium text-ink-900">{m.subject}</div><div className="text-xs text-slate-500">from {m.from} · {fmt.date(m.at)}</div></button>)
              : <Empty text="No messages yet" hint="Kickoff, impact notes and the committee pack arrive here." />}
          </Card>
        </div>
      </div>
    </>
  );
}
