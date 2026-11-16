import { useState } from "react";
import { Download, MailCheck } from "lucide-react";
import { api, downloadFile, fmt, openFile, useApi } from "../api";
import { Chip, Empty, ErrorState, Loading, PageHeader } from "../components/ui";
import { useApp } from "../context";

/** Mail that went through the real mailbox (live mail, decision D30) is stored under inbox/live/ or sent/live-. */
const isLive = (x: any) => /\/(inbox\/live\/|sent\/live-)/.test(x.eml || "");

export default function Inbox() {
  const { data, error, loading, reload } = useApi<any[]>("/inbox", []);
  const [sel, setSel] = useState<string | null>(null);
  const { cycle, user } = useApp();
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const canCheck = cycle && user && ["pm_team", "admin", "deal_analyst", "deal_lead"].includes(user.role);
  const check = async () => {
    setChecking(true); setNote(null);
    try {
      const r = await api(`/cycles/${cycle!.id}/mail/check`, { body: {} });
      if (r.live?.status === "off") setNote("Live mail is off: every loan uses the simulated mailbox.");
      else if (r.live?.status === "error") setNote(`Could not read the mailbox: ${r.live.error}`);
      else setNote(r.received ? `Received ${r.received} email${r.received === 1 ? "" : "s"}: ${r.subjects.join("; ")}` : `No new email in ${r.live?.mailbox}.`);
      reload();
    } catch (e: any) { setNote(e.message); } finally { setChecking(false); }
  };
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const m = data!.find((x) => x.id === sel) || data![0];
  return (
    <>
      <PageHeader title="External mail" subtitle="Email with parties outside AllianceBernstein: borrower packages, reminders to borrowers and send-backs to Lincoln. Internal communication is in Messages."
        actions={canCheck ? <button className="btn-secondary" disabled={checking} onClick={check}><MailCheck size={16} aria-hidden="true" /> {checking ? "Checking" : "Check mailbox"}</button> : undefined} />
      {note && <div role="status" className="mb-4 rounded-control border border-line bg-raised px-4 py-2.5 text-[13.5px]">{note}</div>}
      {!data!.length ? <Empty text="No mail" /> : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="card xl:col-span-4 max-h-[75vh] overflow-y-auto p-2">{data!.map((x) => <button key={x.id} onClick={() => setSel(x.id)} className={`mb-1 w-full rounded-lg px-3 py-2 text-left ${m?.id === x.id ? "bg-brand-50" : "hover:bg-canvas-100"}`}><div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{x.subject}</span>{isLive(x) && <Chip tone="green">Real email</Chip>}</div><div className="flex justify-between text-[11px] text-slate-400"><span>{x.from}</span><span>{fmt.date(x.at)}</span></div></button>)}</div>
          {m && <div className="card xl:col-span-8 p-6"><div className="text-lg font-semibold">{m.subject}</div><div className="mt-1 space-y-0.5 text-xs text-slate-500"><div><b>From</b> {m.from} <Chip tone={m.direction === "in" ? "green" : "violet"}>{m.direction === "in" ? "received" : "sent"}</Chip> {m.template && <Chip tone="blue">{m.template}</Chip>} {isLive(m) && <Chip tone="green" title="Sent or received through the real mailbox">Real email</Chip>}</div><div><b>To</b> {m.to?.join(", ")}</div>{m.cc?.length > 0 && <div><b>Cc</b> {m.cc.join(", ")}</div>}</div><div className="mt-4 whitespace-pre-wrap text-sm">{m.body}</div>
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
