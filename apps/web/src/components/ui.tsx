import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CalendarClock, CheckCircle2, Clock, Coins, Inbox, Layers,
  Lock, LockOpen, ShieldAlert, Sparkles, X,
} from "lucide-react";
import React, { ReactNode, useEffect, useState } from "react";
import { ApiError, fmt } from "../api";

/* Stone & Sage badges (guide 6, "Status badges"): a white chip on a hairline with a 6px status dot and the word.
   The word carries the meaning and the dot reinforces it. "blue", "violet" and "brand" are kept as names only and
   render as the neutral stone info badge: nothing in the interface turns blue or purple. */
type Tone = "green" | "amber" | "red" | "blue" | "neutral" | "violet" | "brand";
const BADGE: Record<Tone, string> = {
  green: "badge-green", amber: "badge-amber", red: "badge-red", blue: "badge-info", violet: "badge-info", brand: "badge-info",
  neutral: "badge-gray",
};

export function Chip({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string; dot?: boolean }) {
  return <span title={title} className={`badge ${BADGE[tone]}`}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  done: "green", approved: "green", passed: "green", clean: "green", final: "green", complete: "green", match: "green",
  agreed: "green", filed: "green", reconciled: "green", decided: "green", signed: "green", monthly_final: "green",
  resolved: "green", accepted: "green", closed: "green",
  sent: "blue", queued: "blue", new: "blue", on_agenda: "blue", deferred: "blue", ai_draft: "blue", edited: "blue",
  waiting_on_borrower: "amber", waiting_on_lincoln: "amber", in_review: "amber", in_progress: "amber", proposed: "amber",
  incomplete: "amber", draft: "amber", pending: "amber", requested: "amber",
  explained: "amber", open: "amber", needs_review: "amber", warn: "amber", warning: "amber",
  overdue: "red", sent_back: "red", mismatch: "red", failed: "red", fail: "red", late: "red", rejected: "red",
  pushed_back: "red", returned: "red", mismatches: "red",
  not_started: "neutral", not_received: "neutral", empty: "neutral",
};

export function StatusChip({ status }: { status?: string | null }) {
  if (!status) return <span className="text-faint">-</span>;
  const label = status === "ai_draft" ? "ABIQ draft" : fmt.label(status);
  return <Chip tone={STATUS_TONE[status] || "neutral"}>{label}</Chip>;
}

/** Rules still to be confirmed are tracked in docs/decisions.md, not labelled on screen. Renders nothing. */
/** Mark Move Monitor flag: how far a loan's latest mark moved against last quarter. Nothing below the warning level. */
export function MoveChip({ move, quiet = false }: { move?: { move: number; level: string | null; previous: number; mark: number } | null; quiet?: boolean }) {
  if (!move) return null;
  const pct = `${move.move >= 0 ? "+" : ""}${(move.move * 100).toFixed(1)}%`;
  if (!move.level) return quiet ? null : <span className="num text-xs text-muted">{pct}</span>;
  return <span title={`Mark ${move.previous.toFixed(2)} to ${move.mark.toFixed(2)} against last quarter`}
    className={`badge ${move.level === "alert" ? "badge-red" : "badge-amber"}`}>{move.level === "alert" ? "Big move" : "Moving"} {pct}</span>;
}

export function AssumedChip(_: { dq?: string | null; what?: string }) {
  return null;
}

export function ConfirmedChip() {
  return <span className="badge badge-green">Confirmed</span>;
}

export function LoopBadge({ code, n }: { code: string; n: number }) {
  if (!n) return null;
  return <span title={`Rework loop ${code}: ${n} time${n === 1 ? "" : "s"}`} className="badge badge-gray num">Loop {code} ×{n}</span>;
}

export function Loops({ loops }: { loops?: Record<string, number> }) {
  return <>{Object.entries(loops || {}).map(([k, v]) => <LoopBadge key={k} code={k} n={v} />)}</>;
}

/** Card: white surface on a hairline, 12px radius, no shadow. Header and body share the 20px inset. */
export function Card({ title, subtitle, children, actions, className = "", ai, flush }: {
  title?: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; ai?: boolean; flush?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold leading-6 text-ink">{title}{ai && <AiChip />}</h3>
            {subtitle && <div className="text-[12px] text-muted">{subtitle}</div>}
          </div>
          {actions && <div className="flex min-h-6 shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={`min-w-0 overflow-x-auto ${flush ? "mt-3" : `px-5 pb-5 ${title || actions ? "pt-3" : "pt-5"}`}`}>{children}</div>
    </section>
  );
}

const KPI_ICON: [RegExp, any][] = [
  [/value|portfolio|delta|story/i, Coins], [/loan|facilit/i, Layers], [/gate|pass|approv/i, CheckCircle2],
  [/overdue|late|risk|mismatch/i, Clock], [/day|cycle|date/i, CalendarClock], [/run|check|match/i, Activity],
];

/** KPI tile: 13px muted label, 24px figure in tabular numbers, 12px line under it coloured only when it has a direction. */
export function Kpi({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "red" | "green" | "amber" | "blue" | "neutral" | "brand"; accent?: number; icon?: any }) {
  const Icon = icon || KPI_ICON.find(([re]) => re.test(label))?.[1] || BarChart3;
  const subTone = tone === "red" ? "text-danger-600" : tone === "green" ? "text-success-600" : tone === "amber" ? "text-warn-600" : "text-muted";
  return (
    <div className="card anim-modal flex min-h-[112px] flex-col px-4 pb-3.5 pt-4">
      <div className="flex items-start justify-between gap-2">
        <div className="line-clamp-2 text-[13px] font-medium leading-snug text-muted">{label}</div>
        <Icon size={16} className="mt-0.5 shrink-0 text-faint" aria-hidden="true" />
      </div>
      <div className="mt-auto pt-2 text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink num">{value}</div>
      {sub && <div className={`mt-0.5 text-[12px] font-medium num ${subTone}`}>{sub}</div>}
    </div>
  );
}

/** Page header: 20px title, one muted line under it, actions on the right (the primary last). */
export function PageHeader({ title, subtitle, ai, actions, back }: { title: string; subtitle?: ReactNode; ai?: boolean; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && <div className="mb-2 text-[13px] text-muted">{back}</div>}
        <h1 className="flex flex-wrap items-center gap-2.5 text-[20px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {title}{ai && <AiChip title="AI assisted: agents prepare, people decide">AI assisted</AiChip>}
        </h1>
        {subtitle && <p className="mt-1 max-w-[760px] text-[13.5px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 text-[13px] text-muted" role="status">
      <span className="spinner" aria-hidden="true" />{label}
    </div>
  );
}

/** A failed request: say so and offer Retry. Never an empty state. */
export function ErrorState({ error, retry }: { error: ApiError | Error; retry?: () => void }) {
  const denied = (error as ApiError).status === 403;
  return (
    <div role="alert" className="flex items-center gap-3 rounded-control border border-danger-100 bg-danger-50 px-4 py-3 text-[13.5px] text-danger-700">
      {denied ? <ShieldAlert size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
      <div className="flex-1"><b>{denied ? "You don't have access to this." : "Something went wrong."}</b> {error.message}</div>
      {retry && !denied && <button className="btn-secondary btn-sm" onClick={retry}>Retry</button>}
    </div>
  );
}

/** Empty state: what will appear here, how, and one small button to start. */
export function Empty({ text, hint, action, icon: Icon = Inbox }: { text: string; hint?: ReactNode; action?: ReactNode; icon?: any }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sunken text-faint"><Icon size={18} aria-hidden="true" /></span>
      <div className="mt-1 text-[14px] font-semibold text-ink">{text}</div>
      {hint && <div className="max-w-[460px] text-[13px] text-muted">{hint}</div>}
      {action && <div className="mt-2 flex gap-2">{action}</div>}
    </div>
  );
}

const NOTE: Record<Tone, string> = {
  amber: "border-warn-100 bg-warn-50 text-warn-700",
  red: "border-danger-100 bg-danger-50 text-danger-700",
  green: "border-success-100 bg-success-50 text-success-700",
  blue: "border-line bg-raised text-ink",
  neutral: "border-line bg-raised text-muted",
  violet: "border-line bg-raised text-ink",
  brand: "border-line bg-raised text-ink",
};
export function Banner({ tone = "amber", children }: { tone?: Tone; children: ReactNode }) {
  return <div role={tone === "red" ? "alert" : undefined} className={`mb-4 rounded-control border px-4 py-3 text-[13.5px] ${NOTE[tone]}`}>{children}</div>;
}

export function Running({ text }: { text: string }) {
  return <div role="status" className="ai-note flex items-center gap-3"><span className="spinner !h-4 !w-4 !border-2" aria-hidden="true" /> {text}</div>;
}

/** Confidence meter: success from 70, warning 45 to 69, danger below 45. */
export function ConfidenceRing({ value }: { value?: number | null }) {
  if (value === null || value === undefined) return <span className="text-xs text-faint">no evidence</span>;
  const pct = Math.round(value * 100);
  const fill = pct >= 70 ? "bg-success-500" : pct >= 45 ? "bg-warn-500" : "bg-danger-500";
  return (
    <span title={`Confidence ${pct}%`} className="inline-flex items-center gap-1.5 align-middle">
      <span className="inline-block h-1.5 w-12 overflow-hidden rounded-full bg-sunken"><span className={`block h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} /></span>
      <span className="text-[11px] font-medium text-muted num">{pct}%</span>
    </span>
  );
}

/** AI note: sage rule and tint, the AI chip, its confidence and the human decision. Nothing is applied until a person acts. */
export function AiCard({ title = "ABIQ suggests", children, confidence, status, decidedBy, actions, evidence }: {
  title?: string; children: ReactNode; confidence?: number | null; status?: string; decidedBy?: string | null; actions?: ReactNode; evidence?: ReactNode;
}) {
  return (
    <div className="ai-note">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><AiChip /><span className="text-[13.5px] font-medium text-ink">{title}</span></div>
        <div className="flex items-center gap-2">
          {confidence !== undefined && <ConfidenceRing value={confidence} />}
          {status && status !== "proposed" && <Chip tone={status === "rejected" ? "red" : "green"}>{fmt.label(status)}{decidedBy ? ` by ${decidedBy.split("@")[0]}` : ""}</Chip>}
        </div>
      </div>
      <div className="text-[13.5px] leading-relaxed text-ink">{children}</div>
      {evidence && <div className="mt-2 text-xs text-muted">{evidence}</div>}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Modal: the scrim fades, the dialog rises 4px; Escape and a scrim click close it. */
export function Modal({ title, children, onClose, footer, wide }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="anim-scrim scrim fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`anim-modal flex max-h-[calc(100vh-48px)] w-full flex-col rounded-card border border-line bg-surface shadow-float ${wide ? "max-w-[860px]" : "max-w-[560px]"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4"><h3 className="text-[16px] font-semibold text-ink">{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="overflow-auto px-5 py-4 text-sm">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
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
      <button className="btn-ghost" onClick={() => setState(null)}>Cancel</button>
      <button className={state.danger ? "btn-danger" : "btn-primary"} disabled={busy} onClick={async () => {
        setBusy(true);
        try { await state.run(); setState(null); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
      }}>{busy ? "Working" : "Confirm"}</button></>}>
      <div className="text-[14px] leading-relaxed text-ink">{state.text}</div>
      {err && <div role="alert" className="mt-3 rounded-control border border-danger-100 bg-danger-50 px-3 py-2 text-[13.5px] text-danger-700">{err}</div>}
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
  const node = error ? <div role="alert" className="mb-4 flex items-center gap-2 rounded-control border border-danger-100 bg-danger-50 px-4 py-3 text-[13.5px] text-danger-700"><AlertTriangle size={16} aria-hidden="true" /> {error}<button className="icon-btn ml-auto !h-7 !w-7 !text-danger-700" aria-label="Dismiss" onClick={() => setError(null)}><X size={14} /></button></div> : null;
  return { busy, error, run, node };
}

export function GateIcon({ state }: { state: "closed" | "open" | "passed" }) {
  if (state === "passed") return <CheckCircle2 size={16} className="text-success-600" aria-label="Passed" />;
  if (state === "open") return <LockOpen size={16} className="text-accent-600" aria-label="Open" />;
  return <Lock size={16} className="text-faint" aria-label="Closed" />;
}

export function Delta({ v, d = 3 }: { v?: number | null; d?: number }) {
  if (v === null || v === undefined) return <span className="text-faint">-</span>;
  const down = v < -1e-9, up = v > 1e-9;
  return (
    <span className={`inline-flex items-center gap-0.5 num ${down ? "text-danger-600" : up ? "text-success-600" : "text-muted"}`}>
      {down && <ArrowDownRight size={14} aria-hidden="true" />}{up && <ArrowUpRight size={14} aria-hidden="true" />}{fmt.delta(v, d)}
    </span>
  );
}

/** Tabs switch views: muted text, the active one full strength with a 2px graphite underline. */
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: ReactNode }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="tabs mb-6">
      {tabs.map((t) => <button key={t.id} role="tab" aria-selected={active === t.id} onClick={() => onChange(t.id)} className="tab">{t.label}</button>)}
    </div>
  );
}

export const Field = ({ label, children, help }: { label: string; children: ReactNode; help?: ReactNode }) => (
  <label className="flex flex-col gap-1.5"><span className="text-[13px] font-medium text-ink">{label}</span>{children}{help && <span className="text-xs text-muted">{help}</span>}</label>
);

/** AI provenance chip: sage tint and a sparkle. Marks anything an agent produced. */
export function AiChip({ children = "AI", title }: { children?: ReactNode; title?: string }) {
  return <span className="ai-chip" title={title || "Prepared by ABIQ. Agents prepare, people decide."}><Sparkles size={12} aria-hidden="true" />{children}</span>;
}

/** Segmented control: filters or switches one view. */
export function Seg({ value, options, onChange, label }: { value: string; options: { id: string; label: ReactNode; count?: number }[]; onChange: (id: string) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}{o.count !== undefined && <span className="count">{o.count}</span>}</button>)}
    </div>
  );
}

export default React;
