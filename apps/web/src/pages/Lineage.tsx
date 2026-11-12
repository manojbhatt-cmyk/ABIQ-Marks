import { useNavigate, useParams } from "react-router-dom";
import { useApi } from "../api";
import { Empty, PageHeader } from "../components/ui";
import { useApp } from "../context";
import LineageView from "./LineageView";

export default function Lineage() {
  const { id } = useParams();
  const { cycle } = useApp();
  const nav = useNavigate();
  const loans = useApi<any[]>(cycle ? `/cycles/${cycle.id}/loans` : null, [cycle?.id]);
  const sunrise = loans.data?.find((l) => l.facility_id === "F-0003");
  const current = id || sunrise?.id;
  return (
    <>
      <PageHeader title="Lineage and audit" subtitle="Any mark traced to its documents, spread, CMR versions, Lincoln versions, decisions and approvers"
        actions={<select className="input w-64" value={current || ""} onChange={(e) => nav(`/lineage/${e.target.value}`)}>{(loans.data || []).filter((l) => l.in_scope).map((l) => <option key={l.id} value={l.id}>{l.borrower} ({l.facility_id})</option>)}</select>} />
      {current ? <LineageView loanId={current} /> : <Empty text="Pick a loan" />}
    </>
  );
}
