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
    if (theme === "system") {
      const isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      el.setAttribute("data-theme", isDark ? "dark" : "light");
    } else {
      el.setAttribute("data-theme", theme);
    }
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
    <div className="flex min-h-full bg-page">
      {drawer && <div className="anim-scrim scrim fixed inset-0 z-30 lg:hidden" onClick={() => setDrawer(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[256px] flex-col border-r border-line bg-surface transition-transform duration-200 lg:z-20 lg:translate-x-0 ${drawer ? "translate-x-0 shadow-float" : "-translate-x-full"}`}>
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-line px-5">
          <Logo />
          <button className="icon-btn lg:hidden" aria-label="Close menu" onClick={() => setDrawer(false)}><X size={18} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Main">
          {GROUPS.map(([label, items], gi) => {
            const mine = items.filter((i) => i.roles.includes(user.role));
            if (!mine.length) return null;
            return (
              <div key={label} className={gi ? "mt-4 pt-3 border-t border-line" : ""}>
                <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-faint">{label}</div>
                <div className="space-y-0.5">
                  {mine.map((i) => (
                    <NavLink key={i.to} to={i.to} className="nav-item">
                      <i.icon aria-hidden="true" size={17} /> 
                      <span className="truncate">{i.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 border-t border-line bg-surface-2/60 px-4 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[12px] font-bold text-brand-700 shadow-sm border border-brand-200">{initials}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-ink leading-tight">{user.name}</div>
            <div className="truncate text-[11.5px] font-medium text-muted">{ROLE_LABEL[user.role]}{team}</div>
          </div>
          <button className="icon-btn" title="Sign out" aria-label="Sign out" onClick={() => { localStorage.removeItem("tiq_token"); setUser(null); nav("/login"); }}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 lg:ml-[256px]">
        <header className="sticky top-0 z-10 flex h-[60px] items-center gap-3 border-b border-line bg-surface/95 backdrop-blur-sm px-4 sm:px-8">
          <button className="icon-btn lg:hidden" aria-label="Open menu" onClick={() => setDrawer(true)}><Menu size={18} /></button>
          <div className="min-w-0 truncate text-[13px] text-muted flex items-center gap-2">
            {crumbItem ? (
              <>
                <span className="text-muted hover:text-ink transition-colors">{crumbItem[0]}</span>
                <span className="text-faint font-light">/</span>
                <span className="font-semibold text-ink">{crumbItem[1].label}</span>
              </>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {cycle && (
              <>
                <div className="relative max-sm:hidden">
                  <select 
                    aria-label="Cycle" 
                    className="input !h-[32px] !w-auto !py-0 !pl-2.5 !pr-7 !text-[12.5px] font-semibold bg-surface border-line rounded-control text-ink hover:border-strong cursor-pointer shadow-sm" 
                    value={cycle.id} 
                    onChange={(e) => setCycleId(e.target.value)}
                  >
                    {cycles.filter((c) => c.cycle_type === "quarterly").map((c) => (
                      <option key={c.id} value={c.id}>{c.period} Quarterly</option>
                    ))}
                  </select>
                </div>
                <div title={`Where the ${cycle.period} cycle stands`} className="badge badge-gray mr-1 max-md:hidden h-[30px] px-3 gap-2 border-line shadow-sm">
                  <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-3">
                    <div 
                      className="h-full rounded-full bg-brand-600 transition-all duration-300" 
                      style={{ width: `${Math.max(6, (cycle.status === "closed" ? 1 : cycle.progress ?? 0) * 100)}%` }} 
                    />
                  </div>
                  <span className="font-semibold text-[11.5px] text-ink">{phase}</span>
                </div>
              </>
            )}
            <button className="icon-btn" onClick={nextTheme} title={`Theme: ${theme} (click to change)`} aria-label={`Theme: ${theme}. Change theme`}><ThemeIcon size={16} /></button>
            <div className="relative">
              <button className="icon-btn relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => { setBell(!bell); if (!bell && unread) api("/notifications/read", { body: {} }).then(() => setTimeout(notes.reload, 400)); }}>
                <Bell size={16} />
                {unread > 0 && <span className="absolute 1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-white num">{unread}</span>}
              </button>
              {bell && (
                <div className="anim-modal absolute right-0 mt-2 w-[min(384px,calc(100vw-32px))] rounded-card border border-line bg-surface p-2 shadow-raised z-50">
                  <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted border-b border-line">Notifications</div>
                  <div className="max-h-96 overflow-y-auto divide-y divide-line/60">
                    {(notes.data || []).length ? notes.data!.map((n) => (
                      <button key={n.id} onClick={() => { setBell(false); if (n.link) nav(n.link); }} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-2">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : n.kind === "deadline_reminder" && n.title.startsWith("Overdue") ? "bg-danger-500" : "bg-brand-500"}`} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-ink leading-snug">{n.title}</span>
                          <span className="block text-xs text-muted mt-0.5">{fmt.date(n.at)}</span>
                        </span>
                      </button>
                    )) : <div className="px-3 py-6 text-center text-[13px] text-muted">Nothing yet. Notifications appear when someone needs you.</div>}
                  </div>
                </div>
              )}
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
