import { Pencil } from "lucide-react";
import { useState } from "react";
import { api, fmt, openFile, useApi } from "../api";
import { AiCard, AssumedChip, Card, Chip, ConfidenceRing, Empty, ErrorState, Loading, Modal, Running, useAction, useConfirm } from "../components/ui";

/** Agent confidence for one spread cell: a 6px dot, the % only when it needs a look. */
function Conf({ v }: { v: number | null }) {
  if (v === null || v === undefined) return <span className="h-1.5 w-1.5 rounded-full border border-strong" title="No evidence" />;
  const pct = Math.round(v * 100);
  const tone = pct >= 90 ? "bg-success-500" : pct >= 70 ? "bg-warn-500" : "bg-danger-500";
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} title={`Agent confidence ${pct}%`} aria-label={`Confidence ${pct}%`} />;
}

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
      {sp.not_found?.length > 0 && <div className="mb-4 rounded-control border border-warn-100 bg-warn-50 px-4 py-2.5 text-[13.5px] text-warn-700">Partial: not found by the agent: {sp.not_found.join(", ")}. Scanned pages have no text layer; enter these lines from the page with a note.</div>}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm"><Chip tone={approved ? "green" : "amber"}>Spread v{sp.version} {sp.status}</Chip>{sp.approved_by && <span className="text-slate-500">approved by {sp.approved_by} {fmt.date(sp.approved_at)}; Everest {sp.written_back}</span>}</div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => api(`/agent-runs/${sp.agent_run_id}`).then(setTraj)}>View agent trajectory</button>
          {!approved && <button className="btn-secondary" onClick={() => act.run(async () => { const r = await api(`/spreads/${sp.id}/accept-above`, { body: { threshold: 0.9 } }); alert(`${r.lines} lines at or above 0.9 confidence accepted as proposed`); })}>Accept all above 0.9</button>}
          {!approved && <button className="btn-secondary" onClick={() => act.run(async () => { const ins = prompt("Instructions for the re-run"); if (ins === null) return; await api(`/loans/${loanId}/spread/run`, { body: { instructions: ins } }); refresh(); })}>Request a re-run</button>}
          {!approved && <button className="btn-primary" onClick={() => confirm.ask(<>Approve spread v{sp.version} for this loan, Q3 2026; {new Set(lines.map((l) => l.line_code)).size} lines, {accepted.length} add-back(s). This writes the model to Everest.</>, async () => { await api(`/spreads/${sp.id}/approve`, { body: {} }); refresh(); })}>Approve spread</button>}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="card xl:col-span-8 overflow-x-auto">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 text-xs text-muted">
            <span className="font-medium text-ink">Agent confidence</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success-500" />90% or more</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-warn-500" />70 to 89%, check</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-danger-500" />below 70%, review</span>
            <span className="ml-auto">Click a value to see its source page{!approved ? "; hover to edit" : ""}</span>
          </div>
          <table className="w-full min-w-[720px] table-fixed">
            <colgroup><col className="w-[34%]" />{COLS.map(([p]) => <col key={p} />)}<col className="w-[13%]" /></colgroup>
            <thead><tr><th className="th">Template line</th>{COLS.map(([, l]) => <th key={l} className="th text-right">{l}</th>)}<th className="th text-right">LTM</th></tr></thead>
            <tbody>
              {data.template.map((t: any) => {
                const calc = t.IS_CALCULATED;
                return (
                  <tr key={t.LINE_CODE} className={calc ? "bg-raised" : ""}>
                    <td className="td td-wrap"><div className={calc ? "text-muted" : "font-medium"}>{t.LINE_LABEL}</div><div className="mono truncate text-[11px] text-faint" title={calc ? t.FORMULA : t.LINE_CODE}>{t.LINE_CODE}{calc ? ` = ${t.FORMULA}` : ""}</div></td>
                    {COLS.map(([p]) => {
                      if (calc) return <td key={p} className="tdn !pr-[54px] text-muted" title={m[t.LINE_CODE]?.formula}>{p === "quarter" && m[t.LINE_CODE] ? (t.UNIT === "x" ? fmt.x(m[t.LINE_CODE].value) : t.LINE_CODE.includes("YOY") ? fmt.pct(m[t.LINE_CODE].value, 0) : fmt.num(m[t.LINE_CODE].value)) : ""}</td>;
                      const li = cell(t.LINE_CODE, p);
                      if (!li) return <td key={p} className="tdn">{p === "quarter" && !approved && sp.not_found?.includes(t.LINE_CODE) ? <button className="text-xs text-brand-700 underline" onClick={() => addLine(t.LINE_CODE, p)}>enter</button> : ""}</td>;
                      const conf = li.evidence ? li.confidence : null;
                      const check = conf !== null && conf < 0.9;
                      const low = conf !== null && conf < 0.7;
                      return (
                        <td key={p} className={`tdn group ${low ? "bg-danger-50" : check ? "bg-warn-50" : ""}`}>
                          <div className="flex items-center justify-end gap-2">
                            {check && <span className={`text-[11px] font-medium num ${low ? "text-danger-600" : "text-warn-700"}`}>{Math.round(conf! * 100)}%</span>}
                            {li.edited && <span className="badge badge-gray !h-[18px] !px-1.5" title={`Edited: ${li.edit_reason}`}>edited</span>}
                            <button className="font-medium text-ink underline-offset-2 hover:underline" title={li.edited ? `Edited: ${li.edit_reason}` : li.evidence ? `${li.evidence.file} p.${li.evidence.page}: "${li.source_label}"` : "No evidence"} onClick={() => li.evidence ? setEvidence(li) : null}>{fmt.num(li.value)}</button>
                            <Conf v={conf} />
                            <span className="flex w-4 justify-center">{!approved && <button className="text-faint opacity-0 transition-opacity duration-150 hover:text-ink focus:opacity-100 group-hover:opacity-100" onClick={() => editCell(li)} title="Edit (reason required)" aria-label="Edit value"><Pencil size={13} /></button>}</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="tdn font-medium">{t.LINE_CODE === "LTM_ADJ_EBITDA" ? fmt.num(m.LTM_ADJ_EBITDA?.value) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="xl:col-span-4 space-y-4">
          <Card title="Add-backs" ai actions={<AssumedChip dq="DQ8" what="add-back allow-list" />}>
            {data.adjustments.length ? data.adjustments.map((a: any) => (
              <AiCard key={a.id} title={`${fmt.label(a.adj_type)} ${fmt.num(a.amount)}`} status={a.accepted === true ? "accepted" : a.accepted === false ? "rejected" : undefined}
                evidence={<button className="font-medium text-ink underline-offset-2 hover:underline" onClick={() => setEvidence({ evidence: a.evidence, source_label: a.description })}>{a.evidence.file} p.{a.evidence.page}</button>}
                actions={!approved && a.accepted === null ? <><button className="btn-primary" onClick={() => act.run(async () => { await api(`/adjustments/${a.id}`, { body: { accept: true } }); refresh(); })}>Accept</button><button className="btn-secondary" onClick={() => act.run(async () => { await api(`/adjustments/${a.id}`, { body: { accept: false } }); refresh(); })}>Reject</button></> : undefined}>
                <div className="italic">"{a.description}"</div>
                <div className="mt-1">{a.allowed ? <Chip tone="green">on the allow-list</Chip> : <Chip tone="red">not on the allow-list</Chip>}</div>
              </AiCard>)) : <div className="text-sm text-slate-400">No one-off items found in the notes.</div>}
          </Card>
          <Card title="Metrics">
            {["ADJ_EBITDA", "LTM_ADJ_EBITDA", "NET_DEBT", "LEVERAGE", "NET_LEVERAGE", "INTEREST_COVER", "FCCR", "LIQUIDITY", "LIQUIDITY_MONTHS", "COVENANT_CUSHION"].map((k) => <div key={k} className="flex justify-between border-b border-canvas-100 py-1 text-sm" title={`${m[k]?.formula}: ${JSON.stringify(m[k]?.inputs)}`}><span>{fmt.label(k).toLowerCase()}</span><span className="num font-semibold">{["LEVERAGE", "NET_LEVERAGE", "INTEREST_COVER", "FCCR"].includes(k) ? fmt.x(m[k]?.value) : k === "COVENANT_CUSHION" ? fmt.pct(m[k]?.value) : k === "LIQUIDITY_MONTHS" ? `${fmt.num(m[k]?.value)} mo` : fmt.num(m[k]?.value)}</span></div>)}
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
