import { AlertCircle, CheckCircle2, Clock, FileDown, MessageSquare, Send, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api, fmt, openFile, useApi } from "../api";
import { AssumedChip, Card, Chip, Empty, ErrorState, Field, Loading, LoopBadge, PageHeader, StatusChip, useAction, useConfirm } from "../components/ui";
import SctSessions from "../components/SctSessions";
import { useApp } from "../context";
import { dayDate } from "../display";

export default function Reviews() {
  const { cycle, user } = useApp();
  const q = useApi<any[]>(cycle ? `/cycles/${cycle.id}/reviews` : null, [cycle?.id]);
  const [sel, setSel] = useState<any>(null);
  const item = (sel && q.data?.find((x) => x.cmr_id === sel)) || q.data?.find((x) => x.review_id || x.stage === "file" || x.stage === "refile");
  const cmr = useApi<any>(item ? `/loans/${item.cycle_loan_id}/cmr` : null, [item?.cmr_id]);
  const act = useAction();
  const confirm = useConfirm();
  const [section, setSection] = useState("summary");
  const [text, setText] = useState("");

  useEffect(() => setText(""), [item?.cmr_id]);

  if (!cycle) return <Empty text="No active cycle found" />;
  if (q.loading && !q.data) return <Loading label="Loading review queue..." />;
  if (q.error) return <ErrorState error={q.error} retry={q.reload} />;

  const refresh = () => {
    q.reload();
    cmr.reload();
  };

  const c = cmr.data;
  const review = c?.reviews?.find((r: any) => r.id === item?.review_id);
  const checklist = review?.checklist || [];
  const myStage = { ac_manager: "ac_manager", pm_team: "pm_team", sct: "sct" }[user!.role as string];
  const canAct = review && review.stage === myStage && !review.outcome;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review Queue"
        ai
        subtitle="Multi-tier governance review: A/C Manager initial review, PM Team verification, SCT session review, and final SharePoint filing."
        actions={<AssumedChip dq="DQ10" what="reviewer order" />}
      />

      {act.node}
      {confirm.node}

      {/* SCT Sessions Bar */}
      {["pm_team", "sct", "admin"].includes(user!.role) && (
        <SctSessions cycleId={cycle.id} canBuild={user!.role === "pm_team"} />
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 items-start">
        {/* Left: Queue Items (3 cols) */}
        <div className="card shadow-sm xl:col-span-3 p-3 max-h-[75vh] overflow-y-auto space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-muted px-2 py-1.5 border-b border-line mb-1">
            Pending Reviews ({q.data!.length})
          </div>
          {q.data!.length ? (
            q.data!.map((x) => (
              <button
                key={x.cmr_id}
                onClick={() => setSel(x.cmr_id)}
                className={`w-full rounded-control p-2.5 text-left transition-colors flex flex-col gap-1 ${
                  item?.cmr_id === x.cmr_id
                    ? "bg-brand-50/70 dark:bg-brand-950/40 border border-brand-300 dark:border-brand-800"
                    : "hover:bg-surface-2 border border-transparent"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-[13px] text-ink truncate">{x.borrower}</span>
                  <LoopBadge code="QB" n={x.loops} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>v{x.version}</span>
                  {x.stage ? (
                    <span className="badge badge-amber !text-[9.5px]">{fmt.label(x.stage)}</span>
                  ) : (
                    <StatusChip status={x.status} />
                  )}
                  {x.due_day && <span className="num font-semibold">Due {dayDate(x.due_day)}</span>}
                </div>
              </button>
            ))
          ) : (
            <Empty text="No reviews awaiting your stage" />
          )}
        </div>

        {/* Center: Selected CMR Content & Section Feedback (6 cols) */}
        <div className="space-y-6 xl:col-span-6">
          {c && item ? (
            <Card
              title={`${item.borrower} · CMR Memorandum v${c.cmr.version}`}
              subtitle="Review document sections and attach reviewer notes"
              actions={
                <button className="btn btn-secondary btn-sm gap-1.5" onClick={() => openFile(`/api/cmr/${c.cmr.id}/pdf`)}>
                  <FileDown size={13} />
                  <span>View PDF</span>
                </button>
              }
            >
              <div className="space-y-5">
                {c.sections.map((s: any) => (
                  <div key={s.id} className="rounded-card border border-line bg-surface-2/30 p-4">
                    <div className="flex items-center justify-between border-b border-line/60 pb-2 mb-2">
                      <span className="font-bold text-[13.5px] text-ink">{s.title}</span>
                      <button
                        className="text-xs font-semibold text-brand-600 hover:underline flex items-center gap-1"
                        onClick={() => setSection(s.code)}
                      >
                        <MessageSquare size={12} />
                        <span>Add Comment</span>
                      </button>
                    </div>

                    <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink font-sans">
                      {s.body || <span className="text-muted italic">Section has not been written yet.</span>}
                    </div>

                    {/* Section Comments */}
                    {c.reviews
                      .flatMap((r: any) => r.comments.filter((x: any) => x.section === s.code).map((x: any) => ({ ...x, stage: r.stage })))
                      .map((x: any) => (
                        <div
                          key={x.id}
                          className={`mt-2.5 rounded p-2 text-xs leading-relaxed ${
                            x.resolved
                              ? "bg-surface-2 text-muted border border-line"
                              : "bg-danger-50 text-danger-800 border border-danger-200"
                          }`}
                        >
                          <b>{fmt.label(x.stage)}:</b> {x.text}{" "}
                          {x.resolved && <span className="text-muted font-normal">(Resolved: {x.resolution_note})</span>}
                        </div>
                      ))}
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3 border-t border-line text-xs text-muted">
                <b>Supporting Attachments:</b> {c.evidence.map((e: any) => e.file_name).join(", ") || "None"}
              </div>
            </Card>
          ) : (
            <Empty text="Select a CMR from the queue to review" />
          )}
        </div>

        {/* Right: Actions, Checklist & Decision (3 cols) */}
        <div className="space-y-6 xl:col-span-3">
          {item?.stage === "file" && user?.role === "pm_team" && (
            <Card title="Step Q8: File Credit Memorandum" subtitle="Final publication to SharePoint and Everest">
              <p className="text-xs text-muted mb-3 leading-relaxed">
                A/C Manager and PM Team stages have passed. Filing commits the PDF to SharePoint and records final ratings to Everest.
              </p>
              <button
                className="btn btn-primary btn-sm w-full justify-center"
                onClick={() =>
                  confirm.ask(`File ${item.borrower} CMR v${item.version} to SharePoint and Everest?`, async () => {
                    await api(`/cmr/${item.cmr_id}/file`, { body: {} });
                    refresh();
                  })
                }
              >
                File CMR to Everest
              </button>
            </Card>
          )}

          {c && c.cmr.status === "filed" && !c.cmr.stage && user?.role === "pm_team" && (
            <Card title="Re-file Post SCT Session">
              <button
                className="btn btn-primary btn-sm w-full justify-center"
                onClick={() =>
                  act.run(async () => {
                    await api(`/cmr/${c.id}/file`, { body: {} });
                    refresh();
                  })
                }
              >
                Re-file as v{c.cmr.version + 1}
              </button>
            </Card>
          )}

          {review && (
            <Card title={`Checklist: ${fmt.label(review.stage)}`} ai subtitle="Mandatory stage review checks">
              {checklist.length ? (
                <div className="space-y-2 text-xs">
                  {checklist.map((f: any, i: number) => (
                    <div key={i} className="p-2.5 rounded border border-line bg-surface-2/40">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <StatusChip status={f.result === "pass" ? "passed" : f.result} />
                        <span className="font-bold text-ink">{fmt.label(f.item)}</span>
                      </div>
                      <div className="text-muted leading-relaxed">{f.reason}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted">No automated checklist defined for this stage.</div>
              )}
            </Card>
          )}

          {canAct && (
            <Card title="Record Review Decision" subtitle="Submit feedback or progress memorandum">
              <Field label="Target Section">
                <select
                  className="input text-xs"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                >
                  {c.sections.map((s: any) => (
                    <option key={s.code} value={s.code}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="mt-2.5">
                <Field label="Reviewer Comment">
                  <textarea
                    className="input h-20 text-xs"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Provide specific notes for the analyst..."
                  />
                </Field>
                <button
                  className="btn btn-secondary btn-sm mt-2 w-full justify-center"
                  disabled={!text}
                  onClick={() =>
                    act.run(async () => {
                      await api(`/reviews/${review.id}/comments`, { body: { section, text } });
                      setText("");
                      refresh();
                    })
                  }
                >
                  Add Comment
                </button>
              </div>

              <div className="mt-4 pt-3 border-t border-line space-y-2">
                <button
                  className="btn btn-primary btn-sm w-full justify-center"
                  onClick={() =>
                    confirm.ask(`Pass ${item.borrower} at the ${fmt.label(review.stage)} stage?`, async () => {
                      await api(`/reviews/${review.id}/decide`, { body: { outcome: "passed" } });
                      refresh();
                    })
                  }
                >
                  Pass Review Stage
                </button>

                <button
                  className="btn btn-secondary btn-sm w-full justify-center text-danger-600 hover:text-danger-700 hover:bg-danger-50"
                  onClick={() =>
                    confirm.ask(
                      `Return ${item.borrower} to the analyst with your comments (Loop QB)?`,
                      async () => {
                        await api(`/reviews/${review.id}/decide`, { body: { outcome: "sent_back" } });
                        refresh();
                      },
                      true
                    )
                  }
                >
                  Send Back (Loop QB)
                </button>

                {review.stage === "sct" && (
                  <button
                    className="btn btn-secondary btn-sm w-full justify-center"
                    onClick={() =>
                      confirm.ask(
                        `Defer ${item.borrower} to the follow-up SCT session?`,
                        async () => {
                          await api(`/reviews/${review.id}/decide`, { body: { outcome: "deferred" } });
                          refresh();
                        }
                      )
                    }
                  >
                    Defer to Follow-up
                  </button>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
