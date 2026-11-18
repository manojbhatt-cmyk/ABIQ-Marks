import { CalendarPlus, Clock, Download, MapPin, Send, Users, Video } from "lucide-react";
import { useState } from "react";
import { api, downloadFile, ROLE_LABEL } from "../api";
import { Card, Chip, Field, Modal, useAction } from "./ui";

type Meeting = {
  title: string; date: string; start: string; timezone: string; duration_minutes: number; mode: string; join_link?: string;
  location?: string; attendees: { email: string; role: string; why: string; name?: string }[];
  slots: { time: string; minutes: number; title: string; presenter?: string; reasons?: string[] }[]; note?: string;
  organiser?: string; ics?: string; version?: number; sent_at?: string;
};

const MODES: Record<string, string> = { online: "Online (Teams)", in_person: "In person", hybrid: "Hybrid" };

export function MeetingCard({ m, compact }: { m: Meeting; compact?: boolean }) {
  const when = new Date(`${m.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="card px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11.5px] font-medium text-brand-600">Committee meeting{m.version && m.version > 1 ? ` (updated v${m.version})` : ""}</div>
          <div className="mt-0.5 text-lg font-bold text-navy-900">{m.title}</div>
          <div className="mt-1 flex flex-wrap gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1"><Clock size={14} /> {when}, {m.start} ({m.timezone.split("/").pop()?.replace("_", " ")}), {m.duration_minutes} min</span>
            <span className="flex items-center gap-1">{m.mode === "online" ? <Video size={14} /> : <MapPin size={14} />} {MODES[m.mode]}{m.location ? `: ${m.location}` : ""}</span>
            <span className="flex items-center gap-1"><Users size={14} /> {m.attendees.length} attendees</span>
          </div>
        </div>
        <div className="flex gap-2">
          {m.join_link && m.mode !== "in_person" && <a className="btn-primary" href={m.join_link.split(" ")[0]} target="_blank" rel="noreferrer" title="Placeholder link until a Teams connector is configured"><Video size={14} /> Join</a>}
          {m.ics && <button className="btn-secondary" onClick={() => downloadFile(m.ics!, "committee-meeting.ics")}><Download size={14} /> Add to calendar</button>}
        </div>
      </div>
      {!compact && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <div className="label">Agenda</div>
            {m.slots.map((s, i) => <div key={i} className="flex gap-3 border-b border-line-200 py-1.5 text-[13.5px]"><span className="w-12 num font-semibold text-brand-700">{s.time}</span><span className="flex-1">{s.title}{s.reasons?.length ? <span className="ml-1 text-xs text-slate-400">({s.reasons.map((r) => r.replace(/_/g, " ")).join(", ")})</span> : null}</span><span className="text-xs text-slate-500">{s.minutes} min{s.presenter ? ` · ${s.presenter}` : ""}</span></div>)}
          </div>
          <div>
            <div className="label">Attendees</div>
            {m.attendees.map((a) => <div key={a.email} className="flex justify-between border-b border-line-200 py-1.5 text-[13.5px]"><span>{a.name || a.email}</span><span className="text-xs text-slate-500">{a.why}{a.role === "organiser" ? " · organiser" : ""}</span></div>)}
          </div>
        </div>
      )}
    </div>
  );
}

/** For the PM Team: ABIQ drafts the meeting; the organiser edits and sends the invitation inside ABIQ. */
export function OrganiseMeeting({ cycleId, existing, onDone }: { cycleId: string; existing?: Meeting | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [m, setM] = useState<Meeting | null>(null);
  const act = useAction();
  const start = () => act.run(async () => {
    const d: Meeting = await api(`/cycles/${cycleId}/meeting/draft`);
    setM(existing ? { ...d, date: existing.date, start: existing.start, mode: existing.mode, join_link: existing.join_link, location: existing.location, note: existing.note } : d);
    setOpen(true);
  });
  const send = () => act.run(async () => {
    await api(`/cycles/${cycleId}/meeting`, { body: m });
    setOpen(false);
    onDone();
  });
  return (
    <>
      {act.node}
      <button className={existing ? "btn-secondary" : "btn-primary"} onClick={start}><CalendarPlus size={14} /> {existing ? "Update or reschedule" : "Organise meeting"}</button>
      {open && m && (
        <Modal wide title={existing ? "Update the committee meeting" : "Organise the committee meeting"} onClose={() => setOpen(false)}
          footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={act.busy} onClick={send}><Send size={13} /> {existing ? "Send update in ABIQ" : "Send invitation in ABIQ"}</button></>}>
          <div className="ai-note mb-3 text-xs">ABIQ drafted this from the agenda: date from the calendar (Q18), a slot per agenda loan, and everyone who must attend. Change anything before sending.</div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Field label="Date"><input className="input" type="date" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} /></Field>
            <Field label="Start"><input className="input" type="time" value={m.start} onChange={(e) => setM({ ...m, start: e.target.value })} /></Field>
            <Field label="Minutes"><input className="input num" type="number" value={m.duration_minutes} onChange={(e) => setM({ ...m, duration_minutes: Number(e.target.value) })} /></Field>
            <Field label="Format"><select className="input" value={m.mode} onChange={(e) => setM({ ...m, mode: e.target.value })}>{Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {m.mode !== "in_person" && <Field label="Online link"><input className="input" value={m.join_link || ""} onChange={(e) => setM({ ...m, join_link: e.target.value })} /></Field>}
            {m.mode !== "online" && <Field label="Room or location"><input className="input" value={m.location || ""} onChange={(e) => setM({ ...m, location: e.target.value })} placeholder="e.g. 501 Commerce St, 12th floor, Board Room" /></Field>}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Agenda">{m.slots.map((s, i) => <div key={i} className="flex gap-3 border-b border-canvas-100 py-1 text-sm"><span className="w-12 num">{s.time}</span><span className="flex-1">{s.title}</span><span className="text-xs text-slate-500">{s.minutes} min</span></div>)}</Card>
            <Card title={`Attendees (${m.attendees.length})`}>{m.attendees.map((a) => <label key={a.email} className="flex items-center justify-between gap-2 border-b border-canvas-100 py-1 text-sm">
              <span className="flex items-center gap-2"><input type="checkbox" checked disabled={a.role !== "required" || a.why === "Valuation Committee"} onChange={() => setM({ ...m, attendees: m.attendees.filter((x) => x.email !== a.email) })} />{a.email}</span><Chip tone={a.why === "Valuation Committee" ? "violet" : a.role === "organiser" ? "neutral" : "blue"}>{a.why}</Chip></label>)}</Card>
          </div>
          <div className="mt-3"><Field label="Message to attendees"><textarea className="input h-16" value={m.note || ""} onChange={(e) => setM({ ...m, note: e.target.value })} /></Field></div>
          <div className="mt-2 text-[11px] text-slate-400">Sent as a ABIQ message with a calendar file (.ics) and the committee pack attached. {ROLE_LABEL.committee_chair} and members are required.</div>
        </Modal>
      )}
    </>
  );
}
