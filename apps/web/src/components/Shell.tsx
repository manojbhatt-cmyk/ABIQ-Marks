import {
  Bell, BookOpenCheck, Briefcase, CalendarDays, CheckSquare, ClipboardList, Database, Gavel, GitBranch, HelpCircle, Inbox,
  LayoutDashboard, ListChecks, LogOut, Menu, MessagesSquare, Monitor, Moon, Repeat, Route, Scale, Send, Settings, ShieldCheck, Sun, Table2, X,
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
    { to: "/process", label: "Before and now", icon: Route, roles: ALL },
    { to: "/lineage", label: "Lineage", icon: GitBranch, roles: ALL.filter((r) => r !== "lincoln") },
    { to: "/inbox", label: "External mail", icon: BookOpenCheck, roles: ["pm_team", "deal_analyst", "deal_lead", "admin", "lincoln"] },
    { to: "/admin", label: "Admin", icon: Settings, roles: ["admin"] },
  ]],
];

export function homeFor(_role: string) {
  return "/work";
}

const STAGES: [number, number, string][] = [[1, 3, "Kickoff and intake"], [4, 9, "Modelling and CMR"], [10, 13, "Lincoln draft marks"], [14, 15, "Deal Team approval"], [16, 18, "Valuation Committee"], [19, 22, "Finalise and distribute"]];

type Theme = "system" | "light" | "dark";
function useTheme(): [Theme, () => void] {
  const read = (): Theme => { try { const t = localStorage.getItem("tiq_theme"); return t === "light" || t === "dark" ? t : "system"; } catch { return "system"; } };
  const [theme, setTheme] = useState<Theme>(read);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme"); else el.setAttribute("data-theme", theme);
    try { theme === "system" ? localStorage.removeItem("tiq_theme") : localStorage.setItem("tiq_theme", theme); } catch {}
  }, [theme]);
  const next = () => setTheme(theme === "system" ? "light" : theme === "light" ? "dark" : "system");
  return [theme, next];
}

export default function Shell({ children }: { children: ReactNode }) {
  const { user, cycle, cycles, setCycleId, setUser, refreshCycles } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => { refreshCycles(); setDrawer(false); }, [loc.pathname]);
  const [help, setHelp] = useState(false);
  const [bell, setBell] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [theme, nextTheme] = useTheme();
  const notes = useApi<any[]>(user ? "/notifications" : null, [user?.email, cycle?.day]);
  if (!user) return null;
  const unread = (notes.data || []).filter((n) => !n.read).length;
  const crumbItem = GROUPS.flatMap(([g, items]) => items.map((i) => [g, i] as const)).find(([, i]) => loc.pathname.startsWith(i.to));
  const st = cycle?.stage_step ?? 1;
  const phase = cycle ? (cycle.status === "closed" ? "Closed" : cycle.status === "draft" ? "Kickoff pending" : STAGES.find(([a, b]) => st >= a && st <= b)?.[2] || "Finalise and distribute") : "";
  const initials = user.name.split(/[ -]/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("");
  const team = user.deal_team_id ? `, Team ${user.deal_team_id.replace("DT-", "").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}` : "";
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <div className="flex min-h-full">
      {drawer && <div className="anim-scrim scrim fixed inset-0 z-30 lg:hidden" onClick={() => setDrawer(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col border-r border-line bg-surface transition-transform duration-200 lg:z-20 lg:translate-x-0 ${drawer ? "translate-x-0 shadow-float" : "-translate-x-full"}`}>
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4"><Logo />
          <button className="icon-btn lg:hidden" aria-label="Close menu" onClick={() => setDrawer(false)}><X size={18} /></button></div>
        <nav className="flex-1 overflow-y-auto py-2" aria-label="Main">
          {GROUPS.map(([label, items], gi) => {
            const mine = items.filter((i) => i.roles.includes(user.role));
            if (!mine.length) return null;
            return (
              <div key={label} className={gi ? "mt-2 border-t border-line pt-2" : ""}>
                <div className="px-5 pb-1 pt-1.5 text-[11px] font-medium text-faint">{label}</div>
                {mine.map((i) => (
                  <NavLink key={i.to} to={i.to} className="nav-item mx-2 my-px">
                    <i.icon aria-hidden="true" /> {i.label}
                  </NavLink>))}
              </div>
            );
          })}
        </nav>
        <div className="flex items-center gap-2.5 border-t border-line px-3 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sunken text-[12px] font-semibold text-muted">{initials}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink">{user.name}</div>
            <div className="truncate text-xs text-muted">{ROLE_LABEL[user.role]}{team}</div>
          </div>
          <button className="icon-btn" title="Sign out" aria-label="Sign out" onClick={() => { localStorage.removeItem("tiq_token"); setUser(null); nav("/login"); }}><LogOut size={16} /></button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 lg:ml-[232px]">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
          <button className="icon-btn lg:hidden" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu size={18} /></button>
          <div className="min-w-0 truncate text-[13px] text-muted">
            {crumbItem ? <>{crumbItem[0]} <span className="text-faint">/</span> <span className="font-medium text-ink">{crumbItem[1].label}</span></> : null}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {cycle && (
              <>
                <select aria-label="Cycle" className="input !min-h-[28px] !w-auto !py-0 !text-[12px] font-medium max-sm:hidden" value={cycle.id} onChange={(e) => setCycleId(e.target.value)}>
                  {cycles.filter((c) => c.cycle_type === "quarterly").map((c) => <option key={c.id} value={c.id}>{c.period} quarterly</option>)}
                </select>
                <span title={`Where the ${cycle.period} cycle stands`} className="badge badge-gray mr-1 max-md:hidden">
                  <span className="h-1.5 w-10 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full bg-accent-500" style={{ width: `${Math.max(4, (cycle.status === "closed" ? 1 : cycle.progress ?? 0) * 100)}%` }} /></span>
                  {phase}
                </span>
              </>
            )}
            <button className="icon-btn" onClick={nextTheme} title={`Theme: ${theme} (click to change)`} aria-label={`Theme: ${theme}. Change theme`}><ThemeIcon size={17} /></button>
            <div className="relative">
              <button className="icon-btn relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => { setBell(!bell); if (!bell && unread) api("/notifications/read", { body: {} }).then(() => setTimeout(notes.reload, 400)); }}>
                <Bell size={17} />{unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold text-white num">{unread}</span>}
              </button>
              {bell && (
                <div className="anim-modal absolute right-0 mt-2 w-[min(384px,calc(100vw-32px))] rounded-card border border-line bg-surface p-2 shadow-raised">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted">Notifications</div>
                  <div className="max-h-96 overflow-y-auto">
                    {(notes.data || []).length ? notes.data!.map((n) => (
                      <button key={n.id} onClick={() => { setBell(false); if (n.link) nav(n.link); }} className="flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-left transition-colors duration-150 hover:bg-sunken">
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.read ? "bg-transparent" : n.kind === "deadline_reminder" && n.title.startsWith("Overdue") ? "bg-danger-500" : "bg-accent-500"}`} aria-hidden="true" />
                        <span className="min-w-0"><span className="block text-[13px] font-medium text-ink">{n.title}</span><span className="block text-xs text-muted">{fmt.date(n.at)}</span></span>
                      </button>)) : <div className="px-3 py-4 text-[13px] text-muted">Nothing yet. Notifications appear when someone needs you.</div>}
                  </div>
                </div>)}
            </div>
            <button className="icon-btn" aria-label="How this screen works" title="How this screen works" onClick={() => setHelp(true)}><HelpCircle size={17} /></button>
          </div>
        </header>
        <div key={loc.pathname} className="anim-page mx-auto max-w-content px-4 pb-24 pt-6 sm:px-6">{children}</div>
      </main>
      <AskLauncher />
      {help && <HelpPanel path={loc.pathname} onClose={() => setHelp(false)} />}
    </div>
  );
}
