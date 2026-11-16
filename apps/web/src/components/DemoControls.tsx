import { Eraser, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, useApi } from "../api";
import { useApp } from "../context";
import { Modal } from "./ui";

/** Demo only: clear the cycle (start again from kickoff) and play what the outside world does next.
 * Every loan except Harbor Logistics fills in by itself as the clock moves (decision D23), so there is no autofill button. */
export default function DemoControls() {
  const { user, cycle, refreshCycles } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState<"" | "clear" | "event">("");
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ev = useApi<any>(cycle && cycle.status !== "draft" ? `/cycles/${cycle.id}/next-event` : null, [cycle?.id, cycle?.day, cycle?.status]);
  if (!user || !["pm_team", "admin"].includes(user.role)) return null;
  const next = ev.data?.event;

  const outside = async () => {
    if (!cycle) return;
    setBusy("event");
    setMsg(`${next?.label || "Outside world"}...`);
    try {
      const r = await api(`/cycles/${cycle.id}/next-event`, { body: {} });
      setMsg(r.log.join(" · "));
      await refreshCycles();
      await ev.reload();
    } catch (e: any) {
      setMsg(`Stopped: ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  const clear = async () => {
    setAsk(false);
    setBusy("clear");
    setMsg("Clearing the cycle and reloading Snowflake. This takes about a minute.");
    try {
      await api("/admin/synth/reset", { body: { until: "Q0" } });
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const s = await api("/admin/synth");
        if (!s.running) {
          if (s.error) throw new Error(s.error);
          break;
        }
      }
      localStorage.removeItem("tiq_cycle");
      await refreshCycles();
      setMsg("Cleared. Start the 2026-Q3 cycle from Kickoff.");
      nav("/work");
    } catch (e: any) {
      setMsg(`Could not clear: ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-panel border border-dashed border-brand-300 bg-brand-50 px-4 py-3 text-[13.5px]">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.03em] text-slate-500">Demo controls</span>
      <button className="btn-danger" disabled={!!busy} onClick={() => setAsk(true)}>
        {busy === "clear" ? <Loader2 size={16} className="animate-spin" /> : <Eraser size={14} />} Clear cycle
      </button>
      {next && (next.to_day ? <button className="btn-primary" disabled={!!busy} onClick={outside} title={next.detail}>
          {busy === "event" ? <Loader2 size={16} className="animate-spin" /> : <Send size={14} />} {next.label}
        </button> : <span className="badge bg-warn-100 text-warn-700" title={next.detail}>{next.label}</span>)}
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
      {ask && (
        <Modal title="Clear the cycle?" onClose={() => setAsk(false)} footer={<>
          <button className="btn-secondary" onClick={() => setAsk(false)}>Cancel</button>
          <button className="btn-danger" onClick={clear}>Clear everything</button></>}>
          This deletes the current cycle and everything in it (messages, emails, documents, spreads, CMRs, decisions, audit
          history) and reloads Snowflake clean. You then start again from Kickoff.
        </Modal>)}
    </div>
  );
}
