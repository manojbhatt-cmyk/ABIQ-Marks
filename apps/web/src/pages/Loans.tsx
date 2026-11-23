import { ArrowRight, Layers } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fmt, useApi } from "../api";
import { Card, Chip, Empty, ErrorState, Loading, Loops, PageHeader, StatusChip } from "../components/ui";
import { useApp } from "../context";

export default function Loans() {
  const { cycle, user } = useApp();
  const { data, error, loading, reload } = useApi<any[]>(cycle ? `/cycles/${cycle.id}/loans` : null, [cycle?.id]);
  const nav = useNavigate();

  if (!cycle) return <Empty text="No active cycle found" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;

  const mine = user?.deal_team_id;
  const inScopeLoans = data!.filter((l) => l.in_scope);

  return (
    <div className="space-y-6">
      <PageHeader
        title={mine ? "My Portfolio Loans" : "Quarterly Loans Inventory"}
        subtitle={`${cycle.period} valuation cycle: ${inScopeLoans.length} active in-scope facilities${
          mine ? ` assigned to ${data![0]?.team || "your deal team"}` : " across all deal teams"
        }.`}
      />

      <div className="card shadow-sm overflow-hidden">
        {/* Desktop Table: 5 Proportional Columns with Zero Horizontal Scrolling */}
        <div className="hidden md:block overflow-hidden">
          <table className="w-full table-fixed text-left border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-[11.5px] font-bold uppercase tracking-wider text-ink">
                <th className="py-2.5 px-4 w-[24%]">Facility & Deal Team</th>
                <th className="py-2.5 px-3 w-[16%]">Structure & Funded</th>
                <th className="py-2.5 px-3 w-[26%]">Mark Evolution (Prev → Lincoln → DT → Comm)</th>
                <th className="py-2.5 px-3 w-[18%]">Current Stage & Status</th>
                <th className="py-2.5 px-4 w-[16%] text-right">Package & Loops</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70 text-[13px]">
              {inScopeLoans.map((l) => (
                <tr
                  key={l.id}
                  className="group cursor-pointer transition-colors hover:bg-surface-2"
                  onClick={() => nav(`/loans/${l.id}`)}
                >
                  {/* 1. Borrower & Facility */}
                  <td className="py-3 px-4 align-top">
                    <div className="font-bold text-ink leading-snug group-hover:text-brand-600 transition-colors">
                      {l.borrower}
                    </div>
                    <div className="text-[11.5px] text-muted num font-mono mt-0.5">
                      {l.facility_id} · {l.team}
                    </div>
                  </td>

                  {/* 2. Structure & Funded */}
                  <td className="py-3 px-3 align-top">
                    <div className="font-semibold text-ink">{fmt.label(l.facility_type)}</div>
                    <div className="text-[11.5px] text-muted num mt-0.5">
                      Funded: {fmt.num(l.funded)}
                    </div>
                  </td>

                  {/* 3. Mark Evolution (Prev -> Lincoln -> DT -> Comm) */}
                  <td className="py-3 px-3 align-top">
                    <div className="flex items-center gap-1.5 text-xs font-semibold num">
                      <span className="text-muted" title="Previous Mark">{fmt.mark(l.previous_mark)}</span>
                      <span className="text-faint">→</span>
                      <span className="badge badge-gray !py-0 !h-[18px]" title="Lincoln Draft Mark">{fmt.mark(l.lincoln_mark)}</span>
                      <span className="text-faint">→</span>
                      <span className="badge badge-info !py-0 !h-[18px]" title="Deal Team Gate 1 Mark">{fmt.mark(l.deal_team_mark)}</span>
                      <span className="text-faint">→</span>
                      <span className="badge badge-amber !py-0 !h-[18px]" title="Committee Mark">{fmt.mark(l.committee_mark)}</span>
                    </div>
                    <div className="text-[11px] text-muted mt-1">
                      Prev · Lincoln · Deal Team · Committee
                    </div>
                  </td>

                  {/* 4. Current Stage & Status */}
                  <td className="py-3 px-3 align-top">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="badge badge-info font-bold num !text-[11px]">
                        Step {String(l.current_step).replace("Q", "")}
                      </span>
                    </div>
                    <StatusChip status={l.status} />
                  </td>

                  {/* 5. Package Status & Rework Loops */}
                  <td className="py-3 px-4 align-top text-right">
                    <div className="flex flex-col items-end gap-1">
                      <StatusChip status={l.package_status} />
                      <div className="flex flex-wrap items-center justify-end gap-1 mt-0.5">
                        <Loops loops={l.loops} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile / Tablet View: Stacked Cards */}
        <div className="md:hidden divide-y divide-line/70">
          {inScopeLoans.map((l) => (
            <div
              key={l.id}
              className="p-4 cursor-pointer hover:bg-surface-2 transition-colors space-y-2.5"
              onClick={() => nav(`/loans/${l.id}`)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-ink">{l.borrower}</div>
                  <div className="text-xs text-muted font-mono">{l.facility_id} · {l.team}</div>
                </div>
                <span className="badge badge-info num font-bold">Step {String(l.current_step).replace("Q", "")}</span>
              </div>
              <div className="flex items-center justify-between text-xs border-t border-line/60 pt-2">
                <span className="text-muted">Status: <StatusChip status={l.status} /></span>
                <span className="font-semibold text-brand-600 flex items-center gap-1">
                  Workspace <ArrowRight size={12} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
