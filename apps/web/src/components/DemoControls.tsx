import { Eraser, Loader2, Send, SlidersHorizontal, Sparkles } from "lucide-react";
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
  const next = cycle && cycle.status !== "draft" ? ev.data?.event : null;

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
        const s = await api("/admin/synth").catch(() => ({ running: true }));
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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-2/70 px-4 py-2.5 text-[13px] shadow-sm">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted border border-line shadow-sm">
          <SlidersHorizontal size={13} className="text-brand-600" /> Demo Sandbox
        </span>
        <button 
          className="btn btn-secondary btn-sm !min-h-[28px] !text-[12px] font-medium" 
          disabled={!!busy} 
          onClick={() => setAsk(true)}
        >
          {busy === "clear" ? <Loader2 size={13} className="animate-spin" /> : <Eraser size={13} />} Clear cycle
        </button>
        {next && (next.to_day ? (
          <button 
            className="btn btn-primary btn-sm !min-h-[28px] !text-[12px] font-medium" 
            disabled={!!busy} 
            onClick={outside} 
            title={next.detail}
          >
            {busy === "event" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {next.label}
          </button>
        ) : (
          <span className="badge badge-amber !text-[11.5px]" title={next.detail}>{next.label}</span>
        ))}
      </div>
      {msg && (
        <span className="text-xs font-medium text-muted bg-surface px-2.5 py-1 rounded border border-line max-w-[500px] truncate" title={msg}>
          {msg}
        </span>
      )}
      {ask && (
        <Modal 
          title="Clear the cycle?" 
          onClose={() => setAsk(false)} 
          footer={
            <>
              <button className="btn-secondary" onClick={() => setAsk(false)}>Cancel</button>
              <button className="btn-danger" onClick={clear}>Clear everything</button>
            </>
          }
        >
          <p className="text-[13.5px] leading-relaxed text-muted">
            This deletes the current cycle and everything in it (messages, emails, documents, spreads, CMRs, decisions, audit history) and reloads Snowflake clean. You then start again from Kickoff.
          </p>
        </Modal>
      )}
    </div>
  );
}
