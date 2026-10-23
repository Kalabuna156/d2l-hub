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
    <header className="chrome-bar sticky top-0 z-20 border-b border-line">
      <div className="flex h-[72px] items-center gap-2.5 px-5 sm:px-7">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[17px] font-semibold leading-tight tracking-[-0.024em] text-ink-1">
            {title}
          </h1>
          <p className="truncate text-[11.5px] leading-tight text-ink-3">{subtitle}</p>
        </div>

        <div className={`relative hidden md:block ${showSearch ? '' : 'invisible'}`}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search courses"
            aria-label="Search courses"
            className="field h-9 w-[228px] pl-8 pr-14 lg:w-[268px]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQuery('')}
              aria-label="Clear search"
              className="focus-ring absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-[7px] text-ink-4 transition-colors duration-150 hover:bg-white/10 hover:text-ink-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-[6px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[9.5px] font-medium tracking-wide text-ink-4">
              Ctrl K
            </kbd>
          )}
        </div>

        <NotificationsBell connected={connected} />

        <button type="button" onClick={onSettings} aria-label="Settings" title="Settings" className="btn btn-icon focus-ring">
          <Settings2 className="h-[15px] w-[15px]" />
        </button>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh from D2L"
          title="Refresh from D2L"
          className="btn btn-icon focus-ring"
        >
          <RefreshCw className={`h-[15px] w-[15px] ${refreshing ? 'animate-spin' : ''}`} />
        </button>

        <button
          type="button"
          onClick={onManage}
          className={`focus-ring hidden h-9 items-center gap-2 rounded-[11px] border px-3 text-[11.5px] font-medium transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.985] sm:flex ${
            connected
              ? 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-200 hover:border-emerald-300/40 hover:bg-emerald-400/[0.12]'
              : 'border-violet-400/30 bg-violet-500/[0.12] text-violet-100 hover:border-violet-300/50 hover:bg-violet-500/[0.18]'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? 'bg-emerald-400 shadow-[0_0_7px_1px_rgba(52,211,153,0.65)]' : 'bg-violet-300'
            }`}
          />
          {connected ? 'Connected' : 'Connect D2L'}
        </button>
      </div>

      <div className="hide-scrollbar flex gap-1 overflow-x-auto border-t border-line px-4 py-2 lg:hidden">
        {MOBILE_NAV.filter((item) => item.view !== 'exambank' || showExamBank).map((item) => {
          const Icon = item.icon;
          const active = view === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => onView(item.view)}
              className={`focus-ring flex shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[11.5px] transition-colors duration-150 ${
                active
                  ? 'bg-surface-2 text-ink-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                  : 'text-ink-3 hover:text-ink-1'
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
