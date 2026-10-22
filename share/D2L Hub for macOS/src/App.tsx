import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, CalendarClock, GraduationCap, RefreshCw, Sparkles, X } from 'lucide-react';
import { describeCourse, groupCourses, type GroupMode } from '../shared/categorize';
import type { AppState, Course, DashboardData, Preferences } from '../shared/types';
import { Backdrop } from './components/Backdrop';
import { CalendarView } from './components/CalendarView';
import { ConnectDialog } from './components/ConnectDialog';
import { ConnectPrompt } from './components/ConnectPrompt';
import { ContentSpace } from './components/ContentSpace';
import { CoursePage } from './components/CoursePage';
import { ExamBank } from './components/ExamBank';
import { CourseSections } from './components/CourseSections';
import { RightRail } from './components/RightRail';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { StudyView } from './components/StudyView';
import { TopBar } from './components/TopBar';
import { fetchDashboard, fetchState, savePreferences, syncIntegrations } from './lib/api';
import { greeting, hostLabel, isClassEvent, longDate } from './lib/format';
import { applyPreferences, DEFAULT_PREFERENCES } from './lib/preferences';
import type { View } from './lib/ui';

const VIEW_COPY: Record<View, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: '' },
  courses: { title: 'Courses', subtitle: '' },
  calendar: { title: 'Calendar', subtitle: 'Due dates, quizzes and course events' },
  study: { title: 'Study', subtitle: 'What to review, practise and open for each assessment' },
  library: { title: 'Content Space', subtitle: 'Course files saved on this computer, grouped by unit' },
  exambank: { title: 'Exam bank', subtitle: 'MUES engineering exams plus your own Drive folders' },
};

function GroupToggle({ mode, onChange }: { mode: GroupMode; onChange: (mode: GroupMode) => void }) {
  return (
    <div className="flex rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
      {(['term', 'subject'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`focus-ring rounded-[6px] px-2.5 py-1 text-[11px] font-medium capitalize transition ${
            mode === option
              ? 'bg-white/[0.09] text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1 font-display text-[19px] font-semibold leading-none text-white">{value}</p>
    </div>
  );
}

export default function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('overview');
  const [groupMode, setGroupMode] = useState<GroupMode>('term');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'connections' | 'ai' | 'appearance'>('connections');
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const inFlight = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!silent) setLoading(true);
    try {
      const [nextState, nextDashboard] = await Promise.all([fetchState(), fetchDashboard()]);
      setAppState(nextState);
      setDashboard(nextDashboard.data);
      setConnected(nextDashboard.connected);
      // Only adopt the stored theme on first load; after that the picker owns it.
      setPreferences((current) => current ?? nextState.preferences);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the local server.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Classes get cancelled, rooms move, deadlines get added: keep the calendar
  // fresh in the background so the week grid is never stale for long.
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    const interval = window.setInterval(sync, 5 * 60_000);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [load]);

  const prefs = preferences ?? DEFAULT_PREFERENCES;

  useEffect(() => {
    applyPreferences(prefs);
  }, [prefs]);

  // A file dropped anywhere other than a drop target must not navigate the
  // whole Electron window to that file.
  useEffect(() => {
    const block = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  // Turning the exam bank off hides its page as well as its nav entry.
  useEffect(() => {
    if (!prefs.examBank && view === 'exambank') setView('overview');
  }, [prefs.examBank, view]);

  const changePreferences = useCallback((next: Preferences) => {
    setPreferences(next);
    applyPreferences(next);
    // Persist on a short delay so dragging a slider is not a request per pixel.
    window.setTimeout(() => {
      void savePreferences(next).catch(() => undefined);
    }, 400);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Manual refresh bypasses the server cache so a moved room shows at once.
      await syncIntegrations();
    } catch {
      // A dead feed reports itself in Settings; the reload below still runs.
    }
    await load(true);
    setRefreshing(false);
  }, [load]);

  const courses = dashboard?.courses ?? [];
  const events = dashboard?.events ?? [];
  const calendarConnected = Boolean(
    appState?.integrations.google.connected || appState?.integrations.notion.connected,
  );
  const baseUrl = dashboard?.user.baseUrl ?? appState?.baseUrl ?? 'https://courses.torontomu.ca';
  const userName = dashboard?.user.name ?? appState?.userName ?? null;

  const categoryGroups = useMemo(() => groupCourses(courses, groupMode), [courses, groupMode]);

  const filteredCourses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return courses.filter((course) => {
      const info = describeCourse(course);
      if (activeCategory) {
        const key = groupMode === 'term' ? info.termKey ?? 'resources' : info.subject;
        if (key !== activeCategory) return false;
      }
      if (!needle) return true;
      return (
        course.name.toLowerCase().includes(needle) ||
        course.code.toLowerCase().includes(needle) ||
        info.subjectLabel.toLowerCase().includes(needle) ||
        info.termLabel.toLowerCase().includes(needle)
      );
    });
  }, [courses, query, activeCategory, groupMode]);

  const groupedCourses = useMemo(() => groupCourses(filteredCourses, groupMode), [filteredCourses, groupMode]);

  const subjectCount = useMemo(
    () => new Set(courses.map((course) => describeCourse(course).subject)).size,
    [courses],
  );

  const dueSoon = useMemo(() => {
    const now = Date.now();
    const horizon = now + 14 * 86_400_000;
    return events.filter((event) => {
      if (!event.startsAt || event.hidden || isClassEvent(event)) return false;
      const time = new Date(event.startsAt).getTime();
      return time >= now && time <= horizon;
    }).length;
  }, [events]);

  const courseCount = courses.filter((course) => describeCourse(course).kind === 'course').length;
  const latestTerm = categoryGroups.find((group) => group.kind === 'course')?.label ?? 'Fall 2026';

  const openCategory = (key: string | null) => {
    setActiveCategory(key);
    if (key && view === 'overview') setView('courses');
  };

  const changeGroupMode = (mode: GroupMode) => {
    setGroupMode(mode);
    setActiveCategory(null);
    setSelectedCourse(null);
  };

  const changeView = (next: View) => {
    setView(next);
    setSelectedCourse(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openCourse = (course: Course) => {
    setSelectedCourse(course);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectedInfo = selectedCourse ? describeCourse(selectedCourse) : null;

  const title = selectedCourse ? selectedCourse.name : VIEW_COPY[view].title;
  const subtitle = selectedCourse
    ? `${selectedCourse.code || 'D2L'} · ${selectedInfo?.termLabel ?? ''}`.trim()
    : view === 'overview'
      ? `${longDate()} · ${connected ? 'Synced with D2L' : 'Not connected'}`
      : view === 'courses'
        ? `${courses.length} ${courses.length === 1 ? 'enrollment' : 'enrollments'} · ${hostLabel(baseUrl)}`
        : VIEW_COPY[view].subtitle;

  const heroSummary =
    courses.length === 0
      ? 'Connect your D2L account to pull in your courses and due dates.'
      : `${courseCount} active ${courseCount === 1 ? 'course' : 'courses'} · ${latestTerm} · ${
          dueSoon === 0 ? 'nothing in the next two weeks' : `${dueSoon} ${dueSoon === 1 ? 'item' : 'items'} in the next two weeks`
        }`;

  return (
    <div className="min-h-screen">
      <Backdrop preferences={prefs} />

      <Sidebar
        view={view}
        onView={changeView}
        groups={categoryGroups}
        groupMode={groupMode}
        activeCategory={activeCategory}
        onCategory={openCategory}
        totalCourses={courses.length}
        connected={connected}
        userName={userName}
        baseUrl={baseUrl}
        onManage={() => setDialogOpen(true)}
        showExamBank={prefs.examBank}
      />

      <div className="lg:pl-[264px]">
        <TopBar
          view={view}
          onView={changeView}
          title={title}
          subtitle={subtitle}
          query={query}
          onQuery={(value) => {
            setQuery(value);
            if (value.trim()) setActiveCategory(null);
          }}
          onRefresh={() => void refresh()}
          refreshing={refreshing}
          connected={connected}
          onManage={() => setDialogOpen(true)}
          onSettings={() => {
            setSettingsTab('connections');
            setSettingsOpen(true);
          }}
          showSearch={!selectedCourse && (view === 'overview' || view === 'courses')}
          showExamBank={prefs.examBank}
        />

        <main className="mx-auto w-full max-w-[1280px] px-5 pb-16 pt-6 sm:px-7">
          {dashboard?.notice && connected && view !== 'overview' && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-300" />
              <p className="flex-1 text-[12px] leading-relaxed text-amber-100/85">{dashboard.notice}</p>
              {!connected && (
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="focus-ring shrink-0 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-100 transition hover:bg-amber-400/20"
                >
                  Connect D2L
                </button>
              )}
            </div>
          )}

          {loading && !dashboard ? (
            <div className="space-y-4">
              <div className="panel h-[168px] animate-pulse" />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="panel h-[190px] animate-pulse" style={{ animationDelay: `${index * 80}ms` }} />
                ))}
              </div>
            </div>
          ) : selectedCourse ? (
            <CoursePage course={selectedCourse} onBack={() => setSelectedCourse(null)} />
          ) : error && !dashboard ? (
            <div className="panel mx-auto mt-16 max-w-md px-6 py-10 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-400/20">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-display text-base font-semibold text-white">Can’t reach the local server</h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="focus-ring mx-auto mt-5 flex items-center gap-2 rounded-xl bg-white/[0.08] px-3.5 py-2 text-[12.5px] font-medium text-white transition hover:bg-white/[0.13]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </button>
            </div>
          ) : view === 'overview' ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_332px]">
              <div className="space-y-5">
                <section className="panel relative overflow-hidden px-5 py-6 sm:px-6">
                  <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-violet-500/[0.16] blur-3xl" />
                  <div className="pointer-events-none absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-sky-400/[0.08] blur-3xl" />
                  <div className="relative">
                    <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.22em] text-slate-500">
                      <span className="h-1 w-1 rounded-full bg-violet-400" />
                      {longDate()}
                    </div>
                    <h2 className="mt-2 font-display text-[27px] font-semibold leading-tight tracking-tight text-white sm:text-[30px]">
                      {greeting()}
                      {userName ? `, ${userName.split(' ')[0]}` : ''}
                      <span className="text-violet-400">.</span>
                    </h2>
                    <p className="mt-2 max-w-[520px] text-[12.5px] leading-relaxed text-slate-400">{heroSummary}</p>

                    <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      <StatTile icon={BookOpen} label="Courses" value={courseCount} />
                      <StatTile icon={Sparkles} label="Subjects" value={subjectCount} />
                      <StatTile icon={CalendarClock} label="Next 14 days" value={dueSoon} />
                    </div>
                  </div>
                </section>

                {dashboard?.notice && (connected || courses.length > 0) && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
                    <Sparkles className="h-4 w-4 shrink-0 text-amber-300" />
                    <p className="flex-1 text-[12px] leading-relaxed text-amber-100/85">{dashboard.notice}</p>
                    <button
                      type="button"
                      onClick={() => setDialogOpen(true)}
                      className="focus-ring shrink-0 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-100 transition hover:bg-amber-400/20"
                    >
                      {connected ? 'Manage session' : 'Connect D2L'}
                    </button>
                  </div>
                )}

                {courses.length === 0 ? (
                  <ConnectPrompt
                    icon={GraduationCap}
                    title="Connect your D2L account"
                    body="Your courses, due dates and course files come straight from D2L. Nothing is shown until you sign in — no placeholder courses."
                    actionLabel="Connect D2L"
                    onAction={() => setDialogOpen(true)}
                    note="Your password stays in the D2L sign-in window; this app only keeps the session cookie."
                  />
                ) : (
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <h2 className="font-display text-[15px] font-semibold tracking-tight text-white">Your courses</h2>
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-slate-400">
                      {filteredCourses.length}
                    </span>
                    <div className="ml-auto">
                      <GroupToggle mode={groupMode} onChange={changeGroupMode} />
                    </div>
                  </div>

                  {activeCategory && (
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-500/[0.1] px-2.5 py-1 text-[11px] text-violet-200">
                        {categoryGroups.find((group) => group.key === activeCategory)?.label ?? activeCategory}
                        <button
                          type="button"
                          onClick={() => setActiveCategory(null)}
                          aria-label="Clear category filter"
                          className="focus-ring rounded-full p-0.5 hover:bg-white/10"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    </div>
                  )}

                  <CourseSections
                    groups={groupedCourses}
                    emptyMessage="No courses match that search yet."
                    preview={dashboard?.source === 'sample'}
                    onOpen={openCourse}
                  />
                </div>
                )}
              </div>

              <RightRail
                events={events}
                connected={connected}
                baseUrl={baseUrl}
                savedAt={appState?.savedAt ?? null}
                fetchedAt={dashboard?.fetchedAt ?? new Date().toISOString()}
                onViewCalendar={() => changeView('calendar')}
                onManage={() => setDialogOpen(true)}
                onRefresh={() => void refresh()}
                refreshing={refreshing}
              />
            </div>
          ) : view === 'courses' ? (
            courses.length === 0 ? (
              <ConnectPrompt
                icon={GraduationCap}
                title="No courses yet"
                body="Connect D2L and every course you are enrolled in lands here, grouped by term or subject."
                actionLabel="Connect D2L"
                onAction={() => setDialogOpen(true)}
              />
            ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-[19px] font-semibold tracking-tight text-white">Course library</h2>
                  <p className="mt-1 text-[12.5px] text-slate-500">
                    {filteredCourses.length} of {courses.length} enrollments · grouped by {groupMode}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {activeCategory && (
                    <button
                      type="button"
                      onClick={() => setActiveCategory(null)}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-500/[0.1] px-2.5 py-1 text-[11px] text-violet-200 hover:bg-violet-500/[0.16]"
                    >
                      {categoryGroups.find((group) => group.key === activeCategory)?.label ?? activeCategory}
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <GroupToggle mode={groupMode} onChange={changeGroupMode} />
                </div>
              </div>

              <CourseSections
                groups={groupedCourses}
                emptyMessage="No courses match that search yet."
                preview={dashboard?.source === 'sample'}
                onOpen={openCourse}
              />
            </div>
            )
          ) : view === 'calendar' ? (
            <CalendarView
              events={events}
              courses={courses}
              calendarConnected={calendarConnected || dashboard?.source === 'sample'}
              onConnectCalendar={() => {
                setSettingsTab('connections');
                setSettingsOpen(true);
              }}
              fetchedAt={dashboard?.fetchedAt ?? null}
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              onChanged={() => void load(true)}
              ai={appState?.ai ?? null}
              onOpenSettings={() => {
                setSettingsTab('ai');
                setSettingsOpen(true);
              }}
            />
          ) : view === 'study' ? (
            <StudyView
              events={events}
              courses={courses}
              ai={appState?.ai ?? null}
              onRefresh={() => void load(true)}
              onOpenSettings={() => {
                setSettingsTab('ai');
                setSettingsOpen(true);
              }}
            />
          ) : view === 'library' ? (
            <ContentSpace courses={courses} />
          ) : (
            <ExamBank banks={appState?.examBanks} />
          )}
        </main>
      </div>

      <ConnectDialog
        open={dialogOpen}
        state={appState}
        onClose={() => setDialogOpen(false)}
        onConnected={() => {
          setDialogOpen(false);
          void load(true);
        }}
        onDisconnected={() => {
          void load(true);
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        state={appState}
        preferences={prefs}
        initialTab={settingsTab}
        onPreferences={changePreferences}
        onClose={() => setSettingsOpen(false)}
        onOpenD2L={() => {
          setSettingsOpen(false);
          setDialogOpen(true);
        }}
        onSynced={() => void load(true)}
      />
    </div>
  );
}
