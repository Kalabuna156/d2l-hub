import {
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  Files,
  GraduationCap,
  LayoutDashboard,
  Library,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react';
import type { CourseGroup, GroupMode } from '../../shared/categorize';
import { themeForSubject } from '../../shared/categorize';
import { hostLabel } from '../lib/format';
import type { View } from '../lib/ui';

interface SidebarProps {
  view: View;
  onView: (view: View) => void;
  groups: CourseGroup[];
  groupMode: GroupMode;
  activeCategory: string | null;
  onCategory: (key: string | null) => void;
  totalCourses: number;
  connected: boolean;
  userName: string | null;
  baseUrl: string;
  onManage: () => void;
  showExamBank: boolean;
}

const NAV_ITEMS: { view: View; label: string; icon: typeof LayoutDashboard }[] = [
  { view: 'overview', label: 'Overview', icon: LayoutDashboard },
  { view: 'courses', label: 'Courses', icon: BookOpen },
  { view: 'calendar', label: 'Calendar', icon: CalendarDays },
  { view: 'study', label: 'Study', icon: BookOpenCheck },
  { view: 'library', label: 'Content Space', icon: Files },
  { view: 'exambank', label: 'Exam bank', icon: Library },
];

export function Sidebar({
  view,
  onView,
  groups,
  groupMode,
  activeCategory,
  onCategory,
  totalCourses,
  connected,
  userName,
  baseUrl,
  onManage,
  showExamBank,
}: SidebarProps) {
  const initials = (userName ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <aside className="chrome-bar fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line px-3.5 py-5 lg:flex">
      {/* Brand */}
      <div className="flex items-center gap-3 px-1.5">
        <div className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-[11px] bg-gradient-to-br from-violet-400 via-violet-600 to-indigo-700 shadow-[0_10px_24px_-12px_rgba(109,94,252,0.9),inset_0_1px_0_rgba(255,255,255,0.35)]">
          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.45),transparent_46%)] opacity-70" />
          <GraduationCap className="relative h-[18px] w-[18px] text-white" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="font-display text-[14.5px] font-semibold tracking-[-0.02em] text-ink-1">D2L Hub</p>
          <p className="truncate text-[11px] text-ink-4">Brightspace, organized</p>
        </div>
      </div>

      {/* Primary navigation */}
      <nav className="mt-7 space-y-0.5">
        {NAV_ITEMS.filter((item) => item.view !== 'exambank' || showExamBank).map((item) => {
          const Icon = item.icon;
          const active = view === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => onView(item.view)}
              aria-current={active ? 'page' : undefined}
              className={`focus-ring group relative flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-[13px] transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.985] ${
                active
                  ? 'bg-violet-500/[0.13] font-medium text-ink-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]'
                  : 'text-ink-3 hover:bg-surface-1 hover:text-ink-1'
              }`}
            >
              {/* The one accent per view: a lit edge on the active row. */}
              <span
                className={`absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full transition-all duration-200 ease-[var(--ease-out)] ${
                  active ? 'bg-violet-400 opacity-100 shadow-[0_0_10px_1px_rgba(139,125,255,0.75)]' : 'opacity-0'
                }`}
              />
              <Icon
                className={`h-[17px] w-[17px] transition-colors duration-150 ${
                  active ? 'text-violet-300' : 'text-ink-4 group-hover:text-ink-2'
                }`}
                strokeWidth={1.9}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Course filters */}
      <div className="mt-7 flex items-center justify-between px-2.5">
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-4">
          {groupMode === 'term' ? 'Terms' : 'Subjects'}
        </p>
        <span className="rounded-full bg-surface-2 px-1.5 py-px font-mono text-[10px] tabular-nums text-ink-4">
          {groups.reduce((sum, group) => sum + group.courses.length, 0)}
        </span>
      </div>

      <div className="hide-scrollbar mt-1.5 flex-1 space-y-px overflow-y-auto pb-4">
        <button
          type="button"
          onClick={() => onCategory(null)}
          className={`focus-ring flex w-full items-center gap-2 rounded-[9px] px-2.5 py-[7px] text-left text-[12.5px] transition-colors duration-150 ${
            activeCategory === null
              ? 'bg-violet-500/[0.13] text-violet-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
              : 'text-ink-3 hover:bg-surface-1 hover:text-ink-1'
          }`}
        >
          <SlidersHorizontal className={`h-3.5 w-3.5 shrink-0 ${activeCategory === null ? 'text-violet-300' : 'text-ink-4'}`} />
          <span className="truncate">All courses</span>
          <span className="ml-auto font-mono text-[10.5px] tabular-nums text-ink-4">{totalCourses}</span>
        </button>

        {groups.map((group) => {
          const active = activeCategory === group.key;
          const theme = themeForSubject(group.key);
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => onCategory(active ? null : group.key)}
              className={`focus-ring flex w-full items-center gap-2 rounded-[9px] px-2.5 py-[7px] text-left text-[12.5px] transition-colors duration-150 ${
                active
                  ? 'bg-surface-2 text-ink-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  : 'text-ink-3 hover:bg-surface-1 hover:text-ink-1'
              }`}
            >
              <span
                className="h-[5px] w-[5px] shrink-0 rounded-full ring-2 ring-white/[0.04]"
                style={{ backgroundColor: groupMode === 'subject' ? theme.dot : '#4b5464' }}
              />
              <span className="truncate" title={group.label}>
                {group.label}
              </span>
              <span className="ml-auto font-mono text-[10.5px] tabular-nums text-ink-4">{group.courses.length}</span>
            </button>
          );
        })}
      </div>

      {/* Account */}
      <div className="pane mt-2 p-3">
        <div className="flex items-center gap-2.5">
          <div className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[conic-gradient(from_140deg,rgba(139,125,255,0.55),rgba(56,189,248,0.35),rgba(139,125,255,0.55))] p-px">
            <span className="grid h-full w-full place-items-center rounded-full bg-[var(--chrome-solid)] text-[10.5px] font-semibold tracking-wide text-ink-1">
              {initials || 'D2'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-medium text-ink-1">{userName ?? 'Not signed in'}</p>
            <p className="flex items-center gap-1.5 text-[10.5px] text-ink-4">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected ? 'bg-emerald-400 shadow-[0_0_6px_1px_rgba(52,211,153,0.6)]' : 'bg-amber-400'
                }`}
              />
              {connected ? 'Live D2L session' : 'Not connected'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onManage}
          className="focus-ring mt-3 flex w-full items-center justify-between rounded-[9px] border border-line bg-surface-1 px-2.5 py-[7px] text-[11.5px] font-medium text-ink-2 transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out)] hover:border-line-strong hover:bg-surface-2 hover:text-ink-1 active:scale-[0.985]"
        >
          <span className="truncate">{hostLabel(baseUrl)}</span>
          <Settings2 className="h-3.5 w-3.5 shrink-0 text-ink-4" />
        </button>
      </div>
    </aside>
  );
}
