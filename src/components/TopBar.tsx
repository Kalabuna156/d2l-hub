import { useEffect, useRef } from 'react';
import {
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  Files,
  LayoutDashboard,
  Library,
  RefreshCw,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import type { View } from '../lib/ui';
import { NotificationsBell } from './NotificationsBell';

interface TopBarProps {
  view: View;
  onView: (view: View) => void;
  title: string;
  subtitle: string;
  query: string;
  onQuery: (value: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  connected: boolean;
  onManage: () => void;
  onSettings: () => void;
  showSearch?: boolean;
  showExamBank?: boolean;
}

const MOBILE_NAV: { view: View; label: string; icon: typeof LayoutDashboard }[] = [
  { view: 'overview', label: 'Overview', icon: LayoutDashboard },
  { view: 'courses', label: 'Courses', icon: BookOpen },
  { view: 'calendar', label: 'Calendar', icon: CalendarDays },
  { view: 'study', label: 'Study', icon: BookOpenCheck },
  { view: 'library', label: 'Content Space', icon: Files },
  { view: 'exambank', label: 'Exam bank', icon: Library },
];

export function TopBar({
  view,
  onView,
  title,
  subtitle,
  query,
  onQuery,
  onRefresh,
  refreshing,
  connected,
  onManage,
  onSettings,
  showSearch = true,
  showExamBank = true,
}: TopBarProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key === 'Escape' && document.activeElement === searchRef.current) {
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[var(--chrome)] backdrop-blur-2xl">
      <div className="flex h-[74px] items-center gap-3 px-5 sm:px-7">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[17px] font-semibold tracking-tight text-white">{title}</h1>
          <p className="truncate text-[12px] text-slate-500">{subtitle}</p>
        </div>

        <div className={`relative hidden md:block ${showSearch ? '' : 'invisible'}`}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search courses"
            aria-label="Search courses"
            className="focus-ring h-10 w-[240px] rounded-xl border border-white/[0.07] bg-white/[0.04] pl-9 pr-14 text-[13px] text-slate-200 placeholder:text-slate-500 transition focus:border-violet-400/40 focus:bg-white/[0.06] lg:w-[280px]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQuery('')}
              aria-label="Clear search"
              className="focus-ring absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-500 hover:bg-white/10 hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              Ctrl K
            </kbd>
          )}
        </div>

        <NotificationsBell connected={connected} />

        <button
          type="button"
          onClick={onSettings}
          aria-label="Settings"
          title="Settings"
          className="focus-ring grid h-10 w-10 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.04] text-slate-400 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white"
        >
          <Settings2 className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh from D2L"
          className="focus-ring grid h-10 w-10 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.04] text-slate-400 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>

        <button
          type="button"
          onClick={onManage}
          className={`focus-ring hidden items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-medium transition sm:flex ${
            connected
              ? 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200 hover:bg-emerald-400/[0.13]'
              : 'border-amber-400/25 bg-amber-400/[0.07] text-amber-200 hover:bg-amber-400/[0.12]'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {connected ? 'Connected' : 'Connect D2L'}
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-t border-white/[0.05] px-4 py-2 lg:hidden">
        {MOBILE_NAV.filter((item) => item.view !== 'exambank' || showExamBank).map((item) => {
          const Icon = item.icon;
          const active = view === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => onView(item.view)}
              className={`focus-ring flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] transition ${
                active ? 'bg-white/[0.08] text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
