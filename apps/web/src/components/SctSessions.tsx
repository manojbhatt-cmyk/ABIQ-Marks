import { useState } from "react";
import { api, openFile, useApi } from "../api";
import { Card, Chip, useAction } from "./ui";

/** SCT session planner (M6.2): sessions from the client's CMR Delivery Deadlines, slots from the Timing sheet. */
export default function SctSessions({ cycleId, canBuild }: { cycleId: string; canBuild: boolean }) {
  const { data } = useApi<any[]>(`/cycles/${cycleId}/sct`, [cycleId]);
  const [open, setOpen] = useState<string | null>(null);
  const act = useAction();
  if (!data?.length) return null;
  return (
    <Card title="SCT review sessions" className="mb-6" actions={<span className="text-xs text-slate-400">12 min per deal, 20 on watchlist; DIS 20 and 30</span>}>
      {act.node}
      <table className="w-full"><thead><tr>{["Date", "Session", "Reviewer", "Review time", "Deadline", "Delivery to SCT", "CMRs ready", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
        <tbody>{data.map((s) => (
          <>
            <tr key={s.id} className="cursor-pointer hover:bg-canvas-50" onClick={() => setOpen(open === s.id ? null : s.id)}>
              <td className="td num">{s.date}</td><td className="td font-medium">{s.session}</td><td className="td">{s.reviewer}</td><td className="td">{s.requested_review_time}</td>
              <td className="td text-xs">{s.deadline}</td><td className="td text-xs">{s.delivery_to_sct}</td>
              <td className="td">{s.total ? <Chip tone={s.ready === s.total ? "green" : "amber"}>{s.ready} of {s.total}</Chip> : <span className="text-xs text-slate-400">follow-up</span>}</td>
              <td className="td">{canBuild && s.total > 0 && <button className="btn-secondary" onClick={(e) => { e.stopPropagation(); act.run(async () => { const r = await api(`/cycles/${cycleId}/sct/${s.id}/pack`, { body: {} }); openFile(`/api/files/sharepoint/${r.path}`); }); }}>Build session pack</button>}</td>
            </tr>
            {open === s.id && <tr key={s.id + "x"}><td colSpan={8} className="bg-canvas-50 px-6 py-2">{s.slots.map((x: any, i: number) => <div key={i} className="flex gap-4 text-xs"><span className="w-12 num">{x.time}</span><span className="w-56">{x.borrower}</span><span className="w-16">{x.minutes} min</span>{x.watchlist && <Chip tone="amber">WL</Chip>}<span className="text-slate-400">{x.cmr_version ? `CMR v${x.cmr_version} ${x.cmr_status}` : ""}</span></div>)}</td></tr>}
          </>))}</tbody></table>
    </Card>
  );
}
