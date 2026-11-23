import { CheckCircle2, Download, FileText, Inbox, Mail, Send, Upload } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, downloadFile, fmt, openFile, useApi } from "../api";
import { AiCard, AssumedChip, Card, Chip, ConfidenceRing, Empty, ErrorState, Loading, PageHeader, StatusChip, useAction } from "../components/ui";
import { useApp } from "../context";
import { dayDate } from "../display";

const TYPES = ["financial_statements", "covenant_certificate", "supporting", "sponsor_letter", "waiver_request", "other"];

export default function Intake() {
  const { cycle, user } = useApp();
  const { data, error, loading, reload } = useApi<any>(cycle ? `/cycles/${cycle.id}/intake` : null, [cycle?.id]);
  const [sel, setSel] = useState<string | null>(null);
  const act = useAction();
  const nav = useNavigate();

  if (!cycle) return <Empty text="No active cycle found" />;
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;

  const loan = data.loans.find((l: any) => l.id === sel) || data.loans[0];
  const pm = user?.role === "pm_team";

  const chip = (l: any) =>
    l.package_status === "complete" ? (
      <span className="badge badge-green !text-[10px]">Complete</span>
    ) : l.package_status === "incomplete" ? (
      <span className="badge badge-amber !text-[10px]">Missing ({l.package_missing.length})</span>
    ) : l.package_status === "late" ? (
      <span className="badge badge-red !text-[10px]">Late ({l.days_late}d)</span>
    ) : (
      <span className="badge badge-gray !text-[10px]">Not Received</span>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Borrower Package Intake"
        ai
        subtitle={`Borrower reporting packages due Day ${data.due_day}. Each requires financial statements and a covenant compliance certificate. Watchlist loans also require a sponsor letter.`}
        actions={
          <div className="flex items-center gap-2">
            <AssumedChip dq={data.required.standard.discovery_question} what="required documents" />
            <button
              className="btn btn-secondary btn-sm gap-1.5"
              onClick={() =>
                act.run(async () => {
                  await api(`/cycles/${cycle.id}/intake/process`, { body: {} });
                  reload();
                })
              }
            >
              <Inbox size={13} />
              <span>Check Inbox</span>
            </button>
            {pm && (
              <button
                className="btn btn-primary btn-sm gap-1.5"
                onClick={() =>
                  act.run(async () => {
                    await api(`/cycles/${cycle.id}/chase`, { body: {} });
                    reload();
                  })
                }
              >
                <Send size={13} />
                <span>Draft Chases (A8)</span>
              </button>
            )}
          </div>
        }
      />

      {act.node}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 items-start">
        {/* Left Column: Loan Package Selector (3 cols) */}
        <div className="card shadow-sm xl:col-span-3 p-3 max-h-[75vh] overflow-y-auto space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-muted px-2 py-1.5 border-b border-line mb-1">
            Facilities ({data.loans.length})
          </div>
          {data.loans.map((l: any) => (
            <button
              key={l.id}
              onClick={() => setSel(l.id)}
              className={`w-full rounded-control p-2.5 text-left transition-colors flex flex-col gap-1 ${loan?.id === l.id
                ? "bg-brand-50/60 dark:bg-brand-950/40 border border-brand-300 dark:border-brand-800"
                : "hover:bg-surface-2 border border-transparent"
                }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-[13px] text-ink truncate">{l.borrower}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span className="font-mono">{l.facility_id}</span>
                {chip(l)}
              </div>
            </button>
          ))}
        </div>

        {/* Center Column: Documents & Tasks for Selected Loan (6 cols) */}
        <div className="space-y-6 xl:col-span-6">
          {loan ? (
            <>
              <Card
                title={`${loan.borrower} · Intake Package`}
                subtitle={`Facility ${loan.facility_id} · Package status: ${fmt.label(loan.package_status)}`}
                actions={
                  <div className="flex flex-wrap items-center gap-1.5">
                    {pm && loan.package_status !== "complete" && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() =>
                          act.run(async () => {
                            const note = prompt("Note for marking the package complete:");
                            if (note) {
                              await api(`/loans/${loan.id}/complete`, { body: { note } });
                              reload();
                            }
                          })
                        }
                      >
                        Mark Complete
                      </button>
                    )}
                    {pm && (
                      <button className="btn btn-secondary btn-sm" onClick={() => nav("/lincoln")}>
                        Share with Lincoln
                      </button>
                    )}
                    <label className="btn btn-primary btn-sm cursor-pointer gap-1.5">
                      <Upload size={13} />
                      <span>Upload</span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) =>
                          e.target.files?.[0] &&
                          act.run(async () => {
                            const f = new FormData();
                            f.append("file", e.target.files![0]);
                            await api(`/loans/${loan.id}/upload`, { form: f });
                            reload();
                          })
                        }
                      />
                    </label>
                  </div>
                }
              >
                {loan.package_missing.length > 0 && (
                  <div className="mb-4 rounded-control border border-warn-200 bg-warn-50/60 p-3 text-xs font-semibold text-warn-800">
                    Missing Documents: {loan.package_missing.map(fmt.label).join(", ")}
                  </div>
                )}

                {loan.documents.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-line bg-surface-2/40 text-[11px] font-semibold uppercase tracking-wider text-muted">
                          <th className="py-2 px-3">File Name</th>
                          <th className="py-2 px-3">Document Type</th>
                          <th className="py-2 px-3">Confidence</th>
                          <th className="py-2 px-3">Period</th>
                          <th className="py-2 px-3 text-right">Pages</th>
                          <th className="py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/70 text-[12.5px]">
                        {loan.documents.map((d: any) => (
                          <tr key={d.id} className="hover:bg-surface-2 transition-colors">
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1.5">
                                <button
                                  className="font-semibold text-ink hover:text-brand-600 flex items-center gap-1 truncate max-w-[180px]"
                                  onClick={() => openFile(`/api/files/${d.store}/${d.path}`, d.file_name)}
                                  title={d.file_name}
                                >
                                  <FileText size={13} className="shrink-0 text-muted" />
                                  <span className="truncate">{d.file_name}</span>
                                </button>
                                <button
                                  title="Download"
                                  className="text-muted hover:text-brand-600"
                                  onClick={() => downloadFile(`/api/files/${d.store}/${d.path}`, d.file_name)}
                                >
                                  <Download size={12} />
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <select
                                className="input !h-[24px] !py-0 !px-1.5 text-xs"
                                value={d.doc_type || "other"}
                                onChange={(e) =>
                                  act.run(async () => {
                                    await api(`/documents/${d.id}/classify`, { body: { doc_type: e.target.value } });
                                    reload();
                                  })
                                }
                              >
                                {TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {fmt.label(t)}
                                  </option>
                                ))}
                              </select>
                              {d.confirmed_by && (
                                <div className="text-[10.5px] text-muted mt-0.5">
                                  by {d.confirmed_by.split("@")[0]}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              <ConfidenceRing value={d.confidence} />
                            </td>
                            <td className="py-2.5 px-3 text-muted num font-medium">
                              {d.period || "-"}
                            </td>
                            <td className="py-2.5 px-3 text-right num text-muted">
                              {d.pages}
                            </td>
                            <td className="py-2.5 px-3">
                              <StatusChip status={d.status === "indexed" ? "done" : d.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty text="No documents received yet" hint="Uploaded borrower statements will appear here." />
                )}

                {/* Milestone Tasks */}
                <div className="mt-5 pt-4 border-t border-line">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted mb-2">Cycle Tasks</div>
                  <div className="space-y-1.5">
                    {loan.tasks.map((t: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center justify-between border-b border-line/60 py-1.5 text-xs"
                      >
                        <span className="font-medium text-ink">{t.title}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted num">{dayDate(t.due_day)}</span>
                          <StatusChip status={t.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Email Communications Thread */}
              <Card title="Borrower Email Thread" subtitle="Incoming statements and correspondence">
                {loan.emails.length ? (
                  <div className="space-y-3">
                    {loan.emails.map((e: any) => (
                      <div key={e.id} className="rounded-card border border-line bg-surface-2/40 p-3.5 text-xs">
                        <div className="flex items-center justify-between text-muted mb-1">
                          <span className="font-semibold text-ink flex items-center gap-1.5">
                            <Mail size={13} /> {e.from}
                            {e.match && <span className="badge badge-info !text-[10px]">matched: {e.match}</span>}
                          </span>
                          <span className="num">{dayDate(e.day)}</span>
                        </div>
                        <div className="font-bold text-[13px] text-ink mt-1">{e.subject}</div>
                        <div className="mt-1.5 whitespace-pre-wrap text-muted leading-relaxed font-sans">
                          {e.body}
                        </div>
                        {e.attachments?.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-line text-[11px] text-muted">
                            <b>Attachments:</b> {e.attachments.join(", ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty text="No emails received" hint="Messages sent by the borrower will appear here." />
                )}
              </Card>
            </>
          ) : (
            <Empty text="Select a loan facility" />
          )}
        </div>

        {/* Right Column: AI Suggestions, Chases & Sent Messages (3 cols) */}
        <div className="space-y-6 xl:col-span-3">
          {data.low_confidence.map((d: any) => (
            <AiCard
              key={d.id}
              title={`Classify: ${d.file_name}`}
              confidence={d.confidence}
              status={d.suggestion?.status}
              actions={
                <div className="flex flex-wrap gap-1.5">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      act.run(async () => {
                        await api(`/documents/${d.id}/classify`, { body: { doc_type: d.doc_type } });
                        reload();
                      })
                    }
                  >
                    Accept
                  </button>
                  <select
                    className="input !h-[26px] !py-0 !px-1.5 text-xs"
                    onChange={(e) =>
                      act.run(async () => {
                        await api(`/documents/${d.id}/classify`, { body: { doc_type: e.target.value } });
                        reload();
                      })
                    }
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Change type...
                    </option>
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {fmt.label(t)}
                      </option>
                    ))}
                  </select>
                </div>
              }
            >
              Identified as <b>{fmt.label(d.doc_type)}</b>. Below the {data.rule.value} threshold; requires user confirmation.
            </AiCard>
          ))}

          {data.reminders
            .filter((r: any) => r.status === "draft")
            .map((r: any) => (
              <AiCard
                key={r.id}
                title={`Chase Draft: ${r.borrower}`}
                confidence={0.95}
                actions={
                  pm ? (
                    <button
                      className="btn btn-primary btn-sm gap-1"
                      onClick={() =>
                        act.run(async () => {
                          await api(`/reminders/${r.id}/send`, { body: {} });
                          reload();
                        })
                      }
                    >
                      <Send size={12} />
                      <span>Send Chase</span>
                    </button>
                  ) : undefined
                }
              >
                <div className="font-bold text-ink">{r.subject}</div>
                <div className="mt-1 whitespace-pre-wrap text-xs text-muted leading-relaxed font-sans">
                  {r.body}
                </div>
              </AiCard>
            ))}

          <Card title="Unmatched Incoming Mail">
            {data.unmatched.length ? (
              <div className="space-y-1.5 text-xs">
                {data.unmatched.map((e: any) => (
                  <div key={e.id} className="p-2 rounded border border-line bg-surface-2 font-medium">
                    {e.subject}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted">All incoming emails matched to facilities.</div>
            )}
          </Card>

          <Card title="Recently Dispatched Chases">
            {data.sent.slice(0, 10).map((e: any) => (
              <div key={e.id} className="border-b border-line/60 pb-2 mb-2 last:border-0 last:mb-0 text-xs">
                <div className="font-semibold text-ink">{e.subject}</div>
                <div className="text-muted mt-0.5">To: {e.to?.join(", ")}</div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
