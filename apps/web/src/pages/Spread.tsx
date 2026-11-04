import { Pencil } from "lucide-react";
import { useState } from "react";
import { api, fmt, openFile, useApi } from "../api";
import { AiCard, AssumedChip, Card, Chip, ConfidenceRing, Empty, ErrorState, Loading, Modal, Running, useAction, useConfirm } from "../components/ui";

const COLS = [["quarter", "Q3 2026"], ["prior_quarter", "Q2 2026"], ["same_quarter_last_year", "Q3 2025"]] as const;

export default function Spread({ loanId, onChange }: { loanId: string; onChange: () => void }) {
  const { data, error, loading, reload } = useApi<any>(`/loans/${loanId}/spread`, [loanId]);
  const act = useAction();
  const confirm = useConfirm();
  const [evidence, setEvidence] = useState<any>(null);
  const [traj, setTraj] = useState<any>(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const refresh = () => { reload(); onChange(); };
  if (!data) return (
    <Card title="Spreading Review" ai>
      {act.busy ? <Running text="Spreading Agent reading the package tables..." /> : <Empty text="No spread yet. The Spreading Agent proposes every template line with evidence; you approve." action={<button className="btn-primary" onClick={() => act.run(async () => { await api(`/loans/${loanId}/spread/run`, { body: {} }); refresh(); })}>Run the Spreading Agent</button>} />}
      {act.node}
    </Card>
  );
  const sp = data.spread;
  const lines: any[] = data.lines;
  const cell = (code: string, period: string) => lines.find((l) => l.line_code === code && l.period_type === period);
  const approved = sp.status === "approved";
  const m = data.metrics;
  const editCell = (li: any) => act.run(async () => {
    const v = prompt(`New value for ${li.line_code} (${li.period_type})`, String(li.value)); if (v === null) return;
    const reason = prompt("Reason for the edit (required)"); if (!reason) return;
    await api(`/spread-lines/${li.id}`, { method: "PATCH", body: { value: Number(v), reason } }); refresh();
  });
  const addLine = (code: string, period: string) => act.run(async () => {
    const v = prompt(`Enter ${code} for ${period} (not found by the agent)`); if (v === null) return;
    const reason = prompt("Where did you read it? (required)"); if (!reason) return;
    await api(`/spreads/${sp.id}/lines`, { body: { line_code: code, period_type: period, value: Number(v), reason } }); refresh();
  });
  const accepted = data.adjustments.filter((a: any) => a.accepted !== false);
  return (
    <>
      {act.node}{confirm.node}
      {sp.not_found?.length > 0 && <div className="mb-4 rounded-lg bg-warn-100 px-4 py-2 text-sm text-warn-700">Partial: not found by the agent: {sp.not_found.join(", ")}. Scanned pages have no text layer; enter these lines from the page with a note.</div>}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm"><Chip tone={approved ? "green" : "amber"}>Spread v{sp.version} {sp.status}</Chip>{sp.approved_by && <span className="text-slate-500">approved by {sp.approved_by} {fmt.date(sp.approved_at)}; Everest {sp.written_back}</span>}</div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => api(`/agent-runs/${sp.agent_run_id}`).then(setTraj)}>View agent trajectory</button>
          {!approved && <button className="btn-secondary" onClick={() => act.run(async () => { const r = await api(`/spreads/${sp.id}/accept-above`, { body: { threshold: 0.9 } }); alert(`${r.lines} lines at or above 0.9 confidence accepted as proposed`); })}>Accept all above 0.9</button>}
          {!approved && <button className="btn-secondary" onClick={() => act.run(async () => { const ins = prompt("Instructions for the re-run"); if (ins === null) return; await api(`/loans/${loanId}/spread/run`, { body: { instructions: ins } }); refresh(); })}>Request a re-run</button>}
          {!approved && <button className="btn-primary" onClick={() => confirm.ask(<>Approve spread v{sp.version} for this loan, Q3 2026; {new Set(lines.map((l) => l.line_code)).size} lines, {accepted.length} add-back(s). This writes the model to Everest.</>, async () => { await api(`/spreads/${sp.id}/approve`, { body: {} }); refresh(); })}>Approve spread</button>}
        </div>
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="card col-span-8 overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">Template line</th>{COLS.map(([, l]) => <th key={l} className="th text-right">{l}</th>)}<th className="th text-right">LTM (computed)</th></tr></thead>
            <tbody>
              {data.template.map((t: any) => {
                const calc = t.IS_CALCULATED;
                return (
                  <tr key={t.LINE_CODE} className={calc ? "bg-canvas-50" : ""}>
                    <td className="td"><div className="font-medium">{t.LINE_LABEL}</div><div className="text-[10px] text-slate-400">{t.LINE_CODE}{calc ? `: ${t.FORMULA}` : ""}</div></td>
                    {COLS.map(([p]) => {
                      if (calc) return <td key={p} className="tdn" title={m[t.LINE_CODE]?.formula}>{p === "quarter" && m[t.LINE_CODE] ? (t.UNIT === "x" ? fmt.x(m[t.LINE_CODE].value) : t.LINE_CODE.includes("YOY") ? fmt.pct(m[t.LINE_CODE].value, 0) : fmt.num(m[t.LINE_CODE].value)) : ""}</td>;
                      const li = cell(t.LINE_CODE, p);
                      if (!li) return <td key={p} className="tdn">{p === "quarter" && !approved && sp.not_found?.includes(t.LINE_CODE) ? <button className="text-xs text-brand-700 underline" onClick={() => addLine(t.LINE_CODE, p)}>enter</button> : ""}</td>;
                      const low = li.confidence !== null && li.confidence < 0.7;
                      return (
                        <td key={p} className={`tdn ${low ? "bg-warn-100" : ""}`}>
                          <div className="flex items-center justify-end gap-1.5">
                            {li.edited && <Pencil size={10} className="text-brand-600" />}
                            <button className="hover:underline" title={li.edited ? `Edited: ${li.edit_reason}` : li.evidence ? `${li.evidence.file} p.${li.evidence.page}: "${li.source_label}"` : "no evidence"} onClick={() => li.evidence ? setEvidence(li) : null}>{fmt.num(li.value)}</button>
                            {!li.evidence ? <Chip>no evidence</Chip> : <ConfidenceRing value={li.confidence} />}
                            {!approved && <button className="text-slate-400 hover:text-brand-600" onClick={() => editCell(li)} title="Edit (reason required)"><Pencil size={11} /></button>}
                          </div>
                        </td>
                      );
                    })}
                    <td className="tdn">{t.LINE_CODE === "LTM_ADJ_EBITDA" ? fmt.num(m.LTM_ADJ_EBITDA?.value) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="col-span-4 space-y-4">
          <Card title="Add-backs" ai actions={<AssumedChip dq="DQ8" what="add-back allow-list" />}>
            {data.adjustments.length ? data.adjustments.map((a: any) => (
              <AiCard key={a.id} title={`${fmt.label(a.adj_type)} ${fmt.num(a.amount)}`} status={a.accepted === true ? "accepted" : a.accepted === false ? "rejected" : undefined}
                evidence={<button className="text-info-600 hover:underline" onClick={() => setEvidence({ evidence: a.evidence, source_label: a.description })}>{a.evidence.file} p.{a.evidence.page}</button>}
                actions={!approved && a.accepted === null ? <><button className="btn-primary" onClick={() => act.run(async () => { await api(`/adjustments/${a.id}`, { body: { accept: true } }); refresh(); })}>Accept</button><button className="btn-secondary" onClick={() => act.run(async () => { await api(`/adjustments/${a.id}`, { body: { accept: false } }); refresh(); })}>Reject</button></> : undefined}>
                <div className="italic">"{a.description}"</div>
                <div className="mt-1">{a.allowed ? <Chip tone="green">on the allow-list</Chip> : <Chip tone="red">not on the allow-list</Chip>}</div>
              </AiCard>)) : <div className="text-sm text-slate-400">No one-off items found in the notes.</div>}
          </Card>
          <Card title="Metrics">
            {["ADJ_EBITDA", "LTM_ADJ_EBITDA", "NET_DEBT", "LEVERAGE", "NET_LEVERAGE", "INTEREST_COVER"].map((k) => <div key={k} className="flex justify-between border-b border-canvas-100 py-1 text-sm" title={`${m[k]?.formula}: ${JSON.stringify(m[k]?.inputs)}`}><span>{fmt.label(k).toLowerCase()}</span><span className="num font-semibold">{["LEVERAGE", "NET_LEVERAGE", "INTEREST_COVER"].includes(k) ? fmt.x(m[k]?.value) : fmt.num(m[k]?.value)}</span></div>)}
          </Card>
          <Card title="Covenant tests">{data.covenants.map((c: any) => <div key={c.covenant_id} className="flex items-center justify-between text-sm"><span>{fmt.label(c.type)} {c.operator} {fmt.x(c.threshold)}</span><span className="flex items-center gap-2"><span className="num">{fmt.x(c.actual)}</span>{c.result === "fail" ? <Chip tone="red">fail</Chip> : <Chip tone="green">pass, {fmt.pct(c.headroom, 0)} headroom</Chip>}</span></div>)}</Card>
          <AiCard title="Covenant certificate check (A11)" status={undefined}>
            <Chip tone={data.certificate.status === "match" ? "green" : data.certificate.status === "mismatch" ? "red" : "amber"}>{fmt.label(data.certificate.status)}</Chip>
            <div className="mt-1">{data.certificate.finding}</div>
          </AiCard>
          <Card title="Diff vs last quarter">
            <div className="text-sm">Leverage {fmt.x(data.prior.LTM_LEVERAGE)} to {fmt.x(m.LEVERAGE?.value)}; interest cover {fmt.x(data.prior.LTM_INTEREST_COVER)} to {fmt.x(m.INTEREST_COVER?.value)}</div>
          </Card>
        </div>
      </div>
      {evidence && (
        <Modal title="Evidence" onClose={() => setEvidence(null)} wide>
          <div className="grid grid-cols-2 gap-4">
            <div><div className="label">Source</div><div className="text-sm">{evidence.evidence.file}, page {evidence.evidence.page}{evidence.evidence.row ? `, row "${evidence.evidence.row}"` : ""}</div>
              <div className="mt-2 rounded bg-warn-100 p-3 font-mono text-xs">{evidence.evidence.text}</div>
              <button className="btn-secondary mt-3" onClick={() => api(`/documents/${evidence.evidence.doc_id}`).then((d) => openFile(d.url))}>Open the document</button></div>
            <div><div className="label">TIQ field</div><div className="text-sm">{evidence.line_code || "add-back"} {evidence.period_type || ""}: <b className="num">{evidence.value ?? ""}</b></div><div className="mt-2 text-xs text-slate-500">{evidence.source_label}</div></div>
          </div>
        </Modal>
      )}
      {traj && (
        <Modal title={`Agent trajectory: ${traj.component} ${traj.graph}`} onClose={() => setTraj(null)} wide>
          <div className="mb-2 text-xs text-slate-500">Engine {traj.engine}; {traj.tokens} tokens; ${traj.cost?.toFixed(4)}</div>
          {traj.trajectory.map((t: any) => <div key={t.step} className="border-b border-canvas-100 py-1 font-mono text-xs"><b>{t.step}. {t.name}</b> {JSON.stringify(t.detail)}</div>)}
        </Modal>
      )}
    </>
  );
}
