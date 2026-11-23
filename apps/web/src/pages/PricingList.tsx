import { ArrowRight, CheckCircle2, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fmt, useApi } from "../api";
import { Card, Empty, ErrorState, Loading, Loops, PageHeader, StatusChip } from "../components/ui";
import { useApp } from "../context";

export default function PricingList() {
  const { cycle } = useApp();
  const { data, error, loading, reload } = useApi<any[]>(cycle ? `/cycles/${cycle.id}/loans` : null, [cycle?.id]);
  const nav = useNavigate();

  if (!cycle) return <Empty text="No active cycle found" />;
  if (loading && !data) return <Loading label="Loading pricing panel..." />;
  if (error) return <ErrorState error={error} retry={reload} />;

  const inScope = data!.filter((l) => l.in_scope);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gate 1 Pricing Panel"
        ai
        subtitle="Deal Team Gate 1 Decision: approve Lincoln's valuation mark for your assigned loans, propose an alternate mark, or return to Lincoln with audited notes."
      />

      <div className="card shadow-sm overflow-hidden">
        <div className="hidden md:block overflow-hidden">
          <table className="w-full table-fixed text-left border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-[11.5px] font-bold uppercase tracking-wider text-ink">
                <th className="py-2.5 px-4 w-[28%]">Facility & Borrower</th>
                <th className="py-2.5 px-3 w-[16%] text-right">Previous Mark</th>
                <th className="py-2.5 px-3 w-[16%] text-right">Lincoln Draft Mark</th>
                <th className="py-2.5 px-3 w-[16%] text-right">Deal Team Mark</th>
                <th className="py-2.5 px-3 w-[12%]">Status</th>
                <th className="py-2.5 px-4 w-[12%] text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70 text-[13px]">
              {inScope.map((l) => (
                <tr key={l.id} className="hover:bg-surface-2 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-ink">{l.borrower}</div>
                    <div className="text-[11.5px] text-muted num font-mono mt-0.5">{l.facility_id} · {l.team}</div>
                  </td>
                  <td className="py-3 px-3 text-right font-medium num text-muted">{fmt.mark(l.previous_mark)}</td>
                  <td className="py-3 px-3 text-right font-bold num text-ink">{fmt.mark(l.lincoln_mark)}</td>
                  <td className="py-3 px-3 text-right font-bold num text-brand-700 dark:text-brand-400">{fmt.mark(l.deal_team_mark)}</td>
                  <td className="py-3 px-3">
                    <StatusChip status={l.status} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      className="btn btn-secondary btn-sm gap-1 !h-[26px] !text-xs font-semibold"
                      onClick={() => nav(`/loans/${l.id}/pricing`)}
                    >
                      <span>Decide</span>
                      <ArrowRight size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-line/70">
          {inScope.map((l) => (
            <div key={l.id} className="p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-ink">{l.borrower}</div>
                  <div className="text-xs text-muted font-mono">{l.facility_id}</div>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => nav(`/loans/${l.id}/pricing`)}
                >
                  Decide →
                </button>
              </div>
              <div className="flex justify-between text-xs pt-1">
                <span>Lincoln: <b className="num">{fmt.mark(l.lincoln_mark)}</b></span>
                <span>DT: <b className="num">{fmt.mark(l.deal_team_mark)}</b></span>
                <StatusChip status={l.status} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
