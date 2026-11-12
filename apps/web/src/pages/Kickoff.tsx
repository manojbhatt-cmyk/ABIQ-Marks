import { Check } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, useApi } from "../api";
import { AssumedChip, Card, Chip, Field, PageHeader, useAction, useConfirm } from "../components/ui";
import { useApp } from "../context";

const STEPS = ["Period and quarter end", "Calendar", "Loan universe", "Ownership", "Message preview", "Send in TIQ"];

export default function Kickoff() {
  const { cycle, refreshCycles, setCycleId } = useApp();
  const [step, setStep] = useState(cycle ? 1 : 0);
  const [period, setPeriod] = useState("2026-Q3");
  const [day0, setDay0] = useState("2026-09-30");
  const dl = useApi<any[]>(cycle ? `/cycles/${cycle.id}/deadlines` : null, [cycle?.id]);
  const loans = useApi<any[]>(cycle ? `/cycles/${cycle.id}/loans` : null, [cycle?.id]);
  const preview = useApi<any[]>(cycle && step >= 4 ? `/cycles/${cycle.id}/kickoff` : null, [cycle?.id, step]);
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const act = useAction();
  const confirm = useConfirm();
  const nav = useNavigate();
  const sent = cycle && cycle.status !== "draft";
  const inScope = (loans.data || []).filter((l) => l.in_scope);
  return (
    <>
      <PageHeader title="Kickoff Wizard" subtitle="Create the cycle and send the kickoff (Q1). Every assumed date is marked." />
      {act.node}{confirm.node}
      <div className="mb-6 flex gap-2">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => (cycle || i === 0) && setStep(i)} className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${i === step ? "border-brand-600 bg-brand-50 text-brand-700" : "border-canvas-200 bg-white text-slate-500"}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${i < step || sent ? "bg-success-700 text-white" : "bg-canvas-200"}`}>{i < step || sent ? <Check size={12} /> : i + 1}</span>{s}
          </button>
        ))}
      </div>
      {sent && <div className="mb-4 rounded-lg bg-success-100 px-4 py-2 text-sm text-success-700">Kickoff sent for {cycle!.period}. The cycle is running.</div>}
      {step === 0 && (
        <Card title="1. Period and quarter end">
          {cycle ? <div className="text-sm">Cycle {cycle.period} exists. <button className="btn-secondary ml-2" onClick={() => setStep(1)}>Continue</button></div> : (
            <div className="grid max-w-lg grid-cols-2 gap-4">
              <Field label="Period"><input className="input" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
              <Field label="Quarter end"><input className="input" type="date" value={day0} onChange={(e) => setDay0(e.target.value)} /></Field>
              <button className="btn-primary col-span-2 w-fit" disabled={act.busy} onClick={() => act.run(async () => {
                const c = await api("/cycles", { body: { period, day0 } }); setCycleId(c.id); await refreshCycles(); setStep(1);
              })}>Create cycle from Snowflake</button>
            </div>)}
        </Card>
      )}
      {step === 1 && cycle && (
        <Card title="2. Calendar" actions={<button className="btn-primary" onClick={() => setStep(2)}>Next</button>}>
          <table className="w-full"><thead><tr>{["Step", "Deadline", "Date", "Source", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>{(dl.data || []).map((d) => (
              <tr key={d.step}><td className="td font-medium">{d.step}</td><td className="td">{d.label}</td>
                <td className="td w-44"><input className="input num" type="date" defaultValue={d.date} disabled={!!sent} onBlur={(e) => {
                  const day = cycle.day0 && e.target.value ? Math.round((Date.parse(e.target.value) - Date.parse(cycle.day0)) / 86400000) : d.day;
                  if (day !== d.day) act.run(async () => { await api(`/cycles/${cycle.id}/deadlines/${d.step}`, { method: "PUT", body: { day } }); dl.reload(); });
                }} /></td><td className="td text-xs text-slate-500">{d.source}</td><td className="td">{d.assumed ? <AssumedChip dq="DQ1" what="interpolated deadline" /> : <Chip tone="green">source note</Chip>}</td></tr>))}</tbody></table>
        </Card>
      )}
      {step === 2 && cycle && (
        <Card title={`3. Loan universe: ${inScope.length} in scope`} actions={<button className="btn-primary" onClick={() => setStep(3)}>Next</button>}>
          <div className="text-sm text-slate-600">{(loans.data || []).length} facilities read from DealCloud, Everest and Sentry via Snowflake. Unowned loans: <b>{inScope.filter((l) => !l.team).length}</b>. Manage scope on the Loan Universe screen.</div>
          <button className="btn-secondary mt-3" onClick={() => nav("/universe")}>Open Loan Universe</button>
        </Card>
      )}
      {step === 3 && cycle && (
        <Card title="4. Deal team ownership" actions={<button className="btn-primary" onClick={() => setStep(4)}>Confirm ownership</button>}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {Object.entries(inScope.reduce((acc: any, l: any) => { (acc[l.team] = acc[l.team] || []).push(l); return acc; }, {})).map(([team, ls]: any) => (
              <div key={team} className="rounded-lg border border-canvas-200 p-3"><div className="font-semibold">{team}</div>
                {ls.map((l: any) => <div key={l.id} className="text-sm text-slate-600">{l.borrower} <span className="text-xs text-slate-400">{l.facility_id} {l.cmr_type}</span></div>)}</div>))}
          </div>
        </Card>
      )}
      {step === 4 && cycle && (
        <Card title="5. Kickoff message per deal team (sent inside TIQ, no email)" actions={<button className="btn-primary" onClick={() => setStep(5)}>Next</button>}>
          <div className="space-y-4">{(preview.data || []).map((p) => (
            <div key={p.deal_team_id} className="rounded-lg border border-canvas-200 p-3">
              <div className="mb-1 text-xs text-slate-500">To {p.team_name} in TIQ: {p.to.join(", ")}. Each person also gets their loans and deadlines in My Work.</div>
              <input className="input mb-2 font-medium" defaultValue={p.subject} onChange={(e) => setEdits({ ...edits, [p.deal_team_id]: { subject: e.target.value, body: edits[p.deal_team_id]?.body ?? p.body } })} />
              <textarea className="input h-48 font-mono text-xs" defaultValue={p.body} onChange={(e) => setEdits({ ...edits, [p.deal_team_id]: { subject: edits[p.deal_team_id]?.subject ?? p.subject, body: e.target.value } })} />
            </div>))}</div>
        </Card>
      )}
      {step === 5 && cycle && (
        <Card title="6. Send in TIQ">
          <div className="text-sm">{(preview.data || []).length} in-platform messages, one per deal team. Sending starts the cycle, creates the per-loan tasks and deadlines, and puts the next actions in each team's My Work. Deal teams ask their borrowers for the package; borrowers reply by email (third party), which TIQ picks up.</div>
          <button className="btn-primary mt-4" disabled={!!sent} onClick={() => confirm.ask(<>You are sending the {cycle.period} kickoff inside TIQ to {(preview.data || []).length} deal teams: {(preview.data || []).map((p) => p.team_name).join(", ")}.</>,
            async () => { await api(`/cycles/${cycle.id}/kickoff`, { body: { edits } }); await refreshCycles(); nav("/work"); })}>{sent ? "Kickoff sent" : "Send kickoff in TIQ"}</button>
        </Card>
      )}
    </>
  );
}
