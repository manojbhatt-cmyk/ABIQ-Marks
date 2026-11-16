import { CheckCircle2, FileText, Upload, X } from "lucide-react";
import { useState } from "react";
import { api, fmt, openFile, useApi } from "../api";
import { Card, Chip, Empty, ErrorState, Loading, PageHeader, StatusChip, useAction, useConfirm } from "../components/ui";
import { useApp } from "../context";
import { dayDate } from "../display";

export default function Lincoln() {
  const { cycle, user } = useApp();
  const { data, error, loading, reload } = useApi<any>(cycle ? `/cycles/${cycle.id}/lincoln` : null, [cycle?.id]);
  const act = useAction();
  const confirm = useConfirm();
  const [note, setNote] = useState<string | null>(null);
  if (!cycle) return <Empty text="No cycle yet" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const external = user?.role === "lincoln";
  /** "Copied 3 reports to SharePoint. 2 loans are still waiting for Lincoln's report." */
  const result = (verb: string, n: number, noun: string, where: string, flag: "sharepoint" | "loaded_to_everest") => {
    const latest = data.loans.filter((l: any) => l.valuation_method === "Lincoln").map((l: any) => l.valuations[l.valuations.length - 1]);
    const waiting = latest.filter((v: any) => !v).length;
    const done = latest.filter((v: any) => v && v[flag]).length + n;
    const head = n ? `${verb} ${n} ${noun}${n === 1 ? "" : "s"} ${where}.` : `Nothing new to send ${where}: ${done} already there.`;
    return waiting ? `${head} ${waiting} loan${waiting === 1 ? " is" : "s are"} still waiting for Lincoln's report.` : head;
  };
  if (external) {
    return (
      <>
        <PageHeader title="Lincoln exchange" subtitle="External mode: your Box folder only. Packages to value, upload reports and marks, read send-back notes." />
        {act.node}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card title="Packages to value" className="lg:col-span-2">
            <table className="w-full"><thead><tr>{["Facility", "Borrower", "Package", "Send-back notes"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>{data.loans.map((l: any) => <tr key={l.facility_id}><td className="td">{l.facility_id}</td><td className="td">{l.borrower}</td>
                <td className="td">{l.packages.map((p: any) => <button key={p.version} className="mr-2 font-medium text-ink underline-offset-2 hover:underline" onClick={() => openFile(`/api/files/box/${p.manifest}`)}>v{p.version} manifest</button>)}</td>
                <td className="td text-xs">{l.send_backs.map((n: any, i: number) => <div key={i}><button className="font-medium text-ink underline-offset-2 hover:underline" onClick={() => openFile(`/api/files/box/${n.path}`)}>{n.path.split("/").pop()}</button>: {n.note}</div>)}</td></tr>)}</tbody></table>
          </Card>
          <Card title="Upload report or marks file">
            <label className="btn-primary cursor-pointer"><Upload size={14} /> Choose file<input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && act.run(async () => { const f = new FormData(); f.append("file", e.target.files![0]); await api(`/lincoln/upload?valuation_date=${new Date().toISOString().slice(0, 10)}`, { form: f }); reload(); })} /></label>
            <div className="mt-3 text-xs text-slate-500">Files land in your lincoln-out folder; the PM Team's Box watcher picks them up.</div>
          </Card>
        </div>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Lincoln exchange" ai subtitle="Share packages with Lincoln, read its draft marks as they arrive, then load them to Everest and copy the reports to SharePoint."
        actions={<>
          {(() => { const n = data.loans.filter((l: any) => l.valuation_method === "Lincoln" && l.package_status === "complete" && !l.packages.length).length;
            return n > 0 && <button className="btn-primary" onClick={() => confirm.ask(`Share ${n} complete package${n === 1 ? "" : "s"} with Lincoln through Box? Each gets a manifest listing its classified documents.`, async () => { await api(`/cycles/${cycle.id}/lincoln/share-all`, { body: {} }); reload(); })}>Share all complete packages ({n})</button>; })()}
          <button className="btn-secondary" onClick={() => act.run(async () => { const r = await api(`/cycles/${cycle.id}/lincoln/ingest`, { body: {} }); setNote(r.received ? `Received ${r.received} valuation${r.received === 1 ? "" : "s"} from Lincoln.` : "Nothing new from Lincoln in Box."); reload(); })}>Check Box for Lincoln files</button>
          <button className="btn-secondary" onClick={() => confirm.ask("Load the latest Lincoln draft marks for every loan to the Everest pricing panel through the write-back adapter?", async () => { const r = await api(`/cycles/${cycle.id}/lincoln/load-everest`, { body: {} }); setNote(result("Loaded", r.loaded, "draft mark", "to Everest", "loaded_to_everest")); reload(); })}>Bulk load to Everest</button>
          <button className="btn-secondary" disabled={act.busy} onClick={() => act.run(async () => { const r = await api(`/cycles/${cycle.id}/lincoln/copy-sharepoint`, { body: {} }); setNote(result("Copied", r.copied, "report", "to SharePoint", "sharepoint")); reload(); })}>Bulk copy to SharePoint</button>
        </>} />
      {act.node}{confirm.node}
      {note && <div role="status" className="toast mb-4 !max-w-none"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success-600" aria-hidden="true" /><div className="flex-1"><strong>{note.split(". ")[0]}.</strong>{note.split(". ").slice(1).join(". ") && <span className="block text-muted">{note.split(". ").slice(1).join(". ")}</span>}</div><button className="icon-btn !h-7 !w-7" aria-label="Dismiss" onClick={() => setNote(null)}><X size={14} /></button></div>}
      <div className="space-y-4">
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr>{[["Loan", ""], ["Package", ""], ["Lincoln report", ""], ["Point and range", "r"], ["Yield", "r"], ["Report vs sheet", ""], ["Everest", ""], ["SharePoint", ""], ["Send-backs", "r"], ["", ""]].map(([h, r]) => <th key={h} className={`th ${r ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>{data.loans.map((l: any) => {
              const v = l.valuations[l.valuations.length - 1];
              const p = l.packages[l.packages.length - 1];
              return (
                <tr key={l.cycle_loan_id}>
                  <td className="td"><div className="font-medium">{l.borrower}</div><div className="mono text-xs text-muted">{l.facility_id}</div></td>
                  <td className="td">{l.valuation_method !== "Lincoln" ? <Chip tone="blue">{l.valuation_method}</Chip> : p ? <Chip tone="green" title={`Shared on ${dayDate(p.day)}`}>Shared v{p.version}</Chip> : <StatusChip status={l.package_status} />}</td>
                  <td className="td">{v ? <button className="inline-flex items-center gap-1.5 font-medium text-ink underline-offset-2 hover:underline" onClick={() => v.report_document_id && api(`/documents/${v.report_document_id}`).then((d) => openFile(d.url))}><FileText size={14} aria-hidden="true" />v{v.version} · {v.valuation_date}</button> : <span className="text-faint">Waiting</span>}
                    {l.valuations.length > 1 && <div className="text-xs text-muted">Revised after a send-back</div>}</td>
                  <td className="tdn"><div className="font-medium">{fmt.mark(v?.point)}</div>{v && <div className="text-xs text-muted">{fmt.mark(v.low)} to {fmt.mark(v.high)}</div>}</td><td className="tdn">{fmt.pct(v?.yield)}</td>
                  <td className="td">{v ? (v.discrepancy ? <Chip tone="red" title={v.discrepancy_note}>Differs</Chip> : <Chip tone="green">Matches</Chip>) : <span className="text-faint">-</span>}</td>
                  <td className="td">{v ? (v.loaded_to_everest ? <Chip tone="green">Loaded</Chip> : <Chip>Not yet</Chip>) : <span className="text-faint">-</span>}</td>
                  <td className="td">{v ? (v.sharepoint ? <Chip tone="green">Copied</Chip> : <Chip>Not yet</Chip>) : <span className="text-faint">-</span>}</td>
                  <td className="tdn">{l.send_backs.length || ""}</td>
                  <td className="td">{!p && l.valuation_method === "Lincoln" && l.package_status === "complete" && <button className="btn-primary" onClick={() => confirm.ask(`Share ${l.borrower}'s package with Lincoln through Box? The manifest lists every classified document.`, async () => { await api(`/loans/${l.cycle_loan_id}/share`, { body: {} }); reload(); })}>Share</button>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Box folder" subtitle="Files exchanged with Lincoln">
            <div className="max-h-72 space-y-0.5 overflow-y-auto font-mono text-[12px] text-muted">{data.box.map((k: string) => <div key={k} className="truncate"><button className="hover:underline" onClick={() => openFile(`/api/files/box/${k}`)}>{k}</button></div>)}</div>
          </Card>
          <Card title="Extraction exceptions (A4)" ai>{data.exceptions.length ? data.exceptions.map((x: any) => <div key={x.id} className="text-sm">{JSON.stringify(x.payload)}</div>) : <div className="text-[13px] text-muted">None: every report matches its spreadsheet row.</div>}</Card>
        </div>
      </div>
    </>
  );
}
