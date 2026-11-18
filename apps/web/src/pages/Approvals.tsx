import { useState } from "react";
import { api, fmt, openFile, useApi } from "../api";
import { Card, Chip, Empty, ErrorState, GateIcon, Loading, PageHeader, StatusChip, Tabs, useAction, useConfirm } from "../components/ui";
import { useApp } from "../context";

export default function Approvals() {
  const { cycle, user } = useApp();
  const [tab, setTab] = useState(user?.role === "governance" ? "governance" : "final");
  const { data, error, loading, reload } = useApi<any>(cycle ? `/cycles/${cycle.id}/approvals` : null, [cycle?.id]);
  const monthly = useApi<any>("/monthly", []);
  const act = useAction();
  const confirm = useConfirm();
  const [comments, setComments] = useState("");
  if (!cycle) return <Empty text="No cycle yet" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const req = data.requests.filter((r: any) => r.kind === "final_marks").pop();
  const ap = req?.approvals?.[0];
  const gov = data.governance[data.governance.length - 1];
  const sch = data.schedule;
  const Schedule = () => (
    <div className="max-h-80 overflow-y-auto"><table className="w-full"><thead><tr>{["Facility", "Borrower", "Funded", "Previous", "Mark", "Value"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
      <tbody>{sch.lines.map((l: any) => <tr key={l.facility_id}><td className="td">{l.facility_id}</td><td className="td">{l.borrower}</td><td className="tdn">{fmt.num(l.funded)}</td><td className="tdn">{fmt.mark(l.previous_mark)}</td><td className="tdn font-semibold">{fmt.mark(l.mark)}</td><td className="tdn">{fmt.num(l.value, 3)}</td></tr>)}</tbody></table>
      <div className="mt-2 flex justify-end gap-6 text-sm font-semibold"><span>Total {fmt.m(sch.total)}</span><span>Change {fmt.delta(sch.delta)}</span><span>{sch.lines.length} loans</span></div></div>
  );
  return (
    <>
      <PageHeader title="Approvals and Governance" subtitle="Written approval of the final marks by the committee chair, then the governance sign-off. Monthly approvals are here too." />
      {act.node}{confirm.node}
      <Tabs active={tab} onChange={setTab} tabs={[{ id: "final", label: "Final marks approval (G2)" }, { id: "governance", label: "Governance (G3)" }, { id: "monthly", label: "Monthly (M6)" }]} />
      {tab === "final" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card title="Schedule" className="xl:col-span-8"><Schedule /></Card>
          <div className="xl:col-span-4 space-y-4">
            <Card title="Changes since the committee">{data.changes.length ? data.changes.map((c: any) => <div key={c.facility_id} className="text-sm">{c.borrower}: {fmt.mark(c.from)} to {fmt.mark(c.to)}</div>) : <div className="text-sm text-slate-400">None</div>}</Card>
            <Card title={<span className="flex items-center gap-2"><GateIcon state={ap?.decision === "approved" ? "passed" : req ? "open" : "closed"} /> Written approval</span>}>
              {!req ? (user?.role === "pm_team" ? <button className="btn-primary" onClick={() => confirm.ask("Send the final marks approval request to the Committee Chair?", async () => { await api(`/cycles/${cycle.id}/approvals/request`, { body: {} }); reload(); })}>Send request</button> : <div className="text-sm text-slate-400">The PM Team sends the request after a clean reconciliation.</div>) :
                ap ? <div className="text-sm"><StatusChip status={ap.decision} /> by {ap.approver} on {fmt.date(ap.decided_at)}<div className="mt-1 text-xs text-slate-500">{ap.comments}</div>
                  {ap.evidence && <button className="mt-2 font-medium text-ink underline-offset-2 hover:underline" onClick={() => openFile(`/api/files/onedrive/${ap.evidence}`)}>onedrive/{ap.evidence}</button>}</div> :
                  user?.role === "committee_chair" ? <div className="space-y-2"><textarea className="input h-20" placeholder="Comments (required to reject)" value={comments} onChange={(e) => setComments(e.target.value)} />
                    <div className="flex gap-2"><button className="btn-primary" onClick={() => confirm.ask(`Approve the ${cycle.period} final marks schedule, total ${fmt.m(sch.total)}?`, async () => { await api(`/approval-requests/${req.id}/decide`, { body: { decision: "approved", comments } }); reload(); })}>Approve</button>
                      <button className="btn-danger" onClick={() => confirm.ask("Reject the schedule and send it back to reconciliation (loop QD)?", async () => { await api(`/approval-requests/${req.id}/decide`, { body: { decision: "rejected", comments } }); reload(); }, true)}>Reject</button></div></div> :
                    <div className="text-sm"><Chip tone="amber">pending</Chip> requested by {req.requested_by}</div>}
            </Card>
          </div>
        </div>)}
      {tab === "governance" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card title="Schedule" className="xl:col-span-8"><Schedule /></Card>
          <Card className="xl:col-span-4" title={<span className="flex items-center gap-2"><GateIcon state={gov?.status === "signed" ? "passed" : ap?.decision === "approved" ? "open" : "closed"} /> Governance sign-off</span>}>
            <div className="mb-3 text-sm">Approval evidence: {ap?.evidence ? <button className="font-medium text-ink underline-offset-2 hover:underline" onClick={() => openFile(`/api/files/onedrive/${ap.evidence}`)}>{ap.evidence}</button> : "not yet"}</div>
            {gov && <div className="mb-3 text-sm"><StatusChip status={gov.status} /> by {gov.signed_by} {fmt.date(gov.signed_at)}<div className="text-xs text-slate-500">Everest {gov.everest_id || "-"}; schedule hash {gov.hash.slice(0, 12)}{gov.reasons ? `; reasons: ${gov.reasons}` : ""}</div></div>}
            {user?.role === "governance" && ap?.decision === "approved" && gov?.status !== "signed" && <div className="space-y-2"><textarea className="input h-20" placeholder="Reasons (required to return)" value={comments} onChange={(e) => setComments(e.target.value)} />
              <div className="flex gap-2"><button className="btn-primary" onClick={() => confirm.ask(`Sign off the ${cycle.period} marks schedule in Everest?`, async () => { await api(`/cycles/${cycle.id}/governance`, { body: { decision: "signed" } }); reload(); })}>Sign off</button>
                <button className="btn-danger" onClick={() => confirm.ask("Return the schedule to reconciliation (loop QE)?", async () => { await api(`/cycles/${cycle.id}/governance`, { body: { decision: "returned", reasons: comments } }); reload(); }, true)}>Return</button></div></div>}
          </Card>
        </div>)}
      {tab === "monthly" && (
        <Card title="Monthly approval request">
          {!monthly.data?.cycle ? <div className="text-sm text-slate-400">No monthly cycle yet.</div> : <>
            <div className="mb-2 text-sm">{monthly.data.cycle.period}: {monthly.data.files.length ? `file v${monthly.data.files.length} consolidated` : "not consolidated"}; request {monthly.data.request ? <StatusChip status={monthly.data.request.status} /> : "not sent"}</div>
            {user?.role === "pm_team" && monthly.data.files.length > 0 && !monthly.data.request && <button className="btn-primary" onClick={() => act.run(async () => { await api(`/monthly/${monthly.data.cycle.id}/request`, { body: {} }); monthly.reload(); })}>Send request</button>}
            <div className="mt-3 text-sm">Decisions: {monthly.data.rows.filter((r: any) => r.decision).length} of {monthly.data.rows.length} recorded on S19.</div></>}
        </Card>)}
    </>
  );
}
