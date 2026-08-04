"use client";

import Link from "next/link";
import type { SessionPayload } from "@/lib/session";

// Shared icon set — used by the sidebar itself and by page headers that want
// a matching glyph. Kept here (not duplicated per-page) so every nav surface
// draws from the same set.
export function Ic({ n, cls = "w-4 h-4" }: { n: string; cls?: string }) {
  const P: Record<string, React.ReactNode> = {
    home: <><path d="M3 12L12 3l9 9"/><rect x="5" y="12" width="5" height="8"/><rect x="14" y="12" width="5" height="8"/></>,
    chart: <><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="6" width="4" height="14" rx="1"/><rect x="17" y="2" width="4" height="18" rx="1"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></>,
    alert: <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></>,
    table: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></>,
    plus: <><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>,
    menu: <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
    check: <><polyline points="20 6 9 17 4 12"/></>,
    link: <><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    download: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    users: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>,
    back: <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>{P[n]}</svg>;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
  /** Present -> rendered as a real Link (leaves the SPA). Absent -> onSelect(id) (tab switch). */
  href?: string;
}

/**
 * The left nav, extracted so both the tab-based dashboard (app/DashboardClient.tsx)
 * and standalone routed pages (e.g. /groups) render an identical, single-source
 * sidebar instead of two copies that can drift apart.
 */
export function Sidebar({
  items, activeId, onSelect, user, onLogout, loggingOut, sidebarOpen, setSidebarOpen,
}: {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  user: SessionPayload;
  onLogout: () => void;
  loggingOut: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
}) {
  return (
    <>
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 flex flex-col transition-transform duration-200 ease-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 h-14 border-b border-slate-800 flex-shrink-0">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center font-black text-white text-xs flex-shrink-0">SLF</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold leading-tight truncate">Sober Living Finder</p>
            <p className="text-slate-500 text-[10px] leading-tight">VA Dashboard</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-500 hover:text-white p-1"><Ic n="x" cls="w-4 h-4" /></button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3 mb-2">Navigation</p>
          {items.map(item => {
            const on = activeId === item.id;
            const cls = `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${on ? "bg-green-600/15 text-green-400" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`;
            const inner = <>
              <Ic n={item.icon} cls="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge !== undefined && (
                <span className="bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">{item.badge}</span>
              )}
            </>;
            return item.href
              ? <Link key={item.id} href={item.href} onClick={() => setSidebarOpen(false)} className={cls}>{inner}</Link>
              : <button key={item.id} onClick={() => onSelect(item.id)} className={cls}>{inner}</button>;
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{user.name.slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium leading-tight truncate">{user.name}</p>
              <p className="text-slate-500 text-[10px]">{user.title}</p>
            </div>
          </div>
          <button onClick={onLogout} disabled={loggingOut}
            className="flex items-center gap-2 text-slate-500 hover:text-red-400 text-xs transition-colors disabled:opacity-50 w-full mt-2">
            <Ic n="logout" cls="w-3.5 h-3.5" />{loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>
    </>
  );
}

/** Matches the sidebar/main split every page uses. Renders its own <main>. */
export function PageFooter() {
  return (
    <footer className="bg-white border-t border-slate-200 flex-shrink-0">
      <div className="px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 bg-green-600 rounded-md flex items-center justify-center text-white text-[9px] font-black">SLF</div>
          <span className="text-xs text-slate-500 font-medium">Sober Living Finder</span>
          <span className="text-slate-200 hidden sm:block">—</span>
          <span className="text-xs text-slate-400 hidden sm:block">VA Performance Dashboard</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <a href="https://soberlivingfinder.com" target="_blank" rel="noreferrer" className="hover:text-green-600 transition-colors flex items-center gap-1">
            <Ic n="link" cls="w-3 h-3" /> soberlivingfinder.com
          </a>
          <span className="text-slate-200">|</span>
          <span>© {new Date().getFullYear()} Sober Living Finder. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
