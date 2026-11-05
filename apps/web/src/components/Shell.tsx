import {
  Bell, BookOpenCheck, Briefcase, CalendarDays, CheckSquare, ClipboardList, Database, Gavel, GitBranch, Inbox, LayoutDashboard,
  ListChecks, LogOut, MessageSquareText, MessagesSquare, Repeat, Scale, Send, Settings, ShieldCheck, Table2,
} from "lucide-react";
import { ReactNode, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { api, fmt, ROLE_LABEL, useApi } from "../api";
import { useApp } from "../context";
import AskPanel from "./AskPanel";

type Item = { to: string; label: string; icon: any; roles: string[] };
const ALL = ["pm_team", "deal_analyst", "deal_lead", "ac_manager", "sct", "committee_member", "committee_chair", "governance", "finance_ir", "admin", "lincoln"];
const TOP: Item[] = [
  { to: "/work", label: "My Work", icon: ListChecks, roles: ALL },
  { to: "/messages", label: "Messages", icon: MessagesSquare, roles: ALL },
];
const PRIMARY: Item[] = [
  { to: "/dashboard", label: "Cycle Dashboard", icon: LayoutDashboard, roles: ["pm_team", "admin", "committee_chair"] },
  { to: "/universe", label: "Loan Universe", icon: Database, roles: ["pm_team", "admin"] },
  { to: "/kickoff", label: "Kickoff", icon: CalendarDays, roles: ["pm_team", "admin"] },
  { to: "/intake", label: "Intake", icon: Inbox, roles: ["pm_team", "deal_analyst", "deal_lead", "admin"] },
  { to: "/lincoln", label: "Lincoln Exchange", icon: Send, roles: ["pm_team", "lincoln", "admin"] },
  { to: "/loans", label: "Loans", icon: Briefcase, roles: ["pm_team", "deal_analyst", "deal_lead", "ac_manager", "sct", "committee_member", "committee_chair", "admin"] },
  { to: "/reviews", label: "Review Queue", icon: ClipboardList, roles: ["pm_team", "deal_analyst", "deal_lead", "ac_manager", "sct", "admin"] },
  { to: "/pricing", label: "Pricing Panel", icon: Scale, roles: ["deal_analyst", "deal_lead"] },
  { to: "/tracker", label: "Marks Tracker", icon: Table2, roles: ["pm_team", "committee_member", "committee_chair", "finance_ir", "admin"] },
  { to: "/committee", label: "Committee", icon: Gavel, roles: ["pm_team", "committee_member", "committee_chair", "admin"] },
  { to: "/reconciliation", label: "Reconciliation", icon: CheckSquare, roles: ["pm_team", "admin"] },
  { to: "/approvals", label: "Approvals", icon: ShieldCheck, roles: ["pm_team", "committee_chair", "governance", "admin"] },
  { to: "/distribution", label: "Distribution", icon: Send, roles: ["pm_team", "finance_ir", "admin"] },
  { to: "/monthly", label: "Monthly", icon: Repeat, roles: ["pm_team", "deal_analyst", "deal_lead", "committee_member", "committee_chair", "admin"] },
];
const SECONDARY: Item[] = [
  { to: "/ask", label: "Ask TIQ", icon: MessageSquareText, roles: ALL },
  { to: "/lineage", label: "Lineage", icon: GitBranch, roles: ALL.filter((r) => r !== "lincoln") },
  { to: "/inbox", label: "External mail", icon: BookOpenCheck, roles: ["pm_team", "deal_analyst", "deal_lead", "admin", "lincoln"] },
  { to: "/admin", label: "Admin", icon: Settings, roles: ["admin"] },
];

export function homeFor(_role: string) {
  return "/work";
}

const PHASES = [[1, 9, "Kickoff and intake"], [10, 26, "Modelling and CMR"], [27, 31, "Deal Team approval"], [32, 43, "Valuation Committee"], [44, 45, "Finalise"]] as const;

export default function Shell({ children }: { children: ReactNode }) {
  const { user, cycle, cycles, setCycleId, setUser, refreshCycles } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => { refreshCycles(); }, [loc.pathname]);
  const [ask, setAsk] = useState(false);
  const [bell, setBell] = useState(false);
  const notes = useApi<any[]>(user ? "/notifications" : null, [user?.email, cycle?.day]);
  if (!user) return null;
  const unread = (notes.data || []).filter((n) => !n.read).length;
  const phase = cycle ? PHASES.find(([a, b]) => cycle.day >= a && cycle.day <= b)?.[2] || (cycle.day === 0 ? "Not started" : "Closing") : "";
  const link = (i: Item) => (
    <NavLink key={i.to} to={i.to} className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition ${isActive ? "bg-gradient-to-r from-brand-600 to-sky-500 font-semibold text-white shadow" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
      <i.icon size={15} /> {i.label}
    </NavLink>
  );
  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <div className="flex h-full">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col bg-rail text-white">
        <div className="px-5 pb-3 pt-5">
          <div className="flex items-center gap-2"><div className="h-7 w-7 rounded-lg bg-gradient-to-br from-sky-500 to-leaf-400" /><div className="text-lg font-bold tracking-tight">TIQ Marks</div></div>
          <div className="mt-1 text-[11px] text-slate-300">AllianceBernstein Private Credit</div>
        </div>
        {cycle && (
          <div className="mx-3 mb-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <select className="w-full bg-transparent text-sm font-semibold text-white outline-none" value={cycle.id} onChange={(e) => setCycleId(e.target.value)}>
              {cycles.filter((c) => c.cycle_type === "quarterly").map((c) => <option key={c.id} value={c.id} className="text-slate-900">{c.period} quarterly</option>)}
            </select>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-leaf-400" style={{ width: `${(cycle.day / 45) * 100}%` }} /></div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-300">
              <span className="num">Day {cycle.day} of 45</span>
              <span className="rounded-full bg-lime-400 px-2 py-0.5 text-[10px] font-semibold text-navy-900">{cycle.status === "closed" ? "Closed" : cycle.status === "draft" ? "Kickoff pending" : phase}</span>
            </div>
          </div>
        )}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {TOP.filter((i) => i.roles.includes(user.role)).map(link)}
          <div className="my-2 border-t border-white/10" />
          {PRIMARY.filter((i) => i.roles.includes(user.role)).map(link)}
          <div className="my-2 border-t border-white/10" />
          {SECONDARY.filter((i) => i.roles.includes(user.role)).map(link)}
        </nav>
        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-sky-500 text-xs font-bold">{initials}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{user.name}</div>
            <div className="truncate text-[11px] text-slate-300">{ROLE_LABEL[user.role]}{user.deal_team_id ? `, Team ${user.deal_team_id.replace("DT-", "").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}` : ""}</div>
          </div>
          <button title="Sign out" onClick={() => { localStorage.removeItem("tiq_token"); setUser(null); nav("/login"); }}><LogOut size={15} className="text-slate-300" /></button>
        </div>
      </aside>
      <main className="ml-60 flex-1 overflow-x-hidden">
        <div className="sticky top-0 z-30 flex items-center justify-end gap-3 border-b border-canvas-200 bg-white/80 px-8 py-2 backdrop-blur">
          <div className="relative">
            <button title="Notifications" className="relative rounded-lg p-2 text-slate-500 hover:bg-canvas-100" onClick={() => { setBell(!bell); if (!bell && unread) api("/notifications/read", { body: {} }).then(() => setTimeout(notes.reload, 400)); }}>
              <Bell size={17} />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[9px] font-bold text-white">{unread}</span>}
            </button>
            {bell && (
              <div className="absolute right-0 mt-2 w-96 rounded-2xl border border-canvas-200 bg-white p-2 shadow-xl">
                <div className="px-2 py-1 text-xs font-semibold uppercase text-slate-500">Notifications</div>
                <div className="max-h-96 overflow-y-auto">
                  {(notes.data || []).length ? notes.data!.map((n) => (
                    <button key={n.id} onClick={() => { setBell(false); if (n.link) nav(n.link); }} className={`block w-full rounded-lg px-3 py-2 text-left hover:bg-brand-50 ${n.read ? "" : "bg-sky-50"}`}>
                      <div className="text-sm font-medium">{n.title}</div><div className="text-[11px] text-slate-400">{fmt.date(n.at)}</div>
                    </button>)) : <div className="px-3 py-4 text-sm text-slate-400">Nothing yet</div>}
                </div>
              </div>)}
          </div>
          <button className="btn-secondary" onClick={() => setAsk(!ask)}><MessageSquareText size={14} /> Ask TIQ</button>
        </div>
        <div className="mx-auto max-w-[1600px] px-8 py-6">{children}</div>
      </main>
      {ask && <AskPanel onClose={() => setAsk(false)} />}
    </div>
  );
}
