import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, fmt, openFile, useApi } from "../api";
import { AskBody } from "../components/AskPanel";
import { AiCard, AssumedChip, Banner, Card, Chip, Empty, ErrorState, Field, Loading, PageHeader, StatusChip, Tabs, useAction, useConfirm } from "../components/ui";
import { MeetingCard, OrganiseMeeting } from "../components/MeetingPanel";
import { useApp } from "../context";

export default function Committee() {
  const { tab = "agenda" } = useParams();
  const { cycle, user } = useApp();
  const nav = useNavigate();
  const { data, error, loading, reload } = useApi<any>(cycle ? `/cycles/${cycle.id}/committee` : null, [cycle?.id]);
  if (!cycle) return <Empty text="No cycle yet" />;
  if (!data && !error) return <Loading />;
  if (error) return <ErrorState error={error} retry={reload} />;
  return (
    <>
      <PageHeader title={tab === "meeting" ? "Committee Meeting" : "Committee Agenda and Pack"} ai subtitle={tab === "meeting" ? "Q18: record decisions and rationale (G2 decision)" : "Q16 agenda tests, Q17 pack"} />
      <Tabs active={tab} onChange={(x) => nav(`/committee/${x}`)} tabs={[{ id: "agenda", label: "Agenda and pack (S12)" }, { id: "meeting", label: "Meeting (S13)" }]} />
      {tab === "agenda" ? <Agenda data={data} reload={reload} pm={user?.role === "pm_team"} cycleId={cycle.id} /> : <Meeting data={data} reload={reload} canDecide={["committee_member", "committee_chair"].includes(user!.role)} />}
    </>
  );
}

function Agenda({ data, reload, pm, cycleId }: any) {
  const act = useAction();
  const confirm = useConfirm();
  const pack = data.packs[data.packs.length - 1];
  const [cover, setCover] = useState<string | null>(null);
  return (
    <>
      {act.node}{confirm.node}
      <Card title="Agenda tests" className="mb-6" actions={pm && <><button className="btn-secondary" onClick={() => act.run(async () => { await api(`/cycles/${cycleId}/agenda/tests`, { body: {} }); reload(); })}>Run tests</button><button className="btn-primary" onClick={() => act.run(async () => { await api(`/cycles/${cycleId}/agenda`, { body: {} }); reload(); })}>Build agenda</button></>}>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">{data.tests.map((t: any) => <span key={t.code} className="flex items-center gap-1 rounded-lg bg-canvas-100 px-2 py-1">{t.label}{t.code === "mark_move_10pct" && ` (${(data.threshold.value * 100).toFixed(0)} percent)`}{t.tiq_addition ? <AssumedChip dq="TIQ addition" /> : <AssumedChip dq="DQ17" />}</span>)}</div>
        <table className="w-full"><thead><tr><th className="th">Loan</th><th className="th">Team</th>{data.tests.map((t: any) => <th key={t.code} className="th text-center">{t.label}</th>)}<th className="th">Move</th><th className="th">Agenda</th>{pm && <th className="th" />}</tr></thead>
          <tbody>{data.grid.map((g: any) => (
            <tr key={g.cycle_loan_id} className={g.on_agenda ? "bg-info-100/40" : ""}><td className="td font-medium">{g.borrower}</td><td className="td text-xs">{g.team}</td>
              {data.tests.map((t: any) => <td key={t.code} className="td text-center">{g.tests[t.code] ? <span className="font-bold text-info-700">&#10003;</span> : <span className="text-slate-300">-</span>}</td>)}
              <td className="tdn text-xs">{g.inputs.move !== undefined && g.inputs.move !== null ? fmt.pct(g.inputs.move, 2) : ""}</td>
              <td className="td">{g.on_agenda ? <Chip tone="blue">On agenda</Chip> : ""}</td>
              {pm && <td className="td">{!g.on_agenda && <button className="text-xs text-brand-700" onClick={() => act.run(async () => { const reason = prompt(`Reason to add ${g.borrower} by hand`); if (reason) { await api(`/cycles/${cycleId}/agenda/add`, { body: { cycle_loan_id: g.cycle_loan_id, reason } }); reload(); } })}>add</button>}</td>}
            </tr>))}</tbody></table>
      </Card>
      {data.agenda && (
        <div className="mb-6">
          {data.meeting ? <div className="space-y-2"><MeetingCard m={data.meeting} />{pm && <OrganiseMeeting cycleId={cycleId} existing={data.meeting} onDone={reload} />}</div>
            : <Card title="Committee meeting" actions={pm && <OrganiseMeeting cycleId={cycleId} onDone={reload} />}>
              <div className="text-sm text-slate-500">Not organised yet. {pm ? "TIQ drafts the date, time, agenda slots and attendees from this agenda; you check and send the invitation in TIQ." : "The PM Team organises it once the agenda is built."}</div>
            </Card>}
        </div>)}
      {data.agenda && (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-8 space-y-4">
            {pack?.stale && <Banner>A source changed after this pack was built. Rebuild before sending.</Banner>}
            <Card title={`Pack builder${pack ? ` (v${pack.version}${pack.sent ? ", sent" : ""})` : ""}`} actions={pm && <>
              <button className="btn-secondary" onClick={() => act.run(async () => { await api(`/cycles/${cycleId}/pack`, { body: cover ? { cover_note: cover } : {} }); reload(); })}>Build pack</button>
              {pack && <button className="btn-secondary" onClick={() => openFile(`/api/files/sharepoint/${pack.pdf_path}`)}>Preview PDF</button>}
              {pack && !pack.sent && <button className="btn-primary" disabled={pack.stale} onClick={() => confirm.ask(`Send pack v${pack.version} to ${data.members.map((m: any) => m.name).join(", ")}?`, async () => { await api(`/packs/${pack.id}/send`, { body: {} }); reload(); })}>Send to committee</button>}</>}>
              <Field label="Cover note"><textarea className="input h-20" value={cover ?? pack?.cover_note ?? ""} onChange={(e) => setCover(e.target.value)} /></Field>
              <div className="mt-4 space-y-3">{(pack?.summaries || []).map((s: any) => (
                <AiCard key={s.id} title="One-pager (A6)" confidence={0.85}><div className="whitespace-pre-wrap text-sm">{s.body.replace(/\*\*/g, "")}</div>
                  <div className="mt-2 text-xs"><b>Questions:</b> {s.questions.join(" ")}</div></AiCard>))}</div>
            </Card>
          </div>
          <Card title={`Agenda v${data.agenda.version}, meeting ${data.agenda.meeting_date}`} className="col-span-4">
            {data.items.map((i: any) => <div key={i.id} className={`mb-2 rounded-lg border border-canvas-200 p-2 text-sm ${i.removed ? "opacity-40" : ""}`}><div className="flex justify-between font-medium"><span>{i.borrower}</span><StatusChip status={i.status} /></div>
              <div className="text-xs text-slate-500">{i.reasons.map(fmt.label).join(", ")}{i.manual_reason ? `: ${i.manual_reason}` : ""}</div>
              {pm && !i.removed && i.status === "pending" && <button className="text-xs text-danger-700" onClick={() => act.run(async () => { const reason = prompt("Reason to remove"); if (reason) { await api(`/agenda-items/${i.id}/remove`, { body: { reason } }); reload(); } })}>remove</button>}</div>)}
          </Card>
        </div>)}
    </>
  );
}

const OUTCOME_LABEL: Record<string, string> = { approve: "Approve the proposed mark", change: "Change the mark",
  send_back: "Send back", defer: "Defer to a later meeting", request_information: "Request more information" };

function Meeting({ data, reload, canDecide }: any) {
  const items = (data.items || []).filter((i: any) => !i.removed);
  const [sel, setSel] = useState<string | null>(null);
  const item = items.find((i: any) => i.id === sel) || items.find((i: any) => i.status === "pending") || items[0];
  const pack = data.packs[data.packs.length - 1];
  const summary = pack?.summaries.find((s: any) => s.cycle_loan_id === item?.cycle_loan_id);
  const tr = useApi<any>(item ? `/loans/${item.cycle_loan_id}/pricing` : null, [item?.id]);
  const act = useAction();
  const confirm = useConfirm();
  const [f, setF] = useState<any>({ outcome: "", members_present: data.members.map((m: any) => m.email) });
  if (!items.length) return <Empty text="No agenda yet" />;
  const v = tr.data?.versions?.[tr.data.versions.length - 1];
  const proposed = tr.data?.decisions?.filter((d: any) => d.outcome !== "sent_back").pop()?.mark ?? v?.point;
  const needR = data.rationale_required_for.includes(f.outcome);
  const words = f.outcome === "approve" ? `Record APPROVE for ${item.borrower} at the proposed ${proposed?.toFixed(2)}.`
    : f.outcome === "change" ? `Record a CHANGE of ${item.borrower}'s mark from ${proposed?.toFixed(2)} to ${Number(f.decided_mark).toFixed(2)}.`
      : `Record ${fmt.label(f.outcome).toUpperCase()} for ${item.borrower}.`;
  return (
    <>
    {data.meeting ? <div className="mb-4"><MeetingCard m={data.meeting} compact /></div>
      : <div className="mb-4 rounded-xl border border-dashed border-warn-300 bg-warn-100 px-4 py-2 text-sm text-warn-700">The meeting has not been organised yet. The PM Team organises it from the Agenda tab.</div>}
    <div className="grid grid-cols-12 gap-6">
      {act.node}{confirm.node}
      <div className="card col-span-2 p-2">{items.map((i: any) => <button key={i.id} onClick={() => { setSel(i.id); setF({ outcome: "", members_present: f.members_present }); }} className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${item.id === i.id ? "bg-brand-50" : "hover:bg-canvas-100"}`}><div className="font-medium">{i.borrower}</div><StatusChip status={i.status} /></button>)}</div>
      <div className="col-span-6 space-y-4">
        <Card title={item.borrower} actions={<button className="btn-ghost" onClick={() => window.location.assign(`/loans/${item.cycle_loan_id}/cmr`)}>Open CMR</button>}>
          {summary ? <div className="whitespace-pre-wrap text-sm">{summary.body.replace(/\*\*/g, "")}</div> : <div className="text-sm text-slate-400">Pack not built</div>}
          {summary && <div className="mt-3 rounded-lg bg-brand-50 p-3 text-sm"><b>Questions the pack raises:</b><ul className="ml-4 list-disc">{summary.questions.map((q: string) => <li key={q}>{q}</li>)}</ul></div>}
          {item.decision && <div className="mt-3 rounded-lg bg-success-100 px-3 py-2 text-sm text-success-700">Decided: {item.decision.outcome} {fmt.mark(item.decision.decided_mark)}{item.decision.rationale ? `: ${item.decision.rationale}` : ""} ({item.decision.recorded_by}){v && item.decision.decided_mark ? `. Decided ${item.decision.decided_mark.toFixed(2)}, ${item.decision.decided_mark >= v.low && item.decision.decided_mark <= v.high ? "inside" : "outside"} Lincoln range ${v.low.toFixed(2)} to ${v.high.toFixed(2)}` : ""}</div>}
        </Card>
        <Card title="Ask TIQ" ai><div className="h-80"><AskBody /></div></Card>
      </div>
      <div className="col-span-4">
        <Card title="Gate G2 decision" actions={<AssumedChip dq="DQ18" what="committee outcome set" />}>
          {item.status !== "pending" || !canDecide ? <div className="text-sm text-slate-500">{item.status !== "pending" ? "Decision recorded." : "Only committee members record decisions."}</div> : (
            <div className="space-y-3 text-sm">
              <div className="text-xs text-slate-500">Proposed mark {fmt.mark(proposed)}; Lincoln {v ? `${v.low.toFixed(2)} to ${v.high.toFixed(2)}` : "-"}</div>
              {data.outcomes.map((o: string) => <label key={o} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${f.outcome === o ? "bg-brand-50 font-semibold text-brand-700" : ""}`}><input type="radio" checked={f.outcome === o} onChange={() => setF({ ...f, outcome: o, decided_mark: o === "approve" ? proposed : o === "change" ? "" : f.decided_mark })} />{OUTCOME_LABEL[o] || fmt.label(o)}</label>)}
              {f.outcome === "approve" && <div className="rounded-lg bg-leaf-50 px-3 py-2 text-xs text-leaf-700">The mark stays at <b className="num">{fmt.mark(proposed)}</b>.</div>}
              {f.outcome === "change" && (() => {
                const nm = Number(f.decided_mark);
                const ok = f.decided_mark !== "" && !Number.isNaN(nm);
                const funded = tr.data?.loan?.funded || 0;
                const impact = ok && proposed != null ? funded * (nm - proposed) / 100 : null;
                const inside = ok && v ? nm >= v.low && nm <= v.high : null;
                return (
                  <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
                    <div className="flex items-end gap-3">
                      <div><div className="label">Proposed</div><div className="num text-lg font-bold text-slate-500 line-through decoration-1">{fmt.mark(proposed)}</div></div>
                      <span className="pb-2 text-slate-400">→</span>
                      <div className="flex-1"><Field label="New mark"><input autoFocus className="input num text-lg font-bold" placeholder="e.g. 88.5" value={f.decided_mark ?? ""} onChange={(e) => setF({ ...f, decided_mark: e.target.value })} /></Field></div>
                    </div>
                    {ok && <div className="space-y-0.5 text-xs">
                      <div>Value impact on {fmt.num(funded)}M funded: <b className={`num ${impact! < 0 ? "text-danger-700" : "text-leaf-700"}`}>{fmt.delta(impact)}</b></div>
                      {v && <div>{inside ? <Chip tone="green">inside Lincoln range {v.low.toFixed(2)} to {v.high.toFixed(2)}</Chip> : <Chip tone="amber">outside Lincoln range {v.low.toFixed(2)} to {v.high.toFixed(2)}</Chip>}</div>}
                      <div className="text-slate-500">The tracker, the CMR mark block and the final schedule use the new mark; reconciliation checks Everest against it.</div>
                    </div>}
                  </div>);
              })()}
              {f.outcome === "send_back" && <Field label="Send back to"><select className="input" value={f.send_back_to || "deal_team"} onChange={(e) => setF({ ...f, send_back_to: e.target.value })}><option value="deal_team">Deal Team</option><option value="lincoln">Lincoln</option></select></Field>}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Rating"><input className="input num" value={f.rating ?? ""} onChange={(e) => setF({ ...f, rating: e.target.value ? Number(e.target.value) : null })} /></Field>
                <Field label="Watchlist"><select className="input" value={f.watchlist_action ?? ""} onChange={(e) => setF({ ...f, watchlist_action: e.target.value })}>{["", "add", "keep", "remove", "none"].map((x) => <option key={x} value={x}>{x || "-"}</option>)}</select></Field>
              </div>
              <Field label="Waiver decision"><select className="input" value={f.waiver_decision ?? ""} onChange={(e) => setF({ ...f, waiver_decision: e.target.value })}>{["", "approved_with_conditions", "approved", "rejected", "not_applicable"].map((x) => <option key={x} value={x}>{fmt.label(x) || "-"}</option>)}</select></Field>
              {f.waiver_decision?.startsWith("approved") && <Field label="Conditions"><input className="input" value={f.conditions ?? ""} onChange={(e) => setF({ ...f, conditions: e.target.value })} /></Field>}
              <Field label={`Rationale${needR ? " (mandatory)" : ""}`}><textarea className="input h-20" value={f.rationale ?? ""} onChange={(e) => setF({ ...f, rationale: e.target.value })} /></Field>
              <Field label="Members present"><div className="space-y-1">{data.members.map((m: any) => <label key={m.email} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.members_present.includes(m.email)} onChange={() => setF({ ...f, members_present: f.members_present.includes(m.email) ? f.members_present.filter((x: string) => x !== m.email) : [...f.members_present, m.email] })} />{m.name}</label>)}</div></Field>
              <button className="btn-primary w-full justify-center" disabled={!f.outcome || (needR && !f.rationale)} onClick={() => confirm.ask(words, async () => { await api(`/agenda-items/${item.id}/decision`, { body: { ...f, decided_mark: f.decided_mark ? Number(f.decided_mark) : null } }); reload(); })}>Record decision</button>
              {needR && !f.rationale && <div className="text-xs text-danger-700">A rationale is required for {fmt.label(f.outcome)}.</div>}
            </div>)}
        </Card>
      </div>
    </div>
    </>
  );
}
