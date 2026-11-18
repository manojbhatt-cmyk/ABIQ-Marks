import { BellRing, CalendarClock } from "lucide-react";
import { useState } from "react";
import { api, useApi } from "../api";
import { useApp } from "../context";
import { Card, Chip, Empty, Field, Modal } from "./ui";

export type DeadlineRow = {
  step: string; step_name: string; cycle_loan_id: string | null; loan: string | null; loans: string[];
  owners: string[]; due_day: number; due_date: string; days_left: number;
};

const who = (e: string) => e.split("@")[0];

export function DueChip({ days }: { days: number }) {
  if (days < 0) return <Chip tone="red" dot>Overdue {-days}d</Chip>;
  if (days === 0) return <Chip tone="amber" dot>Due today</Chip>;
  if (days <= 2) return <Chip tone="amber" dot>{days} day{days === 1 ? "" : "s"} left</Chip>;
  return <Chip dot>{days} days left</Chip>;
}

/** PM Team only: remind the owners of a step (or one person) with an editable note. Sent inside ABIQ and audited. */
export function RemindButton({ row, onSent }: { row: DeadlineRow; onSent?: () => void }) {
  const { user, cycle } = useApp();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<string[]>(row.owners);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!cycle || !(user?.role === "pm_team" || user?.role === "admin")) return null;
  const what = `${row.step_name}${row.loan ? ` for ${row.loan}` : ""}`;
  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      await api(`/cycles/${cycle.id}/reminders`, { body: { step: row.step, cycle_loan_id: row.cycle_loan_id, to, note } });
      setOpen(false); setNote(""); onSent?.();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  return <>
    <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setTo(row.owners); setOpen(true); }} title={`Remind about ${what}`}>
      <BellRing size={14} aria-hidden="true" /> Remind
    </button>
    {open && <Modal title="Send a reminder" onClose={() => setOpen(false)} footer={<>
      <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      <button className="btn-primary" disabled={busy || !to.length} onClick={send}>{busy ? "Sending" : `Send to ${to.length}`}</button></>}>
      <div className="space-y-4">
        <div className="text-[13.5px] text-ink-700">{what}. Due Day {row.due_day} ({row.due_date}). <DueChip days={row.days_left} /></div>
        <Field label="To">
          <div className="flex flex-wrap gap-2">{row.owners.map((e) => (
            <label key={e} className="flex items-center gap-1.5 rounded-tile border border-line-200 px-2.5 py-1 text-[13px]">
              <input type="checkbox" checked={to.includes(e)} onChange={() => setTo(to.includes(e) ? to.filter((x) => x !== e) : [...to, e])} />{e}
            </label>))}</div>
        </Field>
        <Field label="Message" help="Optional. Sent inside ABIQ as a message with a notification. The deadline is added at the end.">
          <textarea className="input h-28" value={note} placeholder={`A reminder to complete ${what}.`} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {msg && <div role="alert" className="rounded-tile bg-danger-100 px-3 py-2 text-[13.5px] text-danger-700">{msg}</div>}
      </div>
    </Modal>}
  </>;
}

/** Open steps by deadline. The PM Team sees everyone's; others see only steps they own. */
export function DeadlinesCard({ loanId, limit = 8 }: { loanId?: string; limit?: number }) {
  const { user, cycle } = useApp();
  const { data, reload } = useApi<DeadlineRow[]>(cycle ? `/cycles/${cycle.id}/deadlines/status` : null, [cycle?.id, cycle?.day]);
  const [sent, setSent] = useState<string | null>(null);
  if (!cycle || !user) return null;
  const pm = user.role === "pm_team" || user.role === "admin";
  const rows = (data || []).filter((r) => (loanId ? r.cycle_loan_id === loanId : true) && (pm || r.owners.includes(user.email)));
  return (
    <Card title={<span className="flex items-center gap-2"><CalendarClock size={18} className="text-slate-500" aria-hidden="true" /> Deadlines</span>}
      subtitle={pm ? "Open steps across the cycle. ABIQ reminds owners 2 days before, on the day and when overdue." : "Your open steps. ABIQ reminds you 2 days before, on the day and when overdue."}>
      {sent && <div role="status" className="mb-3 rounded-tile border border-line-200 px-3 py-2 text-[13px] text-ink-700">{sent}</div>}
      {rows.length ? <ul className="divide-y divide-line-200">{rows.slice(0, limit).map((r) => (
        <li key={`${r.step}-${r.cycle_loan_id}`} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium text-ink-900" title={`Step ${String(r.step).replace("Q", "")} of 22: ${r.step_name}`}>{r.loan ? `${r.loan}: ` : ""}{r.step_name}</div>
            <div className="truncate text-xs text-slate-500">{r.owners.map(who).join(", ")} · Day {r.due_day}</div>
          </div>
          <DueChip days={r.days_left} />
          <RemindButton row={r} onSent={() => { setSent(`Reminder sent: ${r.step_name}${r.loan ? ` for ${r.loan}` : ""}.`); reload(); }} />
        </li>))}</ul>
        : <Empty text="No open deadlines" hint="Steps appear here once the cycle is running." />}
      {rows.length > limit && <div className="pt-2 text-xs text-slate-500">and {rows.length - limit} more</div>}
    </Card>
  );
}
