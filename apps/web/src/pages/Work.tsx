import { ArrowRight, CheckCircle2, Clock, FastForward, Hourglass, MessagesSquare, Play } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmt, ROLE_LABEL, useApi } from "../api";
import { Card, Empty, ErrorState, Loading, PageHeader } from "../components/ui";
import DemoControls from "../components/DemoControls";
import { DeadlinesCard } from "../components/Reminders";
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

/** The quarter as six phases. Each card shows its state, a bar with one segment per step, and the step in hand.
 * Done phases are quiet, the current one is highlighted, later ones are grey. Step names are on hover. */
export function ProcessStrip({ process }: { process: any[] }) {
  const nav = useNavigate();
  if (!process?.length) return null;
  const doneAll = process.filter((s) => s.state === "done").length;
  return (
    <section className="mb-6" aria-label="Where the quarter stands">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[16px] font-semibold">Where the quarter stands</h2>
        <span className="text-[12px] text-muted num">{doneAll} of {process.length} steps done</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
        {PHASE_STYLE.map((ph, i) => {
          const steps = process.filter((x) => ph.steps.includes(x.step));
          const done = steps.filter((x) => x.state === "done").length;
          const active = steps.find((x) => x.state === "active");
          const state = done === steps.length ? "done" : active || done ? "active" : "todo";
          const target = active || steps.find((x) => x.state !== "done") || steps[steps.length - 1];
          return (
            <button key={ph.name} onClick={() => target && nav(STEP_LINK[target.step])}
              className={`card-hover flex min-h-[128px] flex-col rounded-card border p-4 text-left ${state === "active" ? "border-accent-300 bg-surface" : state === "done" ? "border-line bg-surface" : "border-line bg-raised"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${state === "done" ? "border-success-100 bg-success-50 text-success-600" : state === "active" ? "border-accent-300 bg-accent-50 text-accent-700" : "border-line text-faint"}`}>
                  {state === "done" ? <CheckCircle2 size={14} aria-hidden="true" /> : i + 1}
                </span>
                <span className={`badge ${state === "done" ? "badge-green" : state === "active" ? "badge-amber" : "badge-gray"}`}>
                  {state === "done" ? "Done" : state === "active" ? "In progress" : "Not started"}
                </span>
              </div>
              <div className={`mt-3 text-[14px] font-semibold leading-snug ${state === "todo" ? "text-muted" : "text-ink"}`}>{ph.name}</div>
              <div className="mt-auto pt-4">
                <div className="flex gap-1">
                  {steps.map((x) => (
                    <span key={x.step} title={`${x.step.replace("Q", "")}. ${x.name}: ${x.done} of ${x.total} loans past it`}
                      className={`h-1.5 flex-1 rounded-full ${x.state === "done" ? "bg-success-500" : x.state === "active" ? "bg-brand-300" : "bg-sunken"}`} />
                  ))}
                </div>
                <div className="mt-2 truncate text-xs text-muted">
                  {state === "active" && active ? `Now: ${active.name}` : `${done} of ${steps.length} steps`}
                </div>
              </div>
            </button>
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
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-[16px] font-semibold">Your next actions</h2><span className="text-xs text-muted">Worked out from the cycle, nothing to chase</span></div>
          {actions.length ? actions.map((i: any, k: number) => {
            return (
              <button key={k} onClick={() => nav(i.link)} className="card card-hover flex w-full items-center gap-4 p-5 text-left">
                <span className="tile num border border-line bg-raised text-[13px] font-semibold text-muted">{String(i.step).replace("Q", "")}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-muted">Step {String(i.step).replace("Q", "")} · {i.step_name}</div>
                  <div className="mt-0.5 text-[14px] font-semibold text-ink">{i.title}</div>
                  <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{i.detail}</div>
                </div>
                <span className="btn-secondary btn-sm shrink-0">Open <ArrowRight size={14} aria-hidden="true" /></span>
              </button>);
          }) : <div className="card"><Empty text={data.cycle?.status === "closed" ? "The cycle is closed. Nothing left to do." : "Nothing needs you right now"} /></div>}
          {waiting.length > 0 && <>
            <h3 className="pt-4 text-[13px] font-semibold text-muted">Waiting on others</h3>
            {waiting.map((i: any, k: number) => <button key={k} onClick={() => nav(i.link)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-dashed border-strong bg-raised px-4 py-3 text-left text-[13px] transition-colors duration-150 hover:bg-sunken"><Hourglass size={16} className="text-faint" aria-hidden="true" /><span className="font-medium text-ink">{i.title}</span><span className="text-muted">{i.detail}</span></button>)}
          </>}
        </div>
        <div className="space-y-4">
          {data.cycle && <DeadlinesCard />}
          <Card title={<span className="flex items-center gap-2"><MessagesSquare size={18} className="text-muted" aria-hidden="true" /> Messages</span>} subtitle="Internal communication, inside TIQ" actions={<button className="btn-ghost btn-sm" onClick={() => nav("/messages")}>Open</button>}>
            {inbox.length ? inbox.map((m) => <button key={m.id} onClick={() => nav(m.link || "/messages")} className="mb-1 flex w-full items-start gap-2.5 rounded-control px-2 py-2 text-left transition-colors duration-150 hover:bg-sunken">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${m.read ? "bg-transparent" : "bg-accent-500"}`} aria-hidden="true" />
              <span className="min-w-0"><span className={`block text-[13px] text-ink ${m.read ? "" : "font-semibold"}`}>{m.subject}</span><span className="block text-xs text-muted">from {m.from.split("@")[0]} · {fmt.date(m.at)}</span></span></button>)
              : <Empty text="No messages yet" hint="Kickoff, impact notes and the committee pack arrive here." />}
          </Card>
        </div>
      </div>
    </>
  );
}
