import { FileText, Upload } from "lucide-react";
import { api, fmt, openFile, useApi } from "../api";
import { Card, Chip, Empty, ErrorState, Loading, PageHeader, StatusChip, useAction, useConfirm } from "../components/ui";
import { useApp } from "../context";

export default function Lincoln() {
  const { cycle, user } = useApp();
  const { data, error, loading, reload } = useApi<any>(cycle ? `/cycles/${cycle.id}/lincoln` : null, [cycle?.id]);
  const act = useAction();
  const confirm = useConfirm();
  if (!cycle) return <Empty text="No cycle yet" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const external = user?.role === "lincoln";
  if (external) {
    return (
      <>
        <PageHeader title="Lincoln Exchange" subtitle="External mode: your Box folder only. Packages to value, upload reports and marks, read send-back notes." />
        {act.node}
        <div className="grid grid-cols-3 gap-6">
          <Card title="Packages to value" className="col-span-2">
            <table className="w-full"><thead><tr>{["Facility", "Borrower", "Package", "Send-back notes"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>{data.loans.map((l: any) => <tr key={l.facility_id}><td className="td">{l.facility_id}</td><td className="td">{l.borrower}</td>
                <td className="td">{l.packages.map((p: any) => <button key={p.version} className="mr-2 text-info-600 hover:underline" onClick={() => openFile(`/api/files/box/${p.manifest}`)}>v{p.version} manifest</button>)}</td>
                <td className="td text-xs">{l.send_backs.map((n: any, i: number) => <div key={i}><button className="text-info-600 hover:underline" onClick={() => openFile(`/api/files/box/${n.path}`)}>{n.path.split("/").pop()}</button>: {n.note}</div>)}</td></tr>)}</tbody></table>
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
      <PageHeader title="Lincoln Exchange" ai subtitle="Q3 share packages, Q10 drafts in, Q12 load to Everest, Q13 copy to SharePoint"
        actions={<>
          <button className="btn-secondary" onClick={() => act.run(async () => { const r = await api(`/cycles/${cycle.id}/lincoln/ingest`, { body: {} }); alert(`${r.received} valuations received`); reload(); })}>Check Box for Lincoln files</button>
          <button className="btn-secondary" onClick={() => confirm.ask("Load the latest Lincoln draft marks for every loan to the Everest pricing panel through the write-back adapter?", async () => { await api(`/cycles/${cycle.id}/lincoln/load-everest`, { body: {} }); reload(); })}>Bulk load to Everest</button>
          <button className="btn-secondary" onClick={() => act.run(async () => { await api(`/cycles/${cycle.id}/lincoln/copy-sharepoint`, { body: {} }); reload(); })}>Bulk copy to SharePoint</button>
        </>} />
      {act.node}{confirm.node}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <div className="card overflow-x-auto xl:col-span-3">
          <table className="w-full">
            <thead><tr>{["Loan", "Package", "Lincoln report", "Point", "Range", "Yield", "Disc.", "Everest", "SharePoint", "Send-backs", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>{data.loans.map((l: any) => {
              const v = l.valuations[l.valuations.length - 1];
              const p = l.packages[l.packages.length - 1];
              return (
                <tr key={l.cycle_loan_id}>
                  <td className="td"><div className="font-medium">{l.borrower}</div><div className="text-[11px] text-slate-400">{l.facility_id}</div></td>
                  <td className="td">{l.valuation_method !== "Lincoln" ? <Chip tone="violet">{l.valuation_method}</Chip> : p ? <Chip tone="green">shared v{p.version} day {p.day}</Chip> : <StatusChip status={l.package_status} />}</td>
                  <td className="td">{v ? <button className="flex items-center gap-1 text-info-600 hover:underline" onClick={() => v.report_document_id && api(`/documents/${v.report_document_id}`).then((d) => openFile(d.url))}><FileText size={12} />v{v.version} {v.valuation_date}</button> : <span className="text-slate-400">waiting</span>}
                    {l.valuations.length > 1 && <div className="text-[10px] text-brand-700">revised after send-back</div>}</td>
                  <td className="tdn">{fmt.mark(v?.point)}</td><td className="tdn">{v ? `${fmt.mark(v.low)} to ${fmt.mark(v.high)}` : "-"}</td><td className="tdn">{fmt.pct(v?.yield)}</td>
                  <td className="td">{v ? (v.discrepancy ? <Chip tone="red" >{v.discrepancy_note}</Chip> : <Chip tone="green">none</Chip>) : "-"}</td>
                  <td className="td">{v ? (v.loaded_to_everest ? <Chip tone="green">yes</Chip> : <Chip>no</Chip>) : "-"}</td>
                  <td className="td">{v ? (v.sharepoint ? <Chip tone="green">yes</Chip> : <Chip>no</Chip>) : "-"}</td>
                  <td className="tdn">{l.send_backs.length || ""}</td>
                  <td className="td">{!p && l.valuation_method === "Lincoln" && l.package_status === "complete" && <button className="btn-primary" onClick={() => confirm.ask(`Share ${l.borrower}'s package with Lincoln through Box? The manifest lists every classified document.`, async () => { await api(`/loans/${l.cycle_loan_id}/share`, { body: {} }); reload(); })}>Share</button>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <div className="space-y-6">
          <Card title="Box folder">
            <div className="max-h-96 overflow-y-auto font-mono text-[11px] text-slate-600">{data.box.map((k: string) => <div key={k} className="truncate"><button className="hover:underline" onClick={() => openFile(`/api/files/box/${k}`)}>{k}</button></div>)}</div>
          </Card>
          <Card title="Extraction exceptions (A4)" ai>{data.exceptions.length ? data.exceptions.map((x: any) => <div key={x.id} className="text-sm">{JSON.stringify(x.payload)}</div>) : <div className="text-sm text-slate-400">None: every report matches its spreadsheet row.</div>}</Card>
        </div>
      </div>
    </>
  );
}
