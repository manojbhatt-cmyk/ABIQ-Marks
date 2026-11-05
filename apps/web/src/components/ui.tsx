import { AlertTriangle, CheckCircle2, Inbox, Loader2, Lock, LockOpen, ShieldAlert, Sparkles, X } from "lucide-react";
import React, { ReactNode, useState } from "react";
import { ApiError, fmt } from "../api";

type Tone = "green" | "amber" | "red" | "blue" | "neutral" | "violet";
const TONES: Record<Tone, string> = {
  green: "bg-leaf-50 text-leaf-700",
  amber: "bg-warn-100 text-warn-700",
  red: "bg-danger-100 text-danger-700",
  blue: "bg-sky-50 text-sky-700",
  neutral: "bg-canvas-100 text-slate-500",
  violet: "bg-brand-100 text-brand-700",
};

export function Chip({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  done: "green", approved: "green", passed: "green", clean: "green", final: "green", complete: "green", match: "green",
  agreed: "green", filed: "green", reconciled: "green", decided: "green", signed: "green", monthly_final: "green",
  resolved: "green", accepted: "green", sent: "green", closed: "green",
  waiting_on_borrower: "amber", waiting_on_lincoln: "amber", in_review: "amber", in_progress: "amber", proposed: "amber",
  incomplete: "amber", draft: "amber", pending: "amber", requested: "amber", edited: "amber", ai_draft: "amber",
  explained: "amber", open: "amber",
  overdue: "red", sent_back: "red", mismatch: "red", failed: "red", fail: "red", late: "red", rejected: "red",
  pushed_back: "red", returned: "red", needs_review: "amber",
  not_started: "neutral", not_received: "neutral", on_agenda: "blue", deferred: "blue", empty: "neutral",
};

export function StatusChip({ status }: { status?: string | null }) {
  if (!status) return <Chip>-</Chip>;
  return <Chip tone={STATUS_TONE[status] || "neutral"}>{fmt.label(status)}</Chip>;
}

export function AssumedChip({ dq, what }: { dq?: string | null; what?: string }) {
  return (
    <span title={`Assumed rule${what ? `: ${what}` : ""}. Not yet confirmed by AllianceBernstein${dq ? ` (discovery question ${dq})` : ""}.`}
      className="inline-flex items-center rounded-full border border-warn-700/40 px-2 py-0.5 text-[10px] font-semibold text-warn-700">Assumed{dq ? ` ${dq}` : ""}</span>
  );
}

export function ConfirmedChip() {
  return <span className="inline-flex items-center rounded-full border border-success-700/40 px-2 py-0.5 text-[10px] font-semibold text-success-700">Confirmed</span>;
}

export function LoopBadge({ code, n }: { code: string; n: number }) {
  if (!n) return null;
  return <span title={`Rework loop ${code}`} className="inline-flex items-center rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{code} x{n}</span>;
}

export function Loops({ loops }: { loops?: Record<string, number> }) {
  return <>{Object.entries(loops || {}).map(([k, v]) => <LoopBadge key={k} code={k} n={v} />)}</>;
}

export function Card({ title, children, actions, className = "", ai }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; ai?: boolean }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between border-b border-canvas-100 px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">{ai && <Sparkles size={14} className="text-brand-600" />}{title}</div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

const ACCENTS = ["border-t-brand-600", "border-t-sky-500", "border-t-teal-400", "border-t-leaf-400", "border-t-lime-400"];
let kpiCount = 0;
export function Kpi({ label, value, sub, tone, accent }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "red" | "green"; accent?: number }) {
  const a = ACCENTS[(accent ?? kpiCount++) % ACCENTS.length];
  return (
    <div className={`card border-t-4 ${a} px-5 py-4`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold num ${tone === "red" ? "text-danger-700" : tone === "green" ? "text-success-700" : "text-slate-900"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500 num">{sub}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, ai, actions }: { title: string; subtitle?: ReactNode; ai?: boolean; actions?: ReactNode }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl bg-hero px-6 py-5 text-white shadow-card">
      <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-teal-400/20" />
      <div className="pointer-events-none absolute right-24 -bottom-20 h-40 w-40 rounded-full bg-leaf-400/20" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">{title}{ai && <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold"><Sparkles size={12} /> AI assisted</span>}</h1>
          {subtitle && <p className="mt-1 text-sm text-brand-100">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 [&_.btn-secondary]:border-white/30 [&_.btn-secondary]:bg-white/10 [&_.btn-secondary]:text-white [&_.btn-secondary:hover]:bg-white/20 [&_.input]:border-white/30 [&_.btn-primary]:bg-white [&_.btn-primary]:text-brand-700 [&_.btn-primary:hover]:bg-brand-50">{actions}</div>
      </div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[0, 1, 2].map((i) => <div key={i} className="card h-28 animate-pulse bg-white" />)}
      <div className="card col-span-full h-64 animate-pulse" />
    </div>
  );
}

export function ErrorState({ error, retry }: { error: ApiError | Error; retry?: () => void }) {
  const denied = (error as ApiError).status === 403;
  return (
    <div className="card flex items-center gap-3 p-6 text-sm">
      {denied ? <ShieldAlert className="text-danger-700" /> : <AlertTriangle className="text-danger-700" />}
      <div className="flex-1">
        <div className="font-semibold">{denied ? "Permission denied" : "Something went wrong"}</div>
        <div className="text-slate-500">{error.message}</div>
      </div>
      {retry && !denied && <button className="btn-secondary" onClick={retry}>Retry</button>}
    </div>
  );
}

export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-400">
      <Inbox size={28} />
      <div>{text}</div>
      {action}
    </div>
  );
}

export function Banner({ tone = "amber", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${TONES[tone]}`}>{children}</div>;
}

export function Running({ text }: { text: string }) {
  return <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-700"><Loader2 size={14} className="animate-spin" /> {text}</div>;
}

export function ConfidenceRing({ value }: { value?: number | null }) {
  if (value === null || value === undefined) return <Chip>no evidence</Chip>;
  const pct = Math.round(value * 100);
  const color = value >= 0.9 ? "#3F7A1F" : value >= 0.7 ? "#8A6D00" : "#B42318";
  return (
    <span title={`Confidence ${pct}%`} className="relative inline-flex h-6 w-6 items-center justify-center">
      <svg viewBox="0 0 36 36" className="h-6 w-6 -rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="#E3E8ED" strokeWidth="4" /><circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="4" strokeDasharray={`${pct * 0.94} 100`} /></svg>
      <span className="absolute text-[8px] font-bold num" style={{ color }}>{pct}</span>
    </span>
  );
}

/** AI suggestion card (UI UX Spec 1.3): brand wash, sparkle, evidence, confidence, Accept / Edit / Reject. */
export function AiCard({ title = "TIQ suggests", children, confidence, status, decidedBy, actions, evidence }: {
  title?: string; children: ReactNode; confidence?: number | null; status?: string; decidedBy?: string | null; actions?: ReactNode; evidence?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-700"><Sparkles size={14} /> {title}</div>
        <div className="flex items-center gap-2">{confidence !== undefined && <ConfidenceRing value={confidence} />}{status && status !== "proposed" && <Chip tone={status === "rejected" ? "red" : "green"}>{status}{decidedBy ? ` by ${decidedBy.split("@")[0]}` : ""}</Chip>}</div>
      </div>
      <div className="text-sm text-slate-700">{children}</div>
      {evidence && <div className="mt-2 text-xs text-slate-500">{evidence}</div>}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      <div className="mt-2 text-[10px] text-brand-700/70">Agents prepare, people decide. Nothing here is applied until you act.</div>
    </div>
  );
}

export function Modal({ title, children, onClose, footer, wide }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4" onClick={onClose}>
      <div className={`card w-full ${wide ? "max-w-4xl" : "max-w-lg"} max-h-[90vh] overflow-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-canvas-100 px-5 py-3"><div className="font-semibold">{title}</div><button className="btn-ghost" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="p-5 text-sm">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-canvas-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation that repeats the decision in words (UI UX Spec section 5). */
export function useConfirm() {
  const [state, setState] = useState<{ text: ReactNode; run: () => Promise<any>; danger?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ask = (text: ReactNode, run: () => Promise<any>, danger = false) => { setErr(null); setState({ text, run, danger }); };
  const node = state ? (
    <Modal title="Please confirm" onClose={() => setState(null)} footer={<>
      <button className="btn-secondary" onClick={() => setState(null)}>Cancel</button>
      <button className={state.danger ? "btn-danger" : "btn-primary"} disabled={busy} onClick={async () => {
        setBusy(true);
        try { await state.run(); setState(null); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
      }}>{busy ? "Working..." : "Confirm"}</button></>}>
      <div className="text-slate-700">{state.text}</div>
      {err && <div className="mt-3 rounded bg-danger-100 px-3 py-2 text-danger-700">{err}</div>}
    </Modal>
  ) : null;
  return { ask, node };
}

/** Run an action, surface errors inline. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const node = error ? <div className="mb-3 flex items-center gap-2 rounded-lg bg-danger-100 px-3 py-2 text-sm text-danger-700"><AlertTriangle size={14} /> {error}<button className="ml-auto" onClick={() => setError(null)}><X size={14} /></button></div> : null;
  return { busy, error, run, node };
}

export function GateIcon({ state }: { state: "closed" | "open" | "passed" }) {
  if (state === "passed") return <CheckCircle2 size={16} className="text-success-700" />;
  if (state === "open") return <LockOpen size={16} className="text-brand-600" />;
  return <Lock size={16} className="text-slate-400" />;
}

export function Delta({ v, d = 3 }: { v?: number | null; d?: number }) {
  if (v === null || v === undefined) return <span>-</span>;
  const cls = v < -1e-9 ? "text-danger-700" : v > 1e-9 ? "text-success-700" : "text-slate-500";
  return <span className={`num ${cls}`}>{v < -1e-9 ? "↓ " : v > 1e-9 ? "↑ " : ""}{fmt.delta(v, d)}</span>;
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: ReactNode }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="mb-4 flex gap-1 border-b border-canvas-200">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${active === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t.label}</button>
      ))}
    </div>
  );
}

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block"><span className="label">{label}</span>{children}</label>
);

export default React;
