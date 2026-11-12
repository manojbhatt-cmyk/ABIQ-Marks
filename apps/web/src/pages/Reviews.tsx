import { useEffect, useState } from "react";
import { api, fmt, openFile, useApi } from "../api";
import { AssumedChip, Card, Chip, Empty, ErrorState, Field, Loading, LoopBadge, PageHeader, StatusChip, useAction, useConfirm } from "../components/ui";
import SctSessions from "../components/SctSessions";
import { useApp } from "../context";
import { dayDate } from "../display";

export default function Reviews() {
  const { cycle, user } = useApp();
  const q = useApi<any[]>(cycle ? `/cycles/${cycle.id}/reviews` : null, [cycle?.id]);
  const [sel, setSel] = useState<any>(null);
  const item = (sel && q.data?.find((x) => x.cmr_id === sel)) || q.data?.find((x) => x.review_id || x.stage === "file" || x.stage === "refile");
  const cmr = useApi<any>(item ? `/loans/${item.cycle_loan_id}/cmr` : null, [item?.cmr_id]);
  const act = useAction();
  const confirm = useConfirm();
  const [section, setSection] = useState("summary");
  const [text, setText] = useState("");
  useEffect(() => setText(""), [item?.cmr_id]);
  if (!cycle) return <Empty text="No cycle yet" />;
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={q.reload} />;
  const refresh = () => { q.reload(); cmr.reload(); };
  const c = cmr.data;
  const review = c?.reviews?.find((r: any) => r.id === item?.review_id);
  const checklist = review?.checklist || [];
  const myStage = { ac_manager: "ac_manager", pm_team: "pm_team", sct: "sct" }[user!.role as string];
  const canAct = review && review.stage === myStage && !review.outcome;
  return (
    <>
      <PageHeader title="Review Queue" ai subtitle="Q6 A/C Manager, Q7 PM Team, Q8 file, Q9 SCT. Comments go straight to the analyst (loop QB)." actions={<AssumedChip dq="DQ10" what="reviewer order" />} />
      {act.node}{confirm.node}
      {["pm_team", "sct", "admin"].includes(user!.role) && <SctSessions cycleId={cycle.id} canBuild={user!.role === "pm_team"} />}
      <div className="grid grid-cols-12 gap-6">
        <div className="card col-span-3 p-2">
          {q.data!.length ? q.data!.map((x) => (
            <button key={x.cmr_id} onClick={() => setSel(x.cmr_id)} className={`mb-1 w-full rounded-lg px-3 py-2 text-left ${item?.cmr_id === x.cmr_id ? "bg-brand-50" : "hover:bg-canvas-100"}`}>
              <div className="flex justify-between text-sm font-medium"><span>{x.borrower}</span><LoopBadge code="QB" n={x.loops} /></div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">v{x.version} {x.stage ? <Chip tone="amber">{fmt.label(x.stage)}</Chip> : <StatusChip status={x.status} />}{x.due_day && <span>due {dayDate(x.due_day)}</span>}</div>
            </button>)) : <Empty text="Nothing awaiting your stage" />}
        </div>
        <div className="col-span-6">
          {c && item ? (
            <Card title={`${item.borrower} CMR v${c.cmr.version}`} actions={<button className="btn-ghost" onClick={() => openFile(`/api/cmr/${c.cmr.id}/pdf`)}>PDF</button>}>
              {c.sections.map((s: any) => (
                <div key={s.id} className="mb-4">
                  <div className="flex items-center justify-between"><div className="text-sm font-semibold">{s.title}</div><button className="text-xs text-brand-700" onClick={() => setSection(s.code)}>comment here</button></div>
                  <div className="whitespace-pre-wrap text-sm text-slate-700">{s.body || <span className="text-slate-400">empty</span>}</div>
                  {c.reviews.flatMap((r: any) => r.comments.filter((x: any) => x.section === s.code).map((x: any) => ({ ...x, stage: r.stage }))).map((x: any) => (
                    <div key={x.id} className={`mt-1 rounded px-2 py-1 text-xs ${x.resolved ? "bg-canvas-100 text-slate-500" : "bg-danger-100 text-danger-700"}`}>{fmt.label(x.stage)}: {x.text}{x.resolved ? ` (resolved: ${x.resolution_note})` : ""}</div>))}
                </div>))}
              <div className="mt-2 text-sm"><b>Evidence attached:</b> {c.evidence.map((e: any) => e.file_name).join(", ") || "none"}</div>
            </Card>) : <Empty text="Select a CMR" />}
        </div>
        <div className="col-span-3 space-y-4">
          {item?.stage === "file" && user?.role === "pm_team" && (
            <Card title="Q8 File the CMR"><div className="mb-2 text-sm">A/C Manager and PM Team passed. Filing renders the PDF to SharePoint and writes the CMR and rating to Everest.</div>
              <button className="btn-primary" onClick={() => confirm.ask(`File ${item.borrower} CMR v${item.version} to SharePoint and Everest?`, async () => { await api(`/cmr/${item.cmr_id}/file`, { body: {} }); refresh(); })}>File CMR</button></Card>)}
          {c && c.cmr.status === "filed" && !c.cmr.stage && user?.role === "pm_team" && (
            <Card title="Re-file after SCT"><button className="btn-primary" onClick={() => act.run(async () => { await api(`/cmr/${c.cmr.id}/file`, { body: {} }); refresh(); })}>Re-file as v{c.cmr.version + 1}</button></Card>)}
          {review && (
            <Card title={`Checklist: ${fmt.label(review.stage)}`} ai>
              {checklist.length ? checklist.map((f: any, i: number) => <div key={i} className="mb-1.5 text-sm"><StatusChip status={f.result === "pass" ? "passed" : f.result} /> <b>{fmt.label(f.item)}</b><div className="text-xs text-slate-500">{f.reason}</div></div>) : <div className="text-sm text-slate-400">No checklist at this stage.</div>}
              {review.stage === "pm_team" && <div className="mt-2"><AssumedChip dq="DQ11" what="PM Team checklist" /></div>}
            </Card>)}
          {canAct && (
            <Card title="Comment and decide">
              <Field label="Section"><select className="input" value={section} onChange={(e) => setSection(e.target.value)}>{c.sections.map((s: any) => <option key={s.code} value={s.code}>{s.title}</option>)}</select></Field>
              <textarea className="input mt-2 h-20" value={text} onChange={(e) => setText(e.target.value)} placeholder="Comment for the analyst" />
              <button className="btn-secondary mt-2" disabled={!text} onClick={() => act.run(async () => { await api(`/reviews/${review.id}/comments`, { body: { section, text } }); setText(""); refresh(); })}>Add comment</button>
              <div className="mt-4 flex gap-2">
                <button className="btn-primary" onClick={() => confirm.ask(`Pass ${item.borrower} at the ${fmt.label(review.stage)} stage?`, async () => { await api(`/reviews/${review.id}/decide`, { body: { outcome: "passed" } }); refresh(); })}>Pass</button>
                <button className="btn-danger" onClick={() => confirm.ask(`Send ${item.borrower} back to the analyst with your comments (loop QB)?`, async () => { await api(`/reviews/${review.id}/decide`, { body: { outcome: "sent_back" } }); refresh(); }, true)}>Send back</button>
                {review.stage === "sct" && <button className="btn-accent" onClick={() => confirm.ask(`Defer ${item.borrower} to the follow-up SCT session? Add a comment first saying why.`, async () => { await api(`/reviews/${review.id}/decide`, { body: { outcome: "deferred" } }); refresh(); })}>Defer to follow-up</button>}
              </div>
              <div className="mt-2 text-[11px] text-slate-400">A failed checklist item needs a comment before Pass. Send back requires at least one comment.</div>
            </Card>)}
        </div>
      </div>
    </>
  );
}
