import { useState } from "react";
import { fmt, useApi } from "../api";
import { Chip, Empty, ErrorState, Loading, PageHeader } from "../components/ui";

export default function Inbox() {
  const { data, error, loading, reload } = useApi<any[]>("/inbox", []);
  const [sel, setSel] = useState<string | null>(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const m = data!.find((x) => x.id === sel) || data![0];
  return (
    <>
      <PageHeader title="External mail" subtitle="Email with parties outside AB: borrower packages (to the deal team, Cc PM Team), chases to borrowers, Lincoln send-backs. Internal communication is in Messages." />
      {!data!.length ? <Empty text="No mail" /> : (
        <div className="grid grid-cols-12 gap-6">
          <div className="card col-span-4 max-h-[75vh] overflow-y-auto p-2">{data!.map((x) => <button key={x.id} onClick={() => setSel(x.id)} className={`mb-1 w-full rounded-lg px-3 py-2 text-left ${m?.id === x.id ? "bg-brand-50" : "hover:bg-canvas-100"}`}><div className="truncate text-sm font-medium">{x.subject}</div><div className="flex justify-between text-[11px] text-slate-400"><span>{x.from}</span><span>{fmt.date(x.at)}</span></div></button>)}</div>
          {m && <div className="card col-span-8 p-6"><div className="text-lg font-semibold">{m.subject}</div><div className="mt-1 space-y-0.5 text-xs text-slate-500"><div><b>From</b> {m.from} <Chip tone={m.direction === "in" ? "green" : "violet"}>{m.direction === "in" ? "received" : "sent"}</Chip> {m.template && <Chip tone="blue">{m.template}</Chip>}</div><div><b>To</b> {m.to?.join(", ")}</div>{m.cc?.length > 0 && <div><b>Cc</b> {m.cc.join(", ")}</div>}{m.attachments?.length > 0 && <div><b>Attachments</b> {m.attachments.join(", ")}</div>}</div><div className="mt-4 whitespace-pre-wrap text-sm">{m.body}</div></div>}
        </div>)}
    </>
  );
}
