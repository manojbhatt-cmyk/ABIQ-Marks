import { useState } from "react";
import { api, fmt, useApi } from "../api";
import { AiCard, AssumedChip, Card, Chip, Empty, ErrorState, Field, Kpi, Loading, PageHeader, StatusChip, Tabs, useAction, useConfirm } from "../components/ui";
import { useApp } from "../context";

export default function Monthly() {
  const { user } = useApp();
  const role = user!.role;
  const deal = role === "deal_analyst" || role === "deal_lead";
  const committee = role === "committee_member" || role === "committee_chair";
  const [tab, setTab] = useState(deal ? "proposals" : committee ? "approval" : "dashboard");
  const { data, error, loading, reload } = useApi<any>("/monthly", []);
  const act = useAction();
  const confirm = useConfirm();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  if (!data.cycle) return <><PageHeader title="Monthly marks" /><Empty text="No monthly cycle yet" action={role === "pm_team" && <button className="btn-primary" onClick={() => act.run(async () => { await api("/monthly", { body: {} }); reload(); })}>Start October 2026</button>} /></>;
  const id = data.cycle.id;
  const k = data.kpis;
  const go = (action: string, body: any = {}) => act.run(async () => { await api(`/monthly/${id}/${action}`, { body }); reload(); });
  return (
    <>
      <PageHeader title="Monthly marks" ai subtitle={`${data.cycle.period}: the update file, deal team proposals, DDTL rebalances, consolidation and the committee approval.`} />
      {act.node}{confirm.node}
      <Tabs active={tab} onChange={setTab} tabs={[{ id: "dashboard", label: "Dashboard" }, { id: "proposals", label: "Proposals and DDTL" }, { id: "approval", label: "Approval" }]} />
      {tab === "dashboard" && (
        <>
          <div className="mb-6 grid grid-cols-4 gap-4"><Kpi label="Loans" value={k.loans} /><Kpi label="Proposals received" value={k.proposals} /><Kpi label="Outstanding" value={k.outstanding} tone={k.outstanding ? "red" : "green"} /><Kpi label="DDTL rebalances pending" value={k.ddtl_pending} /></div>
          {role === "pm_team" && <div className="mb-4 flex gap-2"><button className="btn-secondary" onClick={() => go("build")}>Build update file</button><button className="btn-secondary" onClick={() => go("email")}>Email deal teams</button><button className="btn-secondary" onClick={() => go("consolidate")}>Consolidate</button><button className="btn-primary" onClick={() => confirm.ask("Send the consolidated monthly marks to the Valuation Committee?", async () => { await api(`/monthly/${id}/request`, { body: {} }); reload(); })}>Send to committee</button></div>}
          <div className="card overflow-x-auto"><table className="w-full"><thead><tr>{["Loan", "Team", "Current mark", "Pacing", "Sigma trend", "Watchlist notes", "Completeness", "Status", "Proposed"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>{data.rows.map((r: any) => <tr key={r.id}><td className="td font-medium">{r.borrower}<div className="text-[11px] text-slate-400">{r.facility_id}</div></td><td className="td text-xs">{r.team}</td><td className="tdn">{fmt.mark(r.current_mark)}</td>
              <td className="td"><StatusChip status={r.pacing?.PACING_STATUS === "behind" ? "late" : "done"} /> <span className="text-xs">{fmt.label(r.pacing?.PACING_STATUS)}</span></td><td className="td text-xs">{r.sigma?.LEVERAGE_TREND}</td><td className="tdn">{r.notes.length}</td>
              <td className="td text-xs">{r.completeness}{r.facility_type === "ddtl" && !data.ddtl.find((d: any) => d.facility_id === r.facility_id)?.confirmed_by && <div><Chip tone="amber">rebalance pending</Chip></div>}</td><td className="td"><StatusChip status={r.status} /></td><td className="tdn">{fmt.mark(r.proposal?.mark)}</td></tr>)}</tbody></table></div>
        </>)}
      {tab === "proposals" && <Proposals data={data} go={go} canPropose={deal} />}
      {tab === "approval" && (
        <Card title="Consolidated monthly marks" actions={committee && <button className="btn-primary" onClick={() => confirm.ask("Approve all remaining monthly marks?", async () => { await api(`/monthly/${id}/approve-all`, { body: {} }); reload(); })}>Approve all remaining</button>}>
          <table className="w-full"><thead><tr>{["Loan", "Current", "Proposed", "Rationale", "Decision", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>{data.rows.map((r: any) => <tr key={r.id}><td className="td">{r.borrower}</td><td className="tdn">{fmt.mark(r.current_mark)}</td><td className="tdn">{fmt.mark(r.proposal?.mark)}</td><td className="td max-w-md text-xs">{r.proposal?.rationale}</td>
              <td className="td">{r.decision ? <StatusChip status={r.decision.outcome} /> : ""}</td>
              <td className="td">{committee && r.status === "proposed" && <span className="flex gap-1"><button className="btn-primary" onClick={() => go("decide", { facility_id: r.facility_id, outcome: "approved" })}>Approve</button><button className="btn-secondary" onClick={() => { const rationale = prompt("Push-back rationale"); if (rationale) go("decide", { facility_id: r.facility_id, outcome: "pushed_back", rationale }); }}>Push back</button></span>}</td></tr>)}</tbody></table>
        </Card>)}
    </>
  );
}

function Proposals({ data, go, canPropose }: any) {
  const [sel, setSel] = useState<string | null>(null);
  const row = data.rows.find((r: any) => r.facility_id === sel) || data.rows[0];
  const [mark, setMark] = useState("");
  const [draft, setDraft] = useState<any>(null);
  const [text, setText] = useState("");
  if (!row) return <Empty text="No loans for your team" />;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <div className="card xl:col-span-3 p-2">{data.rows.map((r: any) => <button key={r.id} onClick={() => { setSel(r.facility_id); setMark(""); setDraft(null); setText(""); }} className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${row.id === r.id ? "bg-brand-50" : "hover:bg-canvas-100"}`}><div className="font-medium">{r.borrower}</div><StatusChip status={r.status} /></button>)}</div>
      <div className="xl:col-span-5 space-y-4">
        <Card title={`Signals: ${row.borrower}`}>
          <div className="space-y-1 text-sm">
            <div>Last quarter final mark <b className="num">{fmt.mark(row.quarter?.mark ?? row.current_mark)}</b>{row.quarter?.low ? `, Lincoln range ${fmt.mark(row.quarter.low)} to ${fmt.mark(row.quarter.high)}` : ""}</div>
            <div>Pacing {fmt.label(row.pacing?.PACING_STATUS)}: received {fmt.num(row.pacing?.INTEREST_RECEIVED, 3)} of {fmt.num(row.pacing?.EXPECTED_INTEREST, 3)}</div>
            <div>Sigma: LTM leverage {fmt.x(row.sigma?.LTM_LEVERAGE)}, trend {row.sigma?.LEVERAGE_TREND}</div>
            {row.notes.map((n: any, i: number) => <div key={i} className="rounded bg-canvas-100 p-2 text-xs">Watchlist call {n.CALL_DATE}: {n.NOTE_TEXT}</div>)}
          </div>
        </Card>
        {row.proposal && <Card title="Submitted"><div className="text-sm">{fmt.mark(row.proposal.mark)} v{row.proposal.version}: {row.proposal.rationale}</div>{row.decision?.outcome === "pushed_back" && <div className="mt-2 rounded bg-danger-100 p-2 text-sm text-danger-700">Pushed back: {row.decision.rationale}</div>}</Card>}
        {canPropose && (!row.proposal || row.status === "pushed_back" || row.status === "requested") && (
          <Card title="Proposal">
            <Field label="Proposed mark"><input className="input num" value={mark} onChange={(e) => setMark(e.target.value)} /></Field>
            <button className="btn-secondary mt-2" disabled={!mark} onClick={async () => { const d = await api(`/monthly/${data.cycle.id}/draft-rationale`, { body: { facility_id: row.facility_id, proposed_mark: Number(mark) } }); setDraft(d); }}>Draft rationale with TIQ (A10)</button>
            {!mark && <div className="mt-1 text-xs text-slate-400">TIQ drafts a rationale only after you enter a mark.</div>}
            {draft && <div className="mt-3"><AiCard confidence={0.8} actions={<button className="btn-secondary" onClick={() => setText(draft.rationale)}>Use draft</button>}>{draft.rationale}</AiCard></div>}
            <Field label="Commentary and rationale"><textarea className="input mt-2 h-24" value={text} onChange={(e) => setText(e.target.value)} /></Field>
            <button className="btn-primary mt-2" disabled={!mark || !text} onClick={() => go("propose", { facility_id: row.facility_id, proposed_mark: Number(mark), rationale: text, suggestion_id: draft?.suggestion_id })}>Submit</button>
          </Card>)}
      </div>
      <Card title="DDTL rebalance (M4)" className="xl:col-span-4" actions={<AssumedChip dq={data.ddtl_rule.discovery_question} what="mark applied to funded" />}>
        {data.ddtl.map((d: any) => (
          <div key={d.id} className="mb-3 rounded-lg border border-canvas-200 p-3 text-sm">
            <div className="font-semibold">{d.facility_id}</div>
            {[["Total commitment", d.total_commitment], ["Drawn before", d.drawn_before], ["Draws this month (Sentry)", d.draws_in_month], ["Funded after", d.funded_after], ["Unfunded after", d.unfunded_after]].map(([l, v]: any) => <div key={l} className="flex justify-between"><span>{l}</span><span className="num">{fmt.num(v)}</span></div>)}
            <div className="flex justify-between"><span>Mark applied to</span><span>{d.mark_applied_to}</span></div>
            {d.confirmed_by ? <Chip tone="green">confirmed by {d.confirmed_by.split("@")[0]}</Chip> : canPropose && <button className="btn-primary mt-2" onClick={() => api(`/ddtl/${d.id}/confirm`, { body: {} }).then(() => window.location.reload()).catch((e) => alert(e.message))}>Confirm</button>}
          </div>))}
      </Card>
    </div>
  );
}
