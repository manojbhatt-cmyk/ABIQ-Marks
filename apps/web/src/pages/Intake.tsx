import { Download, FileText, Upload } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, downloadFile, fmt, openFile, useApi } from "../api";
import { AiCard, AssumedChip, Card, Chip, ConfidenceRing, Empty, ErrorState, Loading, PageHeader, StatusChip, useAction } from "../components/ui";
import { useApp } from "../context";

const TYPES = ["financial_statements", "covenant_certificate", "supporting", "sponsor_letter", "waiver_request", "other"];

export default function Intake() {
  const { cycle, user } = useApp();
  const { data, error, loading, reload } = useApi<any>(cycle ? `/cycles/${cycle.id}/intake` : null, [cycle?.id]);
  const [sel, setSel] = useState<string | null>(null);
  const act = useAction();
  const nav = useNavigate();
  if (!cycle) return <Empty text="No cycle yet" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const loan = data.loans.find((l: any) => l.id === sel) || data.loans[0];
  const pm = user?.role === "pm_team";
  const chip = (l: any) => l.package_status === "complete" ? <Chip tone="green">complete</Chip> :
    l.package_status === "incomplete" ? <Chip tone="amber">incomplete, {l.package_missing.length} missing</Chip> :
      l.package_status === "late" ? <Chip tone="red">late, {l.days_late} days</Chip> : <Chip>not received</Chip>;
  return (
    <>
      <PageHeader title="Intake Inbox and Documents" ai subtitle={`Q2: borrower packages due day ${data.due_day}. Required: financial statements, covenant certificate; plus sponsor letter for watchlist CMRs.`}
        actions={<>
          <AssumedChip dq={data.required.standard.discovery_question} what="required documents" />
          <button className="btn-secondary" onClick={() => act.run(async () => { await api(`/cycles/${cycle.id}/intake/process`, { body: {} }); reload(); })}>Check inbox</button>
          {pm && <button className="btn-secondary" onClick={() => act.run(async () => { await api(`/cycles/${cycle.id}/chase`, { body: {} }); reload(); })}>Draft chases (A8)</button>}
        </>} />
      {act.node}
      <div className="grid grid-cols-12 gap-6">
        <div className="card col-span-3 max-h-[75vh] overflow-y-auto p-2">
          {data.loans.map((l: any) => (
            <button key={l.id} onClick={() => setSel(l.id)} className={`mb-1 w-full rounded-lg px-3 py-2 text-left ${loan?.id === l.id ? "bg-brand-50" : "hover:bg-canvas-100"}`}>
              <div className="flex justify-between text-sm font-medium"><span className="truncate">{l.borrower}</span></div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">{l.facility_id} {chip(l)}</div>
            </button>
          ))}
        </div>
        <div className="col-span-6 space-y-6">
          {loan && <Card title={`${loan.borrower}: documents`} actions={<>
            {pm && loan.package_status !== "complete" && <button className="btn-secondary" onClick={() => act.run(async () => { const note = prompt("Note for marking the package complete"); if (note) { await api(`/loans/${loan.id}/complete`, { body: { note } }); reload(); } })}>Mark complete</button>}
            {pm && <button className="btn-secondary" onClick={() => nav("/lincoln")}>Share with Lincoln</button>}
            <label className="btn-secondary cursor-pointer"><Upload size={14} /> Upload<input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && act.run(async () => { const f = new FormData(); f.append("file", e.target.files![0]); await api(`/loans/${loan.id}/upload`, { form: f }); reload(); })} /></label>
          </>}>
            {loan.package_missing.length > 0 && <div className="mb-3 rounded-lg bg-warn-100 px-3 py-2 text-sm text-warn-700">Missing: {loan.package_missing.map(fmt.label).join(", ")}</div>}
            {loan.documents.length ? (
              <table className="w-full"><thead><tr>{["File", "Type", "Conf.", "Period", "Pages", "Status"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                <tbody>{loan.documents.map((d: any) => (
                  <tr key={d.id}><td className="td"><div className="flex items-center gap-2"><button className="flex items-center gap-1 text-info-600 hover:underline" onClick={() => openFile(`/api/files/${d.store}/${d.path}`, d.file_name)}><FileText size={13} />{d.file_name}</button><button title="Download" className="text-slate-400 hover:text-brand-600" onClick={() => downloadFile(`/api/files/${d.store}/${d.path}`, d.file_name)}><Download size={13} /></button></div></td>
                    <td className="td"><select className="rounded border border-canvas-200 bg-white px-1 py-0.5 text-xs" value={d.doc_type || "other"} onChange={(e) => act.run(async () => { await api(`/documents/${d.id}/classify`, { body: { doc_type: e.target.value } }); reload(); })}>{TYPES.map((t) => <option key={t} value={t}>{fmt.label(t)}</option>)}</select>
                      {d.confirmed_by && <div className="text-[10px] text-slate-400">confirmed by {d.confirmed_by.split("@")[0]}</div>}</td>
                    <td className="td"><ConfidenceRing value={d.confidence} /></td><td className="td text-xs">{d.period}</td><td className="tdn">{d.pages}</td><td className="td"><StatusChip status={d.status === "indexed" ? "done" : d.status} /></td></tr>))}</tbody></table>
            ) : <Empty text="No documents received yet" />}
            <div className="mt-4"><div className="section-title">Tasks</div>{loan.tasks.map((t: any, i: number) => <div key={i} className="flex justify-between border-b border-canvas-100 py-1 text-sm"><span>{t.title}</span><span className="flex gap-2"><span className="text-xs text-slate-400">day {t.due_day}</span><StatusChip status={t.status} /></span></div>)}</div>
          </Card>}
          {loan && <Card title="Email thread">
            {loan.emails.length ? loan.emails.map((e: any) => (
              <div key={e.id} className="mb-3 rounded-lg border border-canvas-200 p-3">
                <div className="flex justify-between text-xs text-slate-500"><span>{e.from} {e.match && <Chip tone="blue">matched by {e.match}</Chip>}</span><span>day {e.day}</span></div>
                <div className="mt-1 text-sm font-medium">{e.subject}</div>
                <div className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{e.body}</div>
                {e.attachments?.length > 0 && <div className="mt-1 text-[11px] text-slate-400">Attachments: {e.attachments.join(", ")}</div>}
              </div>)) : <Empty text="No emails" />}
          </Card>}
        </div>
        <div className="col-span-3 space-y-4">
          {data.low_confidence.map((d: any) => (
            <AiCard key={d.id} title={`Classification: ${d.file_name}`} confidence={d.confidence} status={d.suggestion?.status}
              actions={<><button className="btn-primary" onClick={() => act.run(async () => { await api(`/documents/${d.id}/classify`, { body: { doc_type: d.doc_type } }); reload(); })}>Accept</button>
                <select className="rounded border border-canvas-200 bg-white text-xs" onChange={(e) => act.run(async () => { await api(`/documents/${d.id}/classify`, { body: { doc_type: e.target.value } }); reload(); })} defaultValue=""><option value="" disabled>Change type</option>{TYPES.map((t) => <option key={t} value={t}>{fmt.label(t)}</option>)}</select></>}>
              Looks like <b>{fmt.label(d.doc_type)}</b>, below the {data.rule.value} threshold, so a person confirms it.
            </AiCard>
          ))}
          {data.reminders.filter((r: any) => r.status === "draft").map((r: any) => (
            <AiCard key={r.id} title={`Chase draft: ${r.borrower}`} confidence={0.95}
              actions={pm ? <><button className="btn-primary" onClick={() => act.run(async () => { await api(`/reminders/${r.id}/send`, { body: {} }); reload(); })}>Send</button></> : undefined}>
              <div className="font-medium">{r.subject}</div><div className="mt-1 whitespace-pre-wrap text-xs">{r.body}</div>
            </AiCard>
          ))}
          <Card title="Unmatched emails">{data.unmatched.length ? data.unmatched.map((e: any) => <div key={e.id} className="text-sm">{e.subject}</div>) : <div className="text-sm text-slate-400">None</div>}</Card>
          <Card title="Sent">{data.sent.slice(0, 12).map((e: any) => <div key={e.id} className="mb-1 border-b border-canvas-100 pb-1 text-xs"><div className="font-medium">{e.subject}</div><div className="text-slate-400">to {e.to?.join(", ")}</div></div>)}</Card>
        </div>
      </div>
    </>
  );
}
