import { Download, FileText } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { downloadFile, fmt, openFile, useApi } from "../api";
import { Card, Chip, ErrorState, Loading, Loops, PageHeader, StatusChip, Tabs } from "../components/ui";
import CmrEditor from "./CmrEditor";
import LineageView from "./LineageView";
import Pricing from "./Pricing";
import Spread from "./Spread";

export default function LoanWorkspace() {
  const { id, tab = "overview" } = useParams();
  const nav = useNavigate();
  const { data, error, loading, reload } = useApi<any>(`/loans/${id}`, [id, tab]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const l = data.loan;
  const t = data.tracker || {};
  const cov = data.covenant;
  return (
    <>
      <PageHeader title={l.borrower} subtitle={`${l.facility_id}, ${l.team}, ${fmt.label(l.facility_type)}, sponsor ${l.sponsor}, matures ${l.maturity}`} />
      <div className="card mb-6 flex flex-wrap items-center gap-6 px-5 py-4 text-sm">
        <div><div className="label">Commitment / funded</div><div className="num font-semibold">{fmt.num(l.commitment)} / {fmt.num(l.funded)}</div></div>
        <div><div className="label">Previous mark</div><div className="num font-semibold">{fmt.mark(l.previous_mark)}</div></div>
        <div><div className="label">Marks</div><div className="flex gap-1">
          <Chip tone="blue" title="Lincoln draft">L {fmt.mark(t.lincoln_draft_mark)}</Chip><Chip tone="violet" title="Deal Team">DT {fmt.mark(t.deal_team_mark)}</Chip>
          <Chip tone="amber" title="Committee">C {fmt.mark(t.committee_mark)}</Chip><Chip tone="green" title="Final">F {fmt.mark(t.final_mark)}</Chip></div></div>
        <div><div className="label">Rating</div><div className="num font-semibold">{l.previous_rating} to {t.current_rating ?? l.previous_rating}</div></div>
        <div><div className="label">Watchlist</div>{(t.watchlist_flag ?? l.previous_watchlist) ? <Chip tone="amber">yes</Chip> : <Chip>no</Chip>}</div>
        <div><div className="label">Covenant</div>{cov?.result === "fail" ? <Chip tone="red">Covenant breached {fmt.x(cov.actual)} vs {fmt.x(cov.threshold)}</Chip> : cov?.result ? <Chip tone="green">pass {fmt.x(cov.actual)} vs {fmt.x(cov.threshold)}</Chip> : <Chip>not spread</Chip>}
          {data.net_leverage_after_equity && <div className="mt-1 text-[11px] text-slate-500">net of sponsor equity {fmt.x(data.net_leverage_after_equity)}</div>}</div>
        <div><div className="label">Step</div><Chip tone="blue">{l.current_step}</Chip> <StatusChip status={l.status} /></div>
        <div><Loops loops={l.loops} /></div>
      </div>
      <Tabs active={tab} onChange={(x) => nav(`/loans/${id}/${x}`)} tabs={[{ id: "overview", label: "Overview" }, { id: "documents", label: "Documents" }, { id: "spread", label: "Spread" }, { id: "cmr", label: "CMR" }, { id: "pricing", label: "Pricing (G1)" }, { id: "lineage", label: "Lineage" }]} />
      {tab === "overview" && (
        <Card title="Timeline of this loan">
          <table className="w-full"><thead><tr>{["Day", "When", "Who", "Role", "Action", "Detail"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>{data.timeline.map((e: any) => <tr key={e.id}><td className="tdn">{e.day}</td><td className="td text-xs">{fmt.date(e.at)}</td><td className="td text-xs">{e.actor}</td><td className="td text-xs">{fmt.label(e.role)}</td><td className="td"><Chip tone="blue">{e.action}</Chip></td>
              <td className="td max-w-md truncate text-xs text-slate-500" title={JSON.stringify(e.after)}>{e.after ? JSON.stringify(e.after).slice(0, 140) : ""}</td></tr>)}</tbody></table>
        </Card>
      )}
      {tab === "documents" && (
        <Card title="Documents">
          {data.documents.map((d: any) => <div key={d.id} className="flex items-center justify-between border-b border-canvas-100 py-2 text-sm"><span className="flex items-center gap-2"><button className="flex items-center gap-1 text-info-600 hover:underline" onClick={() => openFile(`/api/files/${d.store}/${d.path}`, d.file_name)}><FileText size={13} />{d.file_name}</button><button title="Download" className="text-slate-400 hover:text-brand-600" onClick={() => downloadFile(`/api/files/${d.store}/${d.path}`, d.file_name)}><Download size={13} /></button></span><span className="flex gap-2"><Chip tone="blue">{fmt.label(d.doc_type)}</Chip><StatusChip status={d.status === "indexed" ? "done" : d.status} /></span></div>)}
        </Card>
      )}
      {tab === "spread" && <Spread loanId={id!} onChange={reload} />}
      {tab === "cmr" && <CmrEditor loanId={id!} onChange={reload} />}
      {tab === "pricing" && <Pricing loanId={id!} onChange={reload} />}
      {tab === "lineage" && <LineageView loanId={id!} />}
    </>
  );
}
