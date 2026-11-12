import { useState } from "react";
import { Download } from "lucide-react";
import { downloadFile, fmt, openFile, useApi } from "../api";
import { Chip, Empty, ErrorState, Loading, PageHeader } from "../components/ui";

export default function Inbox() {
  const { data, error, loading, reload } = useApi<any[]>("/inbox", []);
  const [sel, setSel] = useState<string | null>(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const m = data!.find((x) => x.id === sel) || data![0];
  return (
    <>
      <PageHeader title="External mail" subtitle="Email with parties outside AllianceBernstein: borrower packages, reminders to borrowers and send-backs to Lincoln. Internal communication is in Messages." />
      {!data!.length ? <Empty text="No mail" /> : (
        <div className="grid grid-cols-12 gap-6">
          <div className="card col-span-4 max-h-[75vh] overflow-y-auto p-2">{data!.map((x) => <button key={x.id} onClick={() => setSel(x.id)} className={`mb-1 w-full rounded-lg px-3 py-2 text-left ${m?.id === x.id ? "bg-brand-50" : "hover:bg-canvas-100"}`}><div className="truncate text-sm font-medium">{x.subject}</div><div className="flex justify-between text-[11px] text-slate-400"><span>{x.from}</span><span>{fmt.date(x.at)}</span></div></button>)}</div>
          {m && <div className="card col-span-8 p-6"><div className="text-lg font-semibold">{m.subject}</div><div className="mt-1 space-y-0.5 text-xs text-slate-500"><div><b>From</b> {m.from} <Chip tone={m.direction === "in" ? "green" : "violet"}>{m.direction === "in" ? "received" : "sent"}</Chip> {m.template && <Chip tone="blue">{m.template}</Chip>}</div><div><b>To</b> {m.to?.join(", ")}</div>{m.cc?.length > 0 && <div><b>Cc</b> {m.cc.join(", ")}</div>}</div><div className="mt-4 whitespace-pre-wrap text-sm">{m.body}</div>
            {(m.documents?.length > 0 || m.eml) && <div className="mt-5 border-t border-canvas-200 pt-4">
              <div className="label">Attachments</div>
              <div className="flex flex-wrap gap-2">{(m.documents || []).map((d: any) => (
                <span key={d.url} className="flex items-center gap-2 rounded-lg border border-canvas-200 bg-canvas-50 px-3 py-1.5 text-sm">
                  <button className="text-brand-700 hover:underline" onClick={() => openFile(d.url, d.name)}>{d.name}</button>
                  <Chip tone="blue">{(d.doc_type || "").replace(/_/g, " ")}</Chip>
                  <button title="Download" className="text-slate-400 hover:text-brand-600" onClick={() => downloadFile(d.url, d.name)}><Download size={13} /></button>
                </span>))}</div>
              {m.eml && <button className="mt-3 text-xs text-slate-500 underline" onClick={() => downloadFile(m.eml, `${m.subject}.eml`)}>Download the original email (.eml, opens in Outlook)</button>}
            </div>}</div>}
        </div>)}
    </>
  );
}
