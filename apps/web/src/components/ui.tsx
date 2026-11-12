import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CalendarClock, CheckCircle2, Clock, Coins, Inbox, Layers,
  Lock, LockOpen, ShieldAlert, Sparkles, X,
} from "lucide-react";
import React, { ReactNode, useEffect, useState } from "react";
import { ApiError, fmt } from "../api";

/* Tones (Design.md 3.7): pick by meaning. "violet" is kept as a name only and renders as brand: no purple. */
type Tone = "green" | "amber" | "red" | "blue" | "neutral" | "violet" | "brand";
const BADGE: Record<Tone, string> = {
  green: "bg-success-100 text-success-700",
  amber: "bg-warn-100 text-warn-700",
  red: "bg-danger-100 text-danger-700",
  blue: "bg-info-100 text-info-700",
  neutral: "bg-canvas-100 text-slate-500",
  violet: "bg-brand-100 text-brand-700",
  brand: "bg-brand-100 text-brand-700",
};
const TILE: Record<Tone, string> = {
  green: "bg-success-100 text-success-600",
  amber: "bg-warn-100 text-warn-600",
  red: "bg-danger-100 text-danger-600",
  blue: "bg-info-100 text-info-600",
  neutral: "bg-canvas-100 text-slate-500",
  violet: "bg-brand-100 text-brand-600",
  brand: "bg-brand-100 text-brand-600",
};

export function Chip({ tone = "neutral", children, title, dot }: { tone?: Tone; children: ReactNode; title?: string; dot?: boolean }) {
  return (
    <span title={title} className={`badge ${BADGE[tone]}`}>
      {dot && <span className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />}{children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  done: "green", approved: "green", passed: "green", clean: "green", final: "green", complete: "green", match: "green",
  agreed: "green", filed: "green", reconciled: "green", decided: "green", signed: "green", monthly_final: "green",
  resolved: "green", accepted: "green", closed: "green",
  sent: "blue", queued: "blue", new: "blue", on_agenda: "blue", deferred: "blue",
  waiting_on_borrower: "amber", waiting_on_lincoln: "amber", in_review: "amber", in_progress: "amber", proposed: "amber",
  incomplete: "amber", draft: "amber", pending: "amber", requested: "amber", edited: "amber", ai_draft: "amber",
  explained: "amber", open: "amber", needs_review: "amber",
  overdue: "red", sent_back: "red", mismatch: "red", failed: "red", fail: "red", late: "red", rejected: "red",
  pushed_back: "red", returned: "red", mismatches: "red",
  not_started: "neutral", not_received: "neutral", empty: "neutral",
};

export function StatusChip({ status }: { status?: string | null }) {
  if (!status) return <span className="text-slate-400">-</span>;
  return <Chip tone={STATUS_TONE[status] || "neutral"}>{fmt.label(status)}</Chip>;
}

/** Marks a rule AllianceBernstein has not confirmed yet. Extra small warn badge. */
export function AssumedChip({ dq, what }: { dq?: string | null; what?: string }) {
  return (
    <span title={`Assumed rule${what ? `: ${what}` : ""}. Not yet confirmed by AllianceBernstein${dq ? ` (discovery question ${dq})` : ""}.`}
      className="inline-flex h-[17px] items-center whitespace-nowrap rounded-full bg-warn-100 px-2 text-[10.5px] font-semibold text-warn-700">Assumed{dq ? ` ${dq}` : ""}</span>
  );
}

export function ConfirmedChip() {
  return <span className="inline-flex h-[17px] items-center rounded-full bg-success-100 px-2 text-[10.5px] font-semibold text-success-700">Confirmed</span>;
}

export function LoopBadge({ code, n }: { code: string; n: number }) {
  if (!n) return null;
  return <span title={`Rework loop ${code}: ${n} time${n === 1 ? "" : "s"}`} className="inline-flex h-[17px] items-center rounded-full bg-brand-100 px-2 text-[10.5px] font-semibold text-brand-700">{code} x{n}</span>;
}

export function Loops({ loops }: { loops?: Record<string, number> }) {
  return <>{Object.entries(loops || {}).map(([k, v]) => <LoopBadge key={k} code={k} n={v} />)}</>;
}

/** Card (8.5): 15px title, optional subtitle, actions on the right, 16px above the content. */
export function Card({ title, subtitle, children, actions, className = "", ai, flush }: {
  title?: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; ai?: boolean; flush?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-ink-900">{ai && <Sparkles size={16} className="text-brand-600" aria-hidden="true" />}{title}</h3>
            {subtitle && <div className="mt-0.5 text-[12.5px] text-slate-500">{subtitle}</div>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={`min-w-0 overflow-x-auto ${flush ? "mt-4" : `px-6 pb-5 ${title || actions ? "pt-4" : "pt-5"}`}`}>{children}</div>
    </section>
  );
}

const KPI_ICON: [RegExp, any][] = [
  [/value|portfolio|delta|story/i, Coins], [/loan|facilit/i, Layers], [/gate|pass|approv/i, CheckCircle2],
  [/overdue|late|risk|mismatch/i, Clock], [/day|cycle|date/i, CalendarClock], [/run|check|match/i, Activity],
];

/** KPI card (8.6): icon tile, two-line label, 28px value; values line up across a row. */
export function Kpi({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "red" | "green" | "amber" | "blue" | "neutral" | "brand"; accent?: number; icon?: any }) {
  const Icon = icon || KPI_ICON.find(([re]) => re.test(label))?.[1] || BarChart3;
  const t: Tone = tone === "red" ? "red" : tone === "green" ? "green" : tone === "amber" ? "amber" : tone === "blue" ? "blue" : tone === "neutral" ? "neutral" : "brand";
  return (
    <div className="card flex min-h-[148px] flex-col px-5 py-4">
      <span className={`tile ${TILE[t]}`}><Icon size={18} aria-hidden="true" /></span>
      <div className="mt-3 line-clamp-2 min-h-[39px] text-[13px] leading-snug text-slate-500">{label}</div>
      <div className="mt-auto text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink-900 num">{value}</div>
      {sub && <div className="mt-1 text-[12.5px] text-slate-500 num">{sub}</div>}
    </div>
  );
}

/** Page header (9.2): 24px title with the AI mark, 14px subtitle, actions on the right with the primary last. */
export function PageHeader({ title, subtitle, ai, actions, back }: { title: string; subtitle?: ReactNode; ai?: boolean; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && <div className="mb-2 text-[13px] text-slate-500">{back}</div>}
        <h1 className="flex items-center gap-2 text-[22px] font-semibold leading-tight tracking-[-0.015em] text-ink-900">
          {title}{ai && <span title="AI assisted: agents prepare, people decide" className="inline-flex"><Sparkles size={20} className="text-brand-600" aria-label="AI assisted" /></span>}
        </h1>
        {subtitle && <p className="mt-1 max-w-[720px] text-[13.5px] leading-relaxed text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 text-[13px] text-slate-500" role="status">
      <span className="spinner" aria-hidden="true" />{label}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: ApiError | Error; retry?: () => void }) {
  const denied = (error as ApiError).status === 403;
  return (
    <div role="alert" className="flex items-center gap-3 rounded-tile bg-danger-100 px-4 py-3 text-[13.5px] text-danger-700">
      {denied ? <ShieldAlert size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
      <div className="flex-1"><b>{denied ? "You don't have access to this." : "Something went wrong."}</b> {error.message}</div>
      {retry && !denied && <button className="btn-secondary btn-sm" onClick={retry}>Try again</button>}
    </div>
  );
}

/** Empty state (8.13): says what to do next and offers the button to do it. */
export function Empty({ text, hint, action, icon: Icon = Inbox }: { text: string; hint?: ReactNode; action?: ReactNode; icon?: any }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-panel bg-brand-50 text-brand-600"><Icon size={20} aria-hidden="true" /></span>
      <div className="mt-1 text-[15px] font-semibold text-ink-900">{text}</div>
      {hint && <div className="max-w-[460px] text-[13.5px] text-slate-500">{hint}</div>}
      {action && <div className="mt-2 flex gap-2">{action}</div>}
    </div>
  );
}

const NOTE: Record<Tone, string> = {
  amber: "border border-warn-500 bg-warn-100 text-warn-700",
  red: "bg-danger-100 text-danger-700",
  blue: "border border-info-500 bg-info-100 text-ink-700",
  green: "bg-success-100 text-success-700",
  neutral: "border border-line-200 bg-surface-50 text-slate-500",
  violet: "border border-brand-100 bg-brand-50 text-ink-700",
  brand: "border border-brand-100 bg-brand-50 text-ink-700",
};
export function Banner({ tone = "amber", children }: { tone?: Tone; children: ReactNode }) {
  return <div role={tone === "red" ? "alert" : undefined} className={`mb-4 rounded-tile px-4 py-3 text-[13.5px] ${NOTE[tone]}`}>{children}</div>;
}

export function Running({ text }: { text: string }) {
  return <div role="status" className="flex items-center gap-3 rounded-tile border border-brand-100 bg-brand-50 px-4 py-3 text-[13.5px] text-ink-700"><span className="spinner !h-4 !w-4 !border-2" aria-hidden="true" /> {text}</div>;
}

/** Confidence bar (8.14): success from 70, warn 45 to 69, danger below 45. */
export function ConfidenceRing({ value }: { value?: number | null }) {
  if (value === null || value === undefined) return <span className="text-xs text-slate-400">no evidence</span>;
  const pct = Math.round(value * 100);
  const fill = pct >= 70 ? "bg-success-500" : pct >= 45 ? "bg-warn-500" : "bg-danger-500";
  return (
    <span title={`Confidence ${pct}%`} className="inline-flex items-center gap-1.5 align-middle">
      <span className="inline-block h-1.5 w-12 overflow-hidden rounded-full bg-line-200"><span className={`block h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} /></span>
      <span className="text-[11px] font-semibold text-slate-500 num">{pct}%</span>
    </span>
  );
}

/** AI suggestion: the AI strip with its basis badge, confidence and the human decision. */
export function AiCard({ title = "TIQ suggests", children, confidence, status, decidedBy, actions, evidence }: {
  title?: string; children: ReactNode; confidence?: number | null; status?: string; decidedBy?: string | null; actions?: ReactNode; evidence?: ReactNode;
}) {
  return (
    <div className="ai-strip">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink-900"><Sparkles size={16} className="text-brand-600" aria-hidden="true" /> {title}</div>
        <div className="flex items-center gap-2">
          <Chip tone="brand" title="Agents prepare, people decide. Nothing here is applied until you act.">AI model</Chip>
          {confidence !== undefined && <ConfidenceRing value={confidence} />}
          {status && status !== "proposed" && <Chip tone={status === "rejected" ? "red" : "green"}>{fmt.label(status)}{decidedBy ? ` by ${decidedBy.split("@")[0]}` : ""}</Chip>}
        </div>
      </div>
      <div className="text-[13.5px] leading-relaxed text-ink-600">{children}</div>
      {evidence && <div className="mt-2 text-xs text-slate-500">{evidence}</div>}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Modal (8.12): scrim fades, dialog rises 8px; Escape and scrim click close it. */
export function Modal({ title, children, onClose, footer, wide }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="anim-scrim fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(11,20,55,.45)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`anim-modal flex max-h-[calc(100vh-48px)] w-full flex-col rounded-modal bg-white shadow-raised ${wide ? "max-w-[860px]" : "max-w-[560px]"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5"><h3 className="text-[17px] font-bold text-ink-900">{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="overflow-auto px-6 py-4 text-sm">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 pb-5 pt-1">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation that repeats the decision in words. */
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
      }}>{busy ? "Working" : "Confirm"}</button></>}>
      <div className="text-[14px] leading-relaxed text-ink-700">{state.text}</div>
      {err && <div role="alert" className="mt-3 rounded-tile bg-danger-100 px-3 py-2 text-[13.5px] text-danger-700">{err}</div>}
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
  const node = error ? <div role="alert" className="mb-4 flex items-center gap-2 rounded-tile bg-danger-100 px-4 py-3 text-[13.5px] text-danger-700"><AlertTriangle size={16} aria-hidden="true" /> {error}<button className="icon-btn ml-auto !h-7 !w-7 !text-danger-700" aria-label="Dismiss" onClick={() => setError(null)}><X size={14} /></button></div> : null;
  return { busy, error, run, node };
}

export function GateIcon({ state }: { state: "closed" | "open" | "passed" }) {
  if (state === "passed") return <CheckCircle2 size={16} className="text-success-600" aria-label="Passed" />;
  if (state === "open") return <LockOpen size={16} className="text-brand-600" aria-label="Open" />;
  return <Lock size={16} className="text-slate-400" aria-label="Closed" />;
}

export function Delta({ v, d = 3 }: { v?: number | null; d?: number }) {
  if (v === null || v === undefined) return <span className="text-slate-400">-</span>;
  const down = v < -1e-9, up = v > 1e-9;
  return (
    <span className={`inline-flex items-center gap-0.5 num ${down ? "text-danger-700" : up ? "text-success-700" : "text-slate-500"}`}>
      {down && <ArrowDownRight size={14} aria-hidden="true" />}{up && <ArrowUpRight size={14} aria-hidden="true" />}{fmt.delta(v, d)}
    </span>
  );
}

/** Text tabs (8.9): underline on an inset base line, no negative margins. */
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: ReactNode }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto" style={{ boxShadow: "inset 0 -1px 0 #E4E9EE" }}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={active === t.id} onClick={() => onChange(t.id)}
          className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors duration-150 ${active === t.id ? "border-brand-600 font-semibold text-ink-900" : "border-transparent font-medium text-slate-500 hover:text-ink-900"}`}>{t.label}</button>
      ))}
    </div>
  );
}

export const Field = ({ label, children, help }: { label: string; children: ReactNode; help?: ReactNode }) => (
  <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium text-slate-500">{label}</span>{children}{help && <span className="text-xs text-slate-500">{help}</span>}</label>
);

export default React;
