import { Eraser, Loader2, Send, Wand2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, useApi } from "../api";
import { useApp } from "../context";
import { Modal } from "./ui";

/** Demo only: clear the cycle (start again from kickoff) and autofill every loan except Harbor Logistics. */
export default function DemoControls() {
  const { user, cycle, refreshCycles } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState<"" | "clear" | "autofill" | "event">("");
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const auto = useApi<any>(cycle ? `/cycles/${cycle.id}/autopilot` : null, [cycle?.id]);
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
  const autoOn = !!auto.data?.except;

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

  const autofill = async () => {
    if (!cycle) return;
    setBusy("autofill");
    setMsg("Autofilling every loan except Harbor Logistics...");
    try {
      const r = await api(`/cycles/${cycle.id}/autopilot`, { body: { except: ["F-0002"] } });
      setMsg(r.log.join(" · "));
      await auto.reload();
      await refreshCycles();
    } catch (e: any) {
      setMsg(`Autofill stopped: ${e.message}`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-sky-500/50 bg-sky-50 px-4 py-3 text-sm">
      <span className="font-semibold text-sky-700">Demo controls</span>
      <button className="btn-danger" disabled={!!busy} onClick={() => setAsk(true)}>
        {busy === "clear" ? <Loader2 size={14} className="animate-spin" /> : <Eraser size={14} />} Clear cycle
      </button>
      <button className="btn-primary" disabled={!!busy || !cycle || cycle.status === "draft"} onClick={autofill}
        title={cycle?.status === "draft" ? "Send the kickoff first" : "Complete the routine steps for every loan except Harbor Logistics"}>
        {busy === "autofill" ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Autofill other loans
      </button>
      {next && (next.to_day ? <button className="btn-accent" disabled={!!busy} onClick={outside} title={next.detail}>
          {busy === "event" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {next.label}
        </button> : <span className="rounded-full bg-warn-100 px-2 py-0.5 text-xs text-warn-700" title={next.detail}>{next.label}</span>)}
      {autoOn && <span className="rounded-full bg-leaf-50 px-2 py-0.5 text-xs font-semibold text-leaf-700">Autofill on: other loans keep up whenever something arrives</span>}
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
