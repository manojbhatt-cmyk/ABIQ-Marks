import { useNavigate } from "react-router-dom";
import { fmt, useApi } from "../api";
import { Chip, Empty, ErrorState, Loading, Loops, PageHeader, StatusChip } from "../components/ui";
import { useApp } from "../context";

export default function Loans() {
  const { cycle, user } = useApp();
  const { data, error, loading, reload } = useApi<any[]>(cycle ? `/cycles/${cycle.id}/loans` : null, [cycle?.id]);
  const nav = useNavigate();
  if (!cycle) return <Empty text="No cycle yet" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  const mine = user?.deal_team_id;
  return (
    <>
      <PageHeader title={mine ? "My Loans" : "Loans"} subtitle={`${cycle.period}: ${data!.filter((l) => l.in_scope).length} loans${mine ? ` for ${data![0]?.team || "your team"}` : ""}`} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr>{["Borrower", "Facility", "Team", "Type", "Funded", "Prev mark", "Lincoln", "Deal Team", "Committee", "Step", "Status", "Package", "Loops"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>{data!.filter((l) => l.in_scope).map((l) => (
            <tr key={l.id} className="cursor-pointer hover:bg-canvas-50" onClick={() => nav(`/loans/${l.id}`)}>
              <td className="td font-medium">{l.borrower}</td><td className="td">{l.facility_id}</td><td className="td">{l.team}</td><td className="td">{fmt.label(l.facility_type)}</td>
              <td className="tdn">{fmt.num(l.funded)}</td><td className="tdn">{fmt.mark(l.previous_mark)}</td><td className="tdn">{fmt.mark(l.lincoln_mark)}</td>
              <td className="tdn">{fmt.mark(l.deal_team_mark)}</td><td className="tdn">{fmt.mark(l.committee_mark)}</td>
              <td className="td"><Chip tone="blue">{l.current_step}</Chip></td><td className="td"><StatusChip status={l.status} /></td><td className="td"><StatusChip status={l.package_status} /></td><td className="td"><Loops loops={l.loops} /></td>
            </tr>))}</tbody>
        </table>
      </div>
    </>
  );
}
