import { useNavigate } from "react-router-dom";
import { fmt, useApi } from "../api";
import { Empty, ErrorState, Loading, Loops, PageHeader, StatusChip } from "../components/ui";
import { useApp } from "../context";

export default function PricingList() {
  const { cycle } = useApp();
  const { data, error, loading, reload } = useApi<any[]>(cycle ? `/cycles/${cycle.id}/loans` : null, [cycle?.id]);
  const nav = useNavigate();
  if (!cycle) return <Empty text="No cycle yet" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  return (
    <>
      <PageHeader title="Pricing Panel" ai subtitle="Gate G1 (Q14): approve or send back Lincoln's mark for your team's loans" />
      <div className="card">
        <table className="w-full"><thead><tr>{["Borrower", "Facility", "Previous", "Lincoln", "Deal Team", "Status", "Loops", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>{data!.filter((l) => l.in_scope).map((l) => (
            <tr key={l.id} className="hover:bg-canvas-50"><td className="td font-medium">{l.borrower}</td><td className="td">{l.facility_id}</td><td className="tdn">{fmt.mark(l.previous_mark)}</td>
              <td className="tdn">{fmt.mark(l.lincoln_mark)}</td><td className="tdn">{fmt.mark(l.deal_team_mark)}</td><td className="td"><StatusChip status={l.status} /></td><td className="td"><Loops loops={l.loops} /></td>
              <td className="td"><button className="btn-secondary" onClick={() => nav(`/loans/${l.id}/pricing`)}>Open</button></td></tr>))}</tbody></table>
      </div>
    </>
  );
}
