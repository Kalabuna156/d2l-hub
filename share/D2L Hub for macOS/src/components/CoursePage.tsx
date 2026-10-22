import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  CalendarClock,
  ClipboardList,
  ExternalLink,
  FolderOpen,
  LayoutDashboard,
  Loader2,
  Megaphone,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { describeCourse, themeForSubject } from '../../shared/categorize';
import type { Assignment, Course, CourseDetail } from '../../shared/types';
import { fetchCourse } from '../lib/api';
import { relativeLabel, shortDateParts, timeLabel } from '../lib/format';
import { CourseContentPanel } from './CourseContentPanel';
import { CourseGradesPanel } from './CourseGradesPanel';

interface CoursePageProps {
  course: Course;
  onBack: () => void;
}

const LINK_ICONS: Record<string, typeof Megaphone> = {
  Announcements: Megaphone,
  Assignments: ClipboardList,
  Discussions: MessageSquare,
};

type CourseTab = 'overview' | 'content' | 'grades';

const TABS: { id: CourseTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'content', label: 'Content', icon: FolderOpen },
  { id: 'grades', label: 'Grades', icon: Award },
];

function formatAnnouncementDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function dueTone(assignment: Assignment): { label: string; className: string } {
  if (!assignment.dueAt) {
    return { label: assignment.dueLabel ?? 'No due date', className: 'text-slate-500' };
  }
  const time = new Date(assignment.dueAt).getTime();
  const now = Date.now();
  if (time < now) {
    return { label: `Overdue · ${relativeLabel(assignment.dueAt)}`, className: 'text-rose-300' };
  }
  if (time - now < 3 * 86_400_000) {
    return {
      label: `${relativeLabel(assignment.dueAt)} · ${timeLabel(assignment.dueAt)}`,
      className: 'text-amber-300',
    };
  }
  return {
    label: `${relativeLabel(assignment.dueAt)} · ${timeLabel(assignment.dueAt)}`,
    className: 'text-slate-400',
  };
}

function sortAssignments(assignments: Assignment[]): Assignment[] {
  const now = Date.now();
  const time = (assignment: Assignment) =>
    assignment.dueAt ? new Date(assignment.dueAt).getTime() : Number.POSITIVE_INFINITY;

  return [...assignments].sort((a, b) => {
    const aTime = time(a);
    const bTime = time(b);
    const aPast = aTime < now;
    const bPast = bTime < now;
    if (aPast !== bPast) return aPast ? 1 : -1;
    if (aPast) return bTime - aTime;
    return aTime - bTime;
  });
}

export function CoursePage({ course, onBack }: CoursePageProps) {
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<CourseTab>('overview');
  const [refreshToken, setRefreshToken] = useState(0);

  const info = describeCourse(course);
  const theme = themeForSubject(info.subject);

  const load = useCallback(
    async (fresh = false) => {
      if (!fresh) setLoading(true);
      try {
        const next = await fetchCourse(course.id, fresh);
        setDetail(next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load this course.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [course.id],
  );

  useEffect(() => {
    setDetail(null);
    setTab('overview');
    void load();
  }, [load]);

  const assignments = useMemo(() => sortAssignments(detail?.assignments ?? []), [detail]);

  const events = useMemo(() => {
    const now = Date.now();
    const time = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY);
    return [...(detail?.events ?? [])].sort((a, b) => {
      const aTime = time(a.startsAt);
      const bTime = time(b.startsAt);
      const aPast = aTime < now;
      const bPast = bTime < now;
      if (aPast !== bPast) return aPast ? 1 : -1;
      return aPast ? bTime - aTime : aTime - bTime;
    });
  }, [detail]);

  const upcomingCount = assignments.filter(
    (assignment) => assignment.dueAt && new Date(assignment.dueAt).getTime() >= Date.now(),
  ).length;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12px] font-medium text-slate-400 transition hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All courses
      </button>

      <section className="panel relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.6]"
          style={{ backgroundImage: `linear-gradient(120deg, ${theme.from}33 0%, transparent 58%)` }}
        />
        <div className="relative px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start gap-4">
            <div
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-[15px] font-black tracking-tight text-white/90 shadow-lg shadow-black/40"
              style={{ backgroundImage: `linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 100%)` }}
            >
              {info.initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-500">
                {course.code || 'D2L'}
              </p>
              <h2 className="mt-1 font-display text-[21px] font-semibold leading-tight tracking-tight text-white sm:text-[23px]">
                {course.name}
              </h2>
              <p className="mt-1 text-[12px] text-slate-400">
                {info.subjectLabel}
                {info.number ? ` · ${info.number}` : ''} · {info.termLabel}
                {info.kind === 'resource' ? ' · Resource' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setRefreshing(true);
                  setRefreshToken((token) => token + 1);
                  void load(true);
                }}
                disabled={refreshing || loading}
                className="focus-ring grid h-9 w-9 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-slate-400 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white disabled:opacity-60"
                aria-label="Refresh this course"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(detail?.links ?? []).map((link) => {
              const Icon = LINK_ICONS[link.label] ?? ExternalLink;
              return (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                >
                  <Icon className="h-3.5 w-3.5 text-slate-500" strokeWidth={1.8} />
                  {link.label}
                  <ExternalLink className="h-3 w-3 text-slate-600" />
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <div
        role="tablist"
        aria-label="Course sections"
        className="flex w-full gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-white/[0.03] p-1 sm:w-auto sm:self-start"
      >
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const active = tab === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry.id)}
              className={`focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[12px] font-medium transition sm:flex-none ${
                active
                  ? 'bg-white/[0.09] text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${active ? 'text-violet-300' : 'text-slate-500'}`} />
              {entry.label}
            </button>
          );
        })}
      </div>

      {detail?.notice && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-[12px] text-amber-100/85">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <p className="leading-relaxed">{detail.notice}</p>
        </div>
      )}

      {tab === 'content' ? (
        <CourseContentPanel course={course} refreshToken={refreshToken} />
      ) : tab === 'grades' ? (
        <CourseGradesPanel courseId={course.id} refreshToken={refreshToken} />
      ) : loading && !detail ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="panel h-[210px] animate-pulse" />
            <div className="panel h-[190px] animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="panel h-[160px] animate-pulse" />
            <div className="panel h-[140px] animate-pulse" />
          </div>
        </div>
      ) : error && !detail ? (
        <div className="panel mx-auto max-w-md px-6 py-10 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-400/20">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h3 className="mt-4 font-display text-base font-semibold text-white">Couldn’t open this course</h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{error}</p>
          <button
            type="button"
            onClick={() => void load(true)}
            className="focus-ring mx-auto mt-5 flex items-center gap-2 rounded-xl bg-white/[0.08] px-3.5 py-2 text-[12.5px] font-medium text-white transition hover:bg-white/[0.13]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="panel overflow-hidden">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/20">
                  <Megaphone className="h-3.5 w-3.5" />
                </span>
                <h3 className="font-display text-[13px] font-semibold text-slate-100">Announcements</h3>
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-slate-400">
                  {detail?.announcements.length ?? 0}
                </span>
              </div>

              {loading ? (
                <div className="space-y-3 px-4 py-4">
                  <div className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
                </div>
              ) : (detail?.announcements.length ?? 0) === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-[13px] text-slate-400">No announcements yet.</p>
                  <p className="mt-1 text-[11.5px] text-slate-600">
                    Course staff posts appear here as soon as D2L reports them.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.055]">
                  {detail?.announcements.map((announcement) => (
                    <li key={announcement.id} className="px-4 py-4">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <a
                          href={announcement.url}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring text-[13.5px] font-semibold leading-snug text-slate-100 transition hover:text-white"
                        >
                          {announcement.title}
                        </a>
                        {announcement.publishedAt && (
                          <span className="text-[11px] text-slate-500">
                            · {formatAnnouncementDate(announcement.publishedAt)}
                          </span>
                        )}
                      </div>
                      <div
                        className="announcement-body mt-2 max-h-[260px] overflow-y-auto pr-1"
                        // Body is sanitised on the server: no scripts, handlers or javascript: URLs.
                        dangerouslySetInnerHTML={{ __html: announcement.bodyHtml }}
                      />
                      <a
                        href={announcement.url}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-ring mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-violet-300/90 transition hover:text-violet-200"
                      >
                        Open in D2L
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel overflow-hidden">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/20">
                  <ClipboardList className="h-3.5 w-3.5" />
                </span>
                <h3 className="font-display text-[13px] font-semibold text-slate-100">Work to do</h3>
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-slate-400">
                  {assignments.length}
                </span>
                {upcomingCount > 0 && (
                  <span className="ml-auto text-[10.5px] uppercase tracking-[0.12em] text-slate-600">
                    {upcomingCount} upcoming
                  </span>
                )}
              </div>

              {loading ? (
                <div className="space-y-2 px-4 py-4">
                  {[0, 1, 2].map((row) => (
                    <div key={row} className="h-10 animate-pulse rounded-lg bg-white/[0.03]" />
                  ))}
                </div>
              ) : assignments.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-[13px] text-slate-400">Nothing due in this course.</p>
                  <p className="mt-1 text-[11.5px] text-slate-600">
                    Assignments with due dates show up here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.055]">
                  {assignments.map((assignment) => {
                    const due = dueTone(assignment);
                    return (
                      <li key={assignment.id}>
                        <a
                          href={assignment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring group flex items-start gap-3 px-4 py-3 transition hover:bg-white/[0.03]"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600 group-hover:bg-violet-400" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] font-medium text-slate-200 transition group-hover:text-white">
                              {assignment.name}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                              <span className={due.className}>{due.label}</span>
                              {assignment.category && (
                                <>
                                  <span className="text-slate-700">·</span>
                                  <span className="truncate">{assignment.category}</span>
                                </>
                              )}
                              {assignment.status && (
                                <>
                                  <span className="text-slate-700">·</span>
                                  <span className="truncate">{assignment.status}</span>
                                </>
                              )}
                            </p>
                          </div>
                          {assignment.score && (
                            <span className="shrink-0 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10.5px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
                              {assignment.score}
                            </span>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <div className="space-y-5">
            <section className="panel overflow-hidden">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-400/20">
                  <CalendarClock className="h-3.5 w-3.5" />
                </span>
                <h3 className="font-display text-[13px] font-semibold text-slate-100">Dates</h3>
              </div>

              {events.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12px] text-slate-500">
                  No dates on this month’s calendar.
                </p>
              ) : (
                <ul className="divide-y divide-white/[0.055]">
                  {events.slice(0, 6).map((event) => {
                    const date = shortDateParts(event.startsAt);
                    return (
                      <li key={event.id}>
                        <a
                          href={event.url ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.03]"
                        >
                          <div className="grid w-9 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.04] py-1 leading-none">
                            <span className="text-[9px] font-semibold tracking-[0.1em] text-slate-500">
                              {date.month}
                            </span>
                            <span className="mt-0.5 font-display text-[14px] font-semibold text-slate-100">
                              {date.day}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-[12px] leading-snug text-slate-300">{event.title}</p>
                            <p className="mt-0.5 text-[10.5px] text-slate-500">
                              {timeLabel(event.startsAt) || event.whenLabel || 'No time'}
                              {' · '}
                              {relativeLabel(event.startsAt)}
                            </p>
                          </div>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="panel px-4 py-4">
              <h3 className="font-display text-[13px] font-semibold text-slate-100">At a glance</h3>
              <dl className="mt-3 space-y-2 text-[12px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Enrollment code</dt>
                  <dd className="truncate font-mono text-[11px] text-slate-300">{course.code || '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Term</dt>
                  <dd className="text-slate-300">{info.termLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Subject</dt>
                  <dd className="text-slate-300">{info.subjectLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Announcements</dt>
                  <dd className="text-slate-300">{detail?.announcements.length ?? 0}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Assignments</dt>
                  <dd className="text-slate-300">{assignments.length}</dd>
                </div>
              </dl>
              <a
                href={course.url}
                target="_blank"
                rel="noreferrer"
                className="focus-ring mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              >
                Open course in D2L
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </section>

            {refreshing && !loading && (
              <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Refreshing from D2L…
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
