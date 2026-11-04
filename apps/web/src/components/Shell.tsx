import {
  BarChart3, Bell, BookOpenCheck, Briefcase, CalendarDays, CheckSquare, ClipboardList, FileSearch, GitBranch, Inbox,
  LayoutDashboard, LogOut, MessageSquareText, Repeat, Scale, Send, Settings, ShieldCheck, Table2, Users, Gavel, Database,
} from "lucide-react";
import { ReactNode, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ROLE_LABEL, useApi } from "../api";
import { useApp } from "../context";
import AskPanel from "./AskPanel";

type Item = { to: string; label: string; icon: any; roles: string[] };
const ALL = ["pm_team", "deal_analyst", "deal_lead", "ac_manager", "sct", "committee_member", "committee_chair", "governance", "finance_ir", "admin"];
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
  { to: "/lineage", label: "Lineage", icon: GitBranch, roles: ALL },
  { to: "/inbox", label: "Mailbox", icon: BookOpenCheck, roles: [...ALL, "lincoln"] },
  { to: "/admin", label: "Admin", icon: Settings, roles: ["admin"] },
];

export function homeFor(role: string) {
  return ({ deal_analyst: "/loans", deal_lead: "/loans", ac_manager: "/reviews", sct: "/reviews", lincoln: "/lincoln",
    committee_member: "/committee", committee_chair: "/committee", governance: "/approvals", finance_ir: "/distribution", admin: "/admin" } as any)[role] || "/dashboard";
}

const PHASES = [[1, 9, "Kickoff and intake"], [10, 26, "Modelling and CMR"], [27, 31, "Deal Team approval"], [32, 43, "Valuation Committee"], [44, 45, "Finalise"]] as const;

export default function Shell({ children }: { children: ReactNode }) {
  const { user, cycle, cycles, setCycleId, setUser } = useApp();
  const nav = useNavigate();
  const [ask, setAsk] = useState(false);
  const notes = useApi<any[]>(user ? "/notifications" : null, [user?.email]);
  if (!user) return null;
  const phase = cycle ? PHASES.find(([a, b]) => cycle.day >= a && cycle.day <= b)?.[2] || (cycle.day === 0 ? "Not started" : "Closing") : "";
  const link = (i: Item) => (
    <NavLink key={i.to} to={i.to} className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] ${isActive ? "bg-navy-700 text-white" : "text-slate-300 hover:bg-navy-800 hover:text-white"}`}>
      <i.icon size={15} /> {i.label}
    </NavLink>
  );
  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <div className="flex h-full">
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col bg-navy-900 text-white">
        <div className="px-5 pb-3 pt-5">
          <div className="text-lg font-bold tracking-tight">TIQ Marks</div>
          <div className="text-[11px] text-slate-400">AllianceBernstein Private Credit</div>
        </div>
        {cycle && (
          <div className="mx-3 mb-3 rounded-lg bg-navy-800 p-3">
            <select className="w-full bg-transparent text-sm font-semibold text-white outline-none" value={cycle.id} onChange={(e) => setCycleId(e.target.value)}>
              {cycles.filter((c) => c.cycle_type === "quarterly").map((c) => <option key={c.id} value={c.id} className="text-slate-900">{c.period} quarterly</option>)}
            </select>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-300">
              <span className="num">Day {cycle.day} of 45</span>
              <span className="rounded-full bg-brand-600/30 px-2 py-0.5 text-[10px] text-brand-100">{cycle.status === "closed" ? "Closed" : phase}</span>
            </div>
          </div>
        )}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {PRIMARY.filter((i) => i.roles.includes(user.role)).map(link)}
          <div className="my-3 border-t border-navy-700" />
          {SECONDARY.filter((i) => i.roles.includes(user.role)).map(link)}
        </nav>
        <div className="flex items-center gap-3 border-t border-navy-700 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold">{initials}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{user.name}</div>
            <div className="truncate text-[11px] text-slate-400">{ROLE_LABEL[user.role]}{user.deal_team_id ? `, ${user.deal_team_id.replace("DT-", "Team ").replace(/(\w)(\w*)$/, (_, a, b) => a + b.toLowerCase())}` : ""}</div>
          </div>
          <button title="Sign out" onClick={() => { localStorage.removeItem("tiq_token"); setUser(null); nav("/login"); }}><LogOut size={15} className="text-slate-400" /></button>
        </div>
      </aside>
      <main className="ml-60 flex-1 overflow-x-hidden">
        <div className="sticky top-0 z-30 flex items-center justify-end gap-3 border-b border-canvas-200 bg-canvas-100/90 px-8 py-2 backdrop-blur">
          <span title="Notifications" className="relative text-slate-500"><Bell size={16} />{(notes.data || []).filter((n) => !n.read).length > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-danger-600" />}</span>
          <button className="btn-secondary" onClick={() => setAsk(!ask)}><MessageSquareText size={14} /> Ask TIQ</button>
        </div>
        <div className="mx-auto max-w-[1600px] px-8 py-6">{children}</div>
      </main>
      {ask && <AskPanel onClose={() => setAsk(false)} />}
      <span className="hidden"><BarChart3 /><FileSearch /><Users /></span>
    </div>
  );
}
