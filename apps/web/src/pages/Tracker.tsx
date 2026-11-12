import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmt, useApi } from "../api";
import { AiCard, Card, Chip, Delta, Empty, ErrorState, Kpi, Loading, PageHeader, StatusChip, useAction, useConfirm } from "../components/ui";
import { useApp } from "../context";

const ALL_COLS = ["borrower", "facility", "team", "funded", "previous", "lincoln", "range", "deal_team", "committee", "final", "prev_value", "cur_value", "delta", "prev_rating", "rating", "watchlist", "waiver", "status", "agenda"];

export default function Tracker() {
  const { cycle, user } = useApp();
  const { data, error, loading, reload } = useApi<any>(cycle ? `/cycles/${cycle.id}/tracker` : null, [cycle?.id]);
  const [cols, setCols] = useState<string[]>(ALL_COLS);
  const [filter, setFilter] = useState({ team: "", agenda: false, status: "" });
  const [body, setBody] = useState<string | null>(null);
  const act = useAction();
  const confirm = useConfirm();
  const nav = useNavigate();
  const funds = useApi<any[]>(cycle ? `/cycles/${cycle.id}/tracker/funds` : null, [cycle?.id, data?.kpis?.current]);
  if (!cycle) return <Empty text="No cycle yet" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const k = data.kpis;
  const pm = user?.role === "pm_team";
  const rows = data.rows.filter((r: any) => (!filter.team || r.deal_team === filter.team) && (!filter.agenda || r.agenda_flag) && (!filter.status || r.status === filter.status));
  const draft = data.impacts.find((i: any) => !i.sent_at);
  const download = async () => { const b = await api<Blob>(`/cycles/${cycle.id}/tracker.xlsx`); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `marks-tracker-${cycle.period}.xlsx`; a.click(); };
  const show = (c: string) => cols.includes(c);
  return (
    <>
      <PageHeader title="Marks tracker" ai subtitle="Every loan's previous, Lincoln, deal team, committee and final mark. Derived from its sources on every change, never edited by hand."
        actions={<><button className="btn-secondary" onClick={() => act.run(async () => { await api(`/cycles/${cycle.id}/tracker/recompute`, { body: {} }); reload(); })}>Recompute</button><button className="btn-secondary" onClick={download}>Export to Excel</button></>} />
      {act.node}{confirm.node}
      {user?.role === "finance_ir" && cycle.status !== "closed" && <div className="mb-4 rounded-lg bg-warn-100 px-4 py-2 text-sm text-warn-700">Draft marks: final only after governance sign-off.</div>}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Previous portfolio value" value={fmt.m(k.previous)} sub={`story loans ${fmt.m(k.story_previous)}`} />
        <Kpi label="Current value" value={fmt.m(k.current)} sub={`story loans ${fmt.m(k.story_current)}`} />
        <Kpi label="Delta" value={<Delta v={k.delta} />} tone={k.delta < 0 ? "red" : "green"} />
        <Kpi label="Loans with draft marks" value={k.draft_marks} />
        <Kpi label="Loans on agenda" value={k.on_agenda} />
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-9">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <select className="input w-40" value={filter.team} onChange={(e) => setFilter({ ...filter, team: e.target.value })}><option value="">All teams</option>{Array.from(new Set(data.rows.map((r: any) => r.deal_team))).map((t: any) => <option key={t}>{t}</option>)}</select>
            <select className="input w-40" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="">All statuses</option>{Array.from(new Set(data.rows.map((r: any) => r.status))).map((t: any) => <option key={t}>{t}</option>)}</select>
            <label className="flex items-center gap-1"><input type="checkbox" checked={filter.agenda} onChange={(e) => setFilter({ ...filter, agenda: e.target.checked })} /> on agenda</label>
            <details className="relative"><summary className="btn-secondary cursor-pointer list-none">Columns</summary>
              <div className="absolute z-10 mt-1 grid w-56 grid-cols-2 gap-1 rounded-lg border border-canvas-200 bg-white p-2 text-xs shadow">{ALL_COLS.map((c) => <label key={c} className="flex items-center gap-1"><input type="checkbox" checked={show(c)} onChange={() => setCols(show(c) ? cols.filter((x) => x !== c) : [...cols, c])} />{fmt.label(c)}</label>)}</div></details>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr>{ALL_COLS.filter(show).map((c) => <th key={c} className="th">{fmt.label(c)}</th>)}</tr></thead>
              <tbody>{rows.map((r: any) => (
                <tr key={r.id} className="cursor-pointer hover:bg-canvas-50" onClick={() => nav(`/loans/${r.cycle_loan_id}`)}>
                  {show("borrower") && <td className="td font-medium">{r.borrower}</td>}{show("facility") && <td className="td">{r.facility_id}</td>}{show("team") && <td className="td">{r.deal_team}</td>}
                  {show("funded") && <td className="tdn">{fmt.num(r.funded_amount)}</td>}{show("previous") && <td className="tdn">{fmt.mark(r.previous_mark)}</td>}
                  {show("lincoln") && <td className="tdn">{fmt.mark(r.lincoln_draft_mark)}{r.lincoln_version > 1 && <span className="ml-1 text-[11px] text-brand-700">v{r.lincoln_version}</span>}</td>}
                  {show("range") && <td className="tdn text-xs">{r.lincoln_range_low ? `${fmt.mark(r.lincoln_range_low)} to ${fmt.mark(r.lincoln_range_high)}` : "-"}</td>}
                  {show("deal_team") && <td className="tdn">{fmt.mark(r.deal_team_mark)}</td>}{show("committee") && <td className="tdn">{fmt.mark(r.committee_mark)}</td>}{show("final") && <td className="tdn font-semibold">{fmt.mark(r.final_mark)}</td>}
                  {show("prev_value") && <td className="tdn">{fmt.num(r.previous_value, 3)}</td>}{show("cur_value") && <td className="tdn">{fmt.num(r.current_value, 3)}</td>}
                  {show("delta") && <td className="tdn"><Delta v={r.delta_value} /></td>}{show("prev_rating") && <td className="tdn">{r.previous_rating}</td>}{show("rating") && <td className="tdn">{r.current_rating}</td>}
                  {show("watchlist") && <td className="td">{r.watchlist_flag ? <Chip tone="amber">yes</Chip> : "no"}</td>}{show("waiver") && <td className="td text-xs">{fmt.label(r.waiver_status)}</td>}
                  {show("status") && <td className="td"><StatusChip status={r.status} /></td>}{show("agenda") && <td className="td">{r.agenda_flag ? <Chip tone="blue">{(r.agenda_reasons_json || []).map(fmt.label).join(", ") || "on"}</Chip> : ""}</td>}
                </tr>))}</tbody>
            </table>
          </div>
        </div>
        <div className="col-span-3 space-y-4">
          {pm && (draft ? (
            <AiCard title={`Impact note v${draft.version} draft (A6)`} confidence={0.9}
              actions={<><button className="btn-primary" onClick={() => confirm.ask(`Send impact note v${draft.version} (delta ${fmt.delta(draft.delta)}) to ${data.recipients.join(", ")}?`, async () => { await api(`/impact/${draft.id}/send`, { body: body !== null ? { body } : {} }); setBody(null); reload(); })}>Send</button></>}>
              <textarea className="input h-64 font-mono text-[11px]" value={body ?? draft.body} onChange={(e) => setBody(e.target.value)} />
            </AiCard>) : <button className="btn-primary w-full justify-center" onClick={() => act.run(async () => { await api(`/cycles/${cycle.id}/impact`, { body: {} }); reload(); })}>Draft impact note (A6)</button>)}
          <Card title="By fund">{(funds.data || []).map((f: any) => <div key={f.fund} className="flex justify-between border-b border-canvas-100 py-1 text-xs"><span className="font-medium">{f.fund} <span className="text-slate-400">({f.loans})</span></span><span className="num">{fmt.num(f.current, 3)} <Delta v={f.delta} /></span></div>)}</Card>
          <Card title="Sent versions">{data.impacts.filter((i: any) => i.sent_at).map((i: any) => <div key={i.id} className="flex justify-between border-b border-canvas-100 py-1 text-sm"><span>v{i.version} to {i.sent_to?.map((x: string) => x.split(".")[0]).join(", ")}</span><Delta v={i.delta} /></div>)}
            {!data.impacts.some((i: any) => i.sent_at) && <div className="text-sm text-slate-400">None sent yet</div>}</Card>
        </div>
      </div>
    </>
  );
}
