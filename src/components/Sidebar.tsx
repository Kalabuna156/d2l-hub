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
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-white/[0.06] bg-[var(--chrome)] px-4 py-5 backdrop-blur-2xl lg:flex">
      <div className="flex items-center gap-3 px-1">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-indigo-700 shadow-lg shadow-violet-950/60">
          <GraduationCap className="h-5 w-5 text-white" strokeWidth={2.2} />
        </div>
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold tracking-tight text-white">D2L Hub</p>
          <p className="text-[11px] text-slate-500">Brightspace, organized</p>
        </div>
      </div>

      <nav className="mt-7 space-y-1">
        {NAV_ITEMS.filter((item) => item.view !== 'exambank' || showExamBank).map((item) => {
          const Icon = item.icon;
          const active = view === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => onView(item.view)}
              className={`focus-ring group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? 'bg-white/[0.07] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              <Icon
                className={`h-[18px] w-[18px] transition ${active ? 'text-violet-300' : 'text-slate-500 group-hover:text-slate-300'}`}
                strokeWidth={1.9}
              />
              {item.label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-400" />}
            </button>
          );
        })}
      </nav>

      <div className="mt-7 flex items-center justify-between px-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          {groupMode === 'term' ? 'Terms' : 'Subjects'}
        </p>
        <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-slate-500">
          {groups.reduce((sum, group) => sum + group.courses.length, 0)}
        </span>
      </div>

      <div className="hide-scrollbar mt-2 flex-1 space-y-0.5 overflow-y-auto pb-4">
        <button
          type="button"
          onClick={() => onCategory(null)}
          className={`focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition ${
            activeCategory === null
              ? 'bg-violet-500/[0.12] text-violet-100 ring-1 ring-inset ring-violet-400/20'
              : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="truncate">All courses</span>
          <span className="ml-auto text-[11px] text-slate-500">{totalCourses}</span>
        </button>

        {groups.map((group) => {
          const active = activeCategory === group.key;
          const theme = themeForSubject(group.key);
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => onCategory(active ? null : group.key)}
              className={`focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition ${
                active
                  ? 'bg-white/[0.07] text-white ring-1 ring-inset ring-white/10'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: groupMode === 'subject' ? theme.dot : '#5b6478' }}
              />
              <span className="truncate" title={group.label}>
                {group.label}
              </span>
              <span className="ml-auto text-[11px] text-slate-500">{group.courses.length}</span>
            </button>
          );
        })}
      </div>

      <div className="panel mt-2 p-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-400/30 to-sky-400/20 text-[11px] font-semibold text-violet-100 ring-1 ring-white/10">
            {initials || 'D2'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-slate-100">{userName ?? 'Not signed in'}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span
                className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`}
              />
              {connected ? 'Live D2L session' : 'Not connected'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onManage}
          className="focus-ring mt-3 flex w-full items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 py-2 text-[12px] font-medium text-slate-300 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white"
        >
          <span className="truncate">{hostLabel(baseUrl)}</span>
          <Settings2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        </button>
      </div>
    </aside>
  );
}
