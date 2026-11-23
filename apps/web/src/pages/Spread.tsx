import { CheckCircle2, ChevronRight, ExternalLink, Info, Pencil, Sparkles } from "lucide-react";
import { useState } from "react";
import { api, fmt, openFile, useApi } from "../api";
import { AiCard, AssumedChip, Card, Chip, ConfidenceRing, Empty, ErrorState, Loading, Modal, Running, useAction, useConfirm } from "../components/ui";

function Conf({ v }: { v: number | null }) {
  if (v === null || v === undefined) {
    return <span className="h-2 w-2 rounded-full border border-line" title="No agent evidence" />;
  }
  const pct = Math.round(v * 100);
  const tone = pct >= 90 ? "bg-success-500" : pct >= 70 ? "bg-warn-500" : "bg-danger-500";
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${tone}`}
      title={`Agent confidence: ${pct}%`}
      aria-label={`Confidence ${pct}%`}
    />
  );
}

const COLS = [
  ["quarter", "Q3 2026 (Current)"],
  ["prior_quarter", "Q2 2026 (Prior)"],
  ["same_quarter_last_year", "Q3 2025 (YoY)"],
] as const;

export default function Spread({ loanId, onChange }: { loanId: string; onChange: () => void }) {
  const { data, error, loading, reload } = useApi<any>(`/loans/${loanId}/spread`, [loanId]);
  const act = useAction();
  const confirm = useConfirm();
  const [evidence, setEvidence] = useState<any>(null);
  const [traj, setTraj] = useState<any>(null);

  if (loading && !data) return <Loading label="Loading financial spreading matrix..." />;
  if (error) return <ErrorState error={error} retry={reload} />;

  const refresh = () => {
    reload();
    onChange();
  };

  if (!data) {
    return (
      <Card title="Financial Spreading Review" ai>
        {act.busy ? (
          <Running text="Spreading Agent extracting data from borrower package tables..." />
        ) : (
          <Empty
            text="No financial spread model generated yet"
            hint="The Spreading Agent analyzes statements and drafts line items with full source citations."
            action={
              <button
                className="btn btn-primary"
                onClick={() =>
                  act.run(async () => {
                    await api(`/loans/${loanId}/spread/run`, { body: {} });
                    refresh();
                  })
                }
              >
                Run Spreading Agent
              </button>
            }
          />
        )}
        {act.node}
      </Card>
    );
  }

  const sp = data.spread;
  const lines: any[] = data.lines;
  const cell = (code: string, period: string) => lines.find((l) => l.line_code === code && l.period_type === period);
  const approved = sp.status === "approved";
  const m = data.metrics;

  const editCell = (li: any) =>
    act.run(async () => {
      const v = prompt(`New value for ${li.line_code} (${li.period_type}):`, String(li.value));
      if (v === null) return;
      const reason = prompt("Reason for manual override (required for audit):");
      if (!reason) return;
      await api(`/spread-lines/${li.id}`, { method: "PATCH", body: { value: Number(v), reason } });
      refresh();
    });

  const addLine = (code: string, period: string) =>
    act.run(async () => {
      const v = prompt(`Enter ${code} value for ${period}:`);
      if (v === null) return;
      const reason = prompt("Source document citation (required):");
      if (!reason) return;
      await api(`/spreads/${sp.id}/lines`, { body: { line_code: code, period_type: period, value: Number(v), reason } });
      refresh();
    });

  const accepted = data.adjustments.filter((a: any) => a.accepted !== false);

  return (
    <div className="space-y-6">
      {act.node}
      {confirm.node}

      {sp.not_found?.length > 0 && (
        <div className="rounded-card border border-warn-200 bg-warn-50/70 p-3.5 text-xs text-warn-800 leading-relaxed shadow-sm">
          <b>Incomplete Items:</b> The agent could not automatically parse {sp.not_found.join(", ")}. Please enter these lines manually using source citations.
        </div>
      )}

      {/* Model Toolbar */}
      <div className="card p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-xs">
          <span className={`badge ${approved ? "badge-green" : "badge-amber"}`}>
            Spread v{sp.version} · {fmt.label(sp.status)}
          </span>
          {sp.approved_by && (
            <span className="text-muted">
              Approved by <b>{sp.approved_by}</b> ({fmt.date(sp.approved_at)}) · Everest: {sp.written_back}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => api(`/agent-runs/${sp.agent_run_id}`).then(setTraj)}
          >
            Agent Trajectory
          </button>
          {!approved && (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  act.run(async () => {
                    const r = await api(`/spreads/${sp.id}/accept-above`, { body: { threshold: 0.9 } });
                    alert(`${r.lines} lines with ≥90% confidence accepted as proposed.`);
                  })
                }
              >
                Accept All ≥90%
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  act.run(async () => {
                    const ins = prompt("Instructions for the re-run:");
                    if (ins === null) return;
                    await api(`/loans/${loanId}/spread/run`, { body: { instructions: ins } });
                    refresh();
                  })
                }
              >
                Request Re-run
              </button>
              <button
                className="btn btn-primary btn-sm gap-1.5"
                onClick={() =>
                  confirm.ask(
                    <>Approve financial spread v{sp.version} for Q3 2026? This commits {new Set(lines.map((l) => l.line_code)).size} lines and {accepted.length} add-backs to Everest.</>,
                    async () => {
                      await api(`/spreads/${sp.id}/approve`, { body: {} });
                      refresh();
                    }
                  )
                }
              >
                <CheckCircle2 size={13} />
                <span>Approve Spread</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 items-start">
        {/* Main Spread Table (8 cols) */}
        <div className="card shadow-sm xl:col-span-8 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 bg-surface-2/40 text-[11.5px] text-muted">
            <div className="flex items-center gap-3">
              <span className="font-bold text-ink">Confidence Scale:</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success-500" /> ≥90% high</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warn-500" /> 70–89% check</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-danger-500" /> &lt;70% review</span>
            </div>
            <span>Click any number to view citation{!approved ? " · Hover to edit" : ""}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-left border-collapse">
              <colgroup>
                <col className="w-[36%]" />
                {COLS.map(([p]) => (
                  <col key={p} className="w-[18%]" />
                ))}
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-line bg-surface-2/20 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <th className="py-2.5 px-3">Template Line</th>
                  {COLS.map(([, l]) => (
                    <th key={l} className="py-2.5 px-3 text-right">
                      {l}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-right">LTM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70 text-[12.5px]">
                {data.template.map((t: any) => {
                  const calc = t.IS_CALCULATED;
                  return (
                    <tr key={t.LINE_CODE} className={`transition-colors ${calc ? "bg-surface-2/30" : "hover:bg-surface-2"}`}>
                      <td className="py-2.5 px-3">
                        <div className={`font-semibold ${calc ? "text-muted" : "text-ink"}`}>
                          {t.LINE_LABEL}
                        </div>
                        <div className="font-mono text-[10.5px] text-faint truncate" title={calc ? t.FORMULA : t.LINE_CODE}>
                          {t.LINE_CODE}{calc ? ` = ${t.FORMULA}` : ""}
                        </div>
                      </td>

                      {COLS.map(([p]) => {
                        if (calc) {
                          return (
                            <td key={p} className="py-2.5 px-3 text-right text-muted num font-medium">
                              {p === "quarter" && m[t.LINE_CODE]
                                ? t.UNIT === "x"
                                  ? fmt.x(m[t.LINE_CODE].value)
                                  : t.LINE_CODE.includes("YOY")
                                  ? fmt.pct(m[t.LINE_CODE].value, 0)
                                  : fmt.num(m[t.LINE_CODE].value)
                                : "—"}
                            </td>
                          );
                        }

                        const li = cell(t.LINE_CODE, p);
                        if (!li) {
                          return (
                            <td key={p} className="py-2.5 px-3 text-right">
                              {p === "quarter" && !approved && sp.not_found?.includes(t.LINE_CODE) ? (
                                <button className="text-xs text-brand-600 font-bold underline" onClick={() => addLine(t.LINE_CODE, p)}>
                                  + Add
                                </button>
                              ) : (
                                "—"
                              )}
                            </td>
                          );
                        }

                        const conf = li.evidence ? li.confidence : null;
                        const check = conf !== null && conf < 0.9;
                        const low = conf !== null && conf < 0.7;

                        return (
                          <td
                            key={p}
                            className={`py-2.5 px-3 text-right group ${low ? "bg-danger-50/50" : check ? "bg-warn-50/50" : ""}`}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              {li.edited && (
                                <span className="badge badge-gray !py-0 !h-[17px] !text-[9.5px]" title={`Edited: ${li.edit_reason}`}>
                                  edited
                                </span>
                              )}
                              <button
                                className="font-bold text-ink underline-offset-2 hover:underline num"
                                title={li.evidence ? `${li.evidence.file} p.${li.evidence.page}` : "No evidence"}
                                onClick={() => (li.evidence ? setEvidence(li) : null)}
                              >
                                {fmt.num(li.value)}
                              </button>
                              <Conf v={conf} />
                              {!approved && (
                                <button
                                  className="text-muted hover:text-ink opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                                  onClick={() => editCell(li)}
                                  title="Edit value"
                                >
                                  <Pencil size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      <td className="py-2.5 px-3 text-right num font-bold text-ink">
                        {t.LINE_CODE === "LTM_ADJ_EBITDA" ? fmt.num(m.LTM_ADJ_EBITDA?.value) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar: Add-backs & Key Ratios (4 cols) */}
        <div className="space-y-6 xl:col-span-4">
          <Card title="EBITDA Add-backs" ai actions={<AssumedChip dq="DQ8" what="add-back allow-list" />}>
            {data.adjustments.length ? (
              <div className="space-y-3">
                {data.adjustments.map((a: any) => (
                  <AiCard
                    key={a.id}
                    title={`${fmt.label(a.adj_type)} ${fmt.num(a.amount)}`}
                    status={a.accepted === true ? "accepted" : a.accepted === false ? "rejected" : undefined}
                    evidence={
                      <button
                        className="font-semibold text-brand-600 underline-offset-2 hover:underline"
                        onClick={() => setEvidence({ evidence: a.evidence, source_label: a.description })}
                      >
                        {a.evidence.file} p.{a.evidence.page}
                      </button>
                    }
                    actions={
                      !approved && a.accepted === null ? (
                        <div className="flex gap-2">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() =>
                              act.run(async () => {
                                await api(`/adjustments/${a.id}`, { body: { accept: true } });
                                refresh();
                              })
                            }
                          >
                            Accept
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              act.run(async () => {
                                await api(`/adjustments/${a.id}`, { body: { accept: false } });
                                refresh();
                              })
                            }
                          >
                            Reject
                          </button>
                        </div>
                      ) : undefined
                    }
                  >
                    <div className="italic text-muted">"{a.description}"</div>
                    <div className="mt-1">
                      {a.allowed ? (
                        <span className="badge badge-green">On Allow-list</span>
                      ) : (
                        <span className="badge badge-red">Discretionary</span>
                      )}
                    </div>
                  </AiCard>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted">No non-standard items identified in package notes.</div>
            )}
          </Card>

          <Card title="Calculated Credit Metrics" subtitle="Automated ratio calculations from model inputs">
            <div className="divide-y divide-line/60 text-xs">
              {[
                "ADJ_EBITDA", "LTM_ADJ_EBITDA", "NET_DEBT", "LEVERAGE", "NET_LEVERAGE",
                "INTEREST_COVER", "FCCR", "LIQUIDITY", "LIQUIDITY_MONTHS", "COVENANT_CUSHION",
              ].map((k) => (
                <div key={k} className="flex items-center justify-between py-2">
                  <span className="font-medium text-muted">{fmt.label(k)}</span>
                  <span className="num font-bold text-ink">
                    {["LEVERAGE", "NET_LEVERAGE", "INTEREST_COVER", "FCCR"].includes(k)
                      ? fmt.x(m[k]?.value)
                      : k === "COVENANT_CUSHION"
                      ? fmt.pct(m[k]?.value)
                      : k === "LIQUIDITY_MONTHS"
                      ? `${fmt.num(m[k]?.value)} mo`
                      : fmt.num(m[k]?.value)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Covenant Headroom">
            <div className="space-y-2 text-xs">
              {data.covenants.map((c: any) => (
                <div key={c.covenant_id} className="flex items-center justify-between p-2 rounded border border-line bg-surface-2/40">
                  <span className="font-semibold">{fmt.label(c.type)} {c.operator} {fmt.x(c.threshold)}</span>
                  <div className="flex items-center gap-2">
                    <span className="num font-bold">{fmt.x(c.actual)}</span>
                    <span className={`badge ${c.result === "fail" ? "badge-red" : "badge-green"}`}>
                      {c.result === "fail" ? "Breached" : `Pass (+${fmt.pct(c.headroom, 0)})`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {evidence && (
        <Modal title="Document Evidence & Citation" onClose={() => setEvidence(null)} wide>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted mb-1">Source File</div>
              <div className="text-[13px] font-semibold text-ink">
                {evidence.evidence.file}, page {evidence.evidence.page}
              </div>
              <div className="mt-2.5 rounded-control border border-line bg-surface-2 p-3 font-mono text-xs leading-relaxed">
                {evidence.evidence.text}
              </div>
              <button
                className="btn btn-primary btn-sm mt-3"
                onClick={() => api(`/documents/${evidence.evidence.doc_id}`).then((d) => openFile(d.url))}
              >
                Open Original Document
              </button>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted mb-1">Extracted Value</div>
              <div className="text-[14px] font-bold num text-ink">
                {evidence.line_code || "Adjustment"}: {evidence.value ?? ""}
              </div>
              <div className="mt-2 text-xs text-muted">{evidence.source_label}</div>
            </div>
          </div>
        </Modal>
      )}

      {traj && (
        <Modal title={`Spreading Agent Execution Trace: ${traj.component}`} onClose={() => setTraj(null)} wide>
          <div className="mb-3 text-xs text-muted">
            Engine: {traj.engine} · Tokens: {traj.tokens} · Cost: ${traj.cost?.toFixed(4)}
          </div>
          <div className="space-y-1.5 font-mono text-xs max-h-96 overflow-y-auto">
            {traj.trajectory.map((t: any) => (
              <div key={t.step} className="p-2 border-b border-line">
                <b>{t.step}. {t.name}</b>: {JSON.stringify(t.detail)}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
