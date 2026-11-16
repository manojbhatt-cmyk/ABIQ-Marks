import {
  Bell, BookOpenCheck, Briefcase, CalendarDays, CheckSquare, ClipboardList, Database, Gavel, GitBranch, HelpCircle, Inbox,
  LayoutDashboard, ListChecks, LogOut, MessageSquareText, MessagesSquare, Repeat, Scale, Search, Send, Settings, ShieldCheck, Table2,
} from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { api, fmt, ROLE_LABEL, useApi } from "../api";
import { useApp } from "../context";
import AskLauncher from "./AskPanel";
import HelpPanel from "./HelpPanel";
import Logo from "./Logo";

type Item = { to: string; label: string; icon: any; roles: string[] };
const ALL = ["pm_team", "deal_analyst", "deal_lead", "ac_manager", "sct", "committee_member", "committee_chair", "governance", "finance_ir", "admin", "lincoln"];
const GROUPS: [string, Item[]][] = [
  ["Workspace", [
    { to: "/work", label: "My Work", icon: ListChecks, roles: ALL },
    { to: "/messages", label: "Messages", icon: MessagesSquare, roles: ALL },
    { to: "/dashboard", label: "Cycle dashboard", icon: LayoutDashboard, roles: ["pm_team", "admin", "committee_chair"] },
  ]],
  ["Quarterly process", [
    { to: "/universe", label: "Loan universe", icon: Database, roles: ["pm_team", "admin"] },
    { to: "/kickoff", label: "Kickoff", icon: CalendarDays, roles: ["pm_team", "admin"] },
    { to: "/intake", label: "Intake", icon: Inbox, roles: ["pm_team", "deal_analyst", "deal_lead", "admin"] },
    { to: "/lincoln", label: "Lincoln exchange", icon: Send, roles: ["pm_team", "lincoln", "admin"] },
    { to: "/loans", label: "Loans", icon: Briefcase, roles: ["pm_team", "deal_analyst", "deal_lead", "ac_manager", "sct", "committee_member", "committee_chair", "admin"] },
    { to: "/reviews", label: "Review queue", icon: ClipboardList, roles: ["pm_team", "deal_analyst", "deal_lead", "ac_manager", "sct", "admin"] },
    { to: "/pricing", label: "Pricing panel", icon: Scale, roles: ["deal_analyst", "deal_lead"] },
    { to: "/tracker", label: "Marks tracker", icon: Table2, roles: ["pm_team", "committee_member", "committee_chair", "finance_ir", "admin"] },
    { to: "/committee", label: "Committee", icon: Gavel, roles: ["pm_team", "committee_member", "committee_chair", "admin"] },
    { to: "/reconciliation", label: "Reconciliation", icon: CheckSquare, roles: ["pm_team", "admin"] },
    { to: "/approvals", label: "Approvals", icon: ShieldCheck, roles: ["pm_team", "committee_chair", "governance", "admin"] },
    { to: "/distribution", label: "Distribution", icon: Send, roles: ["pm_team", "finance_ir", "admin"] },
    { to: "/monthly", label: "Monthly", icon: Repeat, roles: ["pm_team", "deal_analyst", "deal_lead", "committee_member", "committee_chair", "admin"] },
  ]],
  ["Platform", [
    { to: "/lineage", label: "Lineage", icon: GitBranch, roles: ALL.filter((r) => r !== "lincoln") },
    { to: "/inbox", label: "External mail", icon: BookOpenCheck, roles: ["pm_team", "deal_analyst", "deal_lead", "admin", "lincoln"] },
    { to: "/admin", label: "Admin", icon: Settings, roles: ["admin"] },
  ]],
];

export function homeFor(_role: string) {
  return "/work";
}

const STAGES: [number, number, string][] = [[1, 3, "Kickoff and intake"], [4, 9, "Modelling and CMR"], [10, 13, "Lincoln draft marks"], [14, 15, "Deal Team approval"], [16, 18, "Valuation Committee"], [19, 22, "Finalise and distribute"]];

export default function Shell({ children }: { children: ReactNode }) {
  const { user, cycle, cycles, setCycleId, setUser, refreshCycles } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => { refreshCycles(); }, [loc.pathname]);
  const [help, setHelp] = useState(false);
  const [bell, setBell] = useState(false);
  const notes = useApi<any[]>(user ? "/notifications" : null, [user?.email, cycle?.day]);
  if (!user) return null;
  const unread = (notes.data || []).filter((n) => !n.read).length;
  const crumbItem = GROUPS.flatMap(([g, items]) => items.map((i) => [g, i] as const)).find(([, i]) => loc.pathname.startsWith(i.to));
  const crumb = crumbItem ? `${crumbItem[0]} / ${crumbItem[1].label}` : "";
  const st = cycle?.stage_step ?? 1;
  const phase = cycle ? (cycle.status === "closed" ? "Closed" : cycle.status === "draft" ? "Kickoff pending" : STAGES.find(([a, b]) => st >= a && st <= b)?.[2] || "Finalise and distribute") : "";
  const initials = user.name.split(/[ -]/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("");
  const team = user.deal_team_id ? `, Team ${user.deal_team_id.replace("DT-", "").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}` : "";
  return (
    <div className="flex min-h-full">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[248px] flex-col border-r border-line-200 bg-white">
        <div className="flex h-[60px] shrink-0 items-center border-b border-line-200 px-5"><Logo /></div>
        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Main">
          {GROUPS.map(([label, items]) => {
            const mine = items.filter((i) => i.roles.includes(user.role));
            if (!mine.length) return null;
            return (
              <div key={label} className="mb-3">
                <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">{label}</div>
                <div className="space-y-0.5">
                  {mine.map((i) => (
                    <NavLink key={i.to} to={i.to} className={({ isActive }) => `group flex h-[38px] items-center gap-[11px] rounded-tile px-3 text-sm transition-colors duration-150 ${isActive ? "bg-brand-100 font-semibold text-brand-700" : "font-medium text-slate-500 hover:bg-canvas-100 hover:text-ink-900"}`}>
                      {({ isActive }) => <><i.icon size={18} aria-hidden="true" className={isActive ? "text-brand-600" : ""} /> {i.label}</>}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 border-t border-line-200 px-4 py-3">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-brand-100 text-[12.5px] font-bold text-brand-700">{initials}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-ink-900">{user.name}</div>
            <div className="truncate text-xs text-slate-500">{ROLE_LABEL[user.role]}{team}</div>
          </div>
          <button className="icon-btn" title="Sign out" aria-label="Sign out" onClick={() => { localStorage.removeItem("tiq_token"); setUser(null); nav("/login"); }}><LogOut size={18} /></button>
        </div>
      </aside>

      <main className="ml-[248px] min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-[60px] items-center gap-4 border-b border-line-200 bg-white px-8">
          <div className="min-w-0 truncate text-[13px] font-medium text-muted">{crumb}</div>
          <div className="ml-auto flex items-center gap-2">
            {cycle && (
              <>
                <select aria-label="Cycle" className="h-8 rounded-control border border-line-200 bg-white px-2 text-[13px] font-semibold text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-[3px] focus:ring-brand-100" value={cycle.id} onChange={(e) => setCycleId(e.target.value)}>
                  {cycles.filter((c) => c.cycle_type === "quarterly").map((c) => <option key={c.id} value={c.id}>{c.period} quarterly</option>)}
                </select>
                <span title={`Where the ${cycle.period} cycle stands`} className="badge bg-brand-100 text-brand-700">
                  <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/70"><span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.max(4, (cycle.status === "closed" ? 1 : cycle.progress ?? 0) * 100)}%` }} /></span>
                  {phase}
                </span>
              </>
            )}
            <div className="relative">
              <button className="icon-btn relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => { setBell(!bell); if (!bell && unread) api("/notifications/read", { body: {} }).then(() => setTimeout(notes.reload, 400)); }}>
                <Bell size={19} />{unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold text-white">{unread}</span>}
              </button>
              {bell && (
                <div className="anim-modal absolute right-0 mt-2 w-96 rounded-card border border-line-200 bg-white p-2 shadow-raised">
                  <div className="px-2 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.03em] text-slate-500">Notifications</div>
                  <div className="max-h-96 overflow-y-auto">
                    {(notes.data || []).length ? notes.data!.map((n) => (
                      <button key={n.id} onClick={() => { setBell(false); if (n.link) nav(n.link); }} className={`block w-full rounded-tile px-3 py-2 text-left transition-colors duration-150 hover:bg-brand-50 ${n.read ? "" : "bg-info-100"}`}>
                        <div className="text-[13.5px] font-medium text-ink-900">{n.title}</div><div className="text-xs text-slate-500">{fmt.date(n.at)}</div>
                      </button>)) : <div className="px-3 py-4 text-[13.5px] text-slate-500">Nothing yet. Notifications appear when someone needs you.</div>}
                  </div>
                </div>)}
            </div>
            <button className="icon-btn" aria-label="How this screen works" title="How this screen works" onClick={() => setHelp(true)}><HelpCircle size={19} /></button>
          </div>
        </header>
        <div key={loc.pathname} className="anim-page mx-auto max-w-content px-8 pb-12 pt-6">{children}</div>
      </main>
      <AskLauncher />
      {help && <HelpPanel path={loc.pathname} onClose={() => setHelp(false)} />}
    </div>
  );
}
