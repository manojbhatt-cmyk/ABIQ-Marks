import { ArrowRight, Hand, UserCheck } from "lucide-react";
import { useState } from "react";
import data from "../process.json";
import { AiChip, Card, Chip, Kpi, PageHeader, Seg } from "../components/ui";

type Action = [string, string];
type Step = { code: string; name: string; owner: string; tools_before: string[]; before: Action[]; now: Action[]; decisions?: string[]; mode: string; tiq: string };
type Phase = { name: string; steps: Step[] };
const PHASES = data.phases as Phase[];

/** Hand actions for a portfolio of n loans: per-loan actions times n, plus once-per-cycle actions. */
const count = (acts: Action[], n: number) => acts.reduce((s, [, scope]) => s + (scope === "loan" ? n : 1), 0);
const pct = (before: number, now: number) => (before ? Math.round(((before - now) / before) * 100) : 0);

function Mode({ mode }: { mode: string }) {
  if (mode === "automated") return <Chip tone="green">Automated</Chip>;
  if (mode === "assisted") return <AiChip>AI-assisted</AiChip>;
  return <Chip>People decide</Chip>;
}

function Actions({ acts, n, empty }: { acts: Action[]; n: number; empty: string }) {
  if (!acts.length) return <div className="text-[13px] text-faint">{empty}</div>;
  return (
    <ul className="space-y-1.5">
      {acts.map(([a, scope], i) => (
        <li key={i} className="flex items-start gap-2 text-[13px] leading-snug text-ink">
          <Hand size={14} className="mt-0.5 shrink-0 text-faint" aria-hidden="true" />
          <span className="flex-1">{a}</span>
          <span className="shrink-0 text-[11px] text-faint num">{scope === "loan" ? `× ${n}` : "once"}</span>
        </li>))}
    </ul>
  );
}

function StepRow({ s, n, last }: { s: Step; n: number; last: boolean }) {
  const b = count(s.before, n), w = count(s.now, n);
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] md:gap-0">
      <div className="card p-4">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted">Today</span>
          {s.tools_before.map((t) => <span key={t} className="badge badge-gray">{t}</span>)}
          <span className="ml-auto text-xs text-muted num">{b} hand action{b === 1 ? "" : "s"}</span>
        </div>
        <Actions acts={s.before} n={n} empty="No hand actions." />
      </div>
      <div className="relative hidden md:block" aria-hidden="true">
        <div className={`absolute left-1/2 top-0 w-px -translate-x-1/2 bg-strong ${last ? "h-1/2" : "h-[calc(100%+16px)]"}`} />
        <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-strong bg-surface text-[11px] font-semibold text-muted num">{s.code.replace("Q", "")}</div>
        <ArrowRight size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-faint" />
      </div>
      <div className={`card p-4 ${s.mode === "automated" ? "" : s.mode === "assisted" ? "" : ""}`}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted">With ABIQ</span><Mode mode={s.mode} />
          <span className={`ml-auto text-xs font-medium num ${w < b ? "text-success-600" : "text-muted"}`}>{w} hand action{w === 1 ? "" : "s"}{b ? ` · ${pct(b, w)}% fewer` : ""}</span>
        </div>
        <p className="mb-2 text-[13px] leading-relaxed text-muted">{s.tiq}</p>
        <Actions acts={s.now} n={n} empty="No hand actions left." />
        {s.decisions?.length ? (
          <div className="mt-2.5 space-y-1 border-t border-line pt-2.5">{s.decisions.map((d) => (
            <div key={d} className="flex items-start gap-2 text-[13px] text-ink"><UserCheck size={14} className="mt-0.5 shrink-0 text-accent-600" aria-hidden="true" /><span><span className="text-muted">Decision stays with {s.owner}:</span> {d}</span></div>))}
          </div>) : null}
      </div>
    </div>
  );
}

export default function Process() {
  const [n, setN] = useState(5);
  const all = PHASES.flatMap((p) => p.steps);
  const before = all.reduce((t, s) => t + count(s.before, n), 0);
  const now = all.reduce((t, s) => t + count(s.now, n), 0);
  const decisions = all.reduce((t, s) => t + (s.decisions?.length || 0), 0);
  const modes = { automated: all.filter((s) => s.mode === "automated").length, assisted: all.filter((s) => s.mode === "assisted").length, person: all.filter((s) => s.mode === "person").length };
  return (
    <>
      <PageHeader title="Before and now" subtitle="The 22 quarterly steps as AllianceBernstein runs them today and as ABIQ runs them. The process does not change: agents prepare, people decide." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[13px] text-muted">Portfolio size</span>
        <Seg label="Portfolio size" value={String(n)} onChange={(v) => setN(Number(v))} options={[{ id: "5", label: "5 loans (demo)" }, { id: "24", label: "24 loans" }, { id: "60", label: "60 loans" }]} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Hand actions today" value={before} sub={`per quarter, ${n} loans`} icon={Hand} />
        <Kpi label="Hand actions with ABIQ" value={now} sub="review, confirm, send" icon={Hand} />
        <Kpi label="Manual effort reduced" value={`${pct(before, now)}%`} sub={`${before - now} fewer hand actions`} tone="green" />
        <Kpi label="Decisions kept with people" value={decisions} sub="approvals, marks, sign-offs" icon={UserCheck} />
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <Chip tone="green">Automated</Chip><span className="mr-3">{modes.automated} steps</span>
        <AiChip>AI-assisted</AiChip><span className="mr-3">{modes.assisted} steps</span>
        <Chip>People decide</Chip><span>{modes.person} steps</span>
      </div>
      <div className="space-y-8">
        {PHASES.map((p, i) => {
          const pb = p.steps.reduce((t, s) => t + count(s.before, n), 0), pn = p.steps.reduce((t, s) => t + count(s.now, n), 0);
          return (
            <section key={p.name} aria-label={p.name}>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-2">
                <span className="text-xs font-medium text-faint num">Phase {i + 1}</span>
                <h2 className="text-[16px] font-semibold">{p.name}</h2>
                <span className="text-xs text-muted">{p.steps[0].code} to {p.steps[p.steps.length - 1].code}</span>
                <span className="ml-auto text-[13px] text-muted num">{pb} → {pn} hand actions · <b className="text-success-600">{pct(pb, pn)}% fewer</b></span>
              </div>
              <div className="space-y-4">{p.steps.map((s, k) => <StepRow key={s.code} s={s} n={n} last={k === p.steps.length - 1} />)}</div>
            </section>);
        })}
      </div>
      <Card title="How the reduction is counted" className="mt-8">
        <p className="text-[13.5px] leading-relaxed text-ink">{data.method}</p>
        <p className="mt-2 text-xs text-muted">Source: {data.source}</p>
      </Card>
    </>
  );
}
