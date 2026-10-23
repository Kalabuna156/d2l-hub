import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, GraduationCap, RefreshCw, Sparkles, X } from 'lucide-react';
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
import { DueSoon } from './components/DueSoon';
import { RightRail } from './components/RightRail';
import { SessionBar } from './components/SessionBar';
import { SettingsDialog } from './components/SettingsDialog';
import { Sidebar } from './components/Sidebar';
import { StudyView } from './components/StudyView';
import { TodaySchedule } from './components/TodaySchedule';
import { TopBar } from './components/TopBar';
import { fetchDashboard, fetchState, savePreferences, syncIntegrations } from './lib/api';
import { greeting, hostLabel, isClassEvent, longDate } from './lib/format';
import { applyPreferences, DEFAULT_PREFERENCES, normalizePreferences } from './lib/preferences';
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
    <div className="seg">
      {(['term', 'subject'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          data-active={mode === option}
          aria-pressed={mode === option}
          className="seg-item focus-ring capitalize"
        >
          {option}
        </button>
      ))}
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
  // Which overview arrangement this launch is using. Settings stores the
  // choice, but it is only read once here: swapping the page out from under
  // someone mid-session is worse than asking them to restart.
  const [bootOverview, setBootOverview] = useState<boolean | null>(null);
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

  const prefs = useMemo(() => normalizePreferences(preferences), [preferences]);
  const newOverview = bootOverview ?? DEFAULT_PREFERENCES.newOverview;

  useEffect(() => {
    if (preferences && bootOverview === null) setBootOverview(normalizePreferences(preferences).newOverview);
  }, [preferences, bootOverview]);

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

  // Save the pending layout choice before the window reloads, so the next
  // launch reads what the user just picked.
  const restart = useCallback(async () => {
    try {
      await savePreferences(prefs);
    } catch {
      // The reload still gets the choice from the debounced save above.
    }
    window.location.reload();
  }, [prefs]);

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

        <main className="mx-auto w-full max-w-[1280px] px-5 pb-20 pt-6 sm:px-7 sm:pt-7">
          {dashboard?.notice && connected && view !== 'overview' && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[14px] border border-amber-400/20 bg-amber-400/[0.055] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] border border-amber-400/25 bg-amber-400/[0.1] text-amber-300">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.9} />
              </span>
              <p className="flex-1 text-[12px] leading-relaxed text-amber-100/85">{dashboard.notice}</p>
              {!connected && (
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="focus-ring shrink-0 rounded-[9px] border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-100 transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-amber-400/20 active:scale-[0.985]"
                >
                  Connect D2L
                </button>
              )}
            </div>
          )}

          {loading && !dashboard ? (
            <div className="space-y-4">
              <div className="panel h-[176px] animate-soft-pulse" />
              <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="panel h-[186px] animate-soft-pulse"
                    style={{ animationDelay: `${index * 90}ms` }}
                  />
                ))}
              </div>
            </div>
          ) : selectedCourse ? (
            <CoursePage course={selectedCourse} onBack={() => setSelectedCourse(null)} />
          ) : error && !dashboard ? (
            <div className="panel mx-auto mt-16 max-w-md px-6 py-10 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-[13px] border border-rose-400/25 bg-rose-500/[0.1] text-rose-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <AlertTriangle className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <h2 className="mt-4 font-display text-[15px] font-semibold tracking-[-0.02em] text-ink-1">
                Can’t reach the local server
              </h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">{error}</p>
              <button type="button" onClick={() => void load()} className="btn focus-ring mx-auto mt-5">
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </button>
            </div>
          ) : view === 'overview' ? (
            // Two arrangements for one screen: the new stacked overview, or the
            // classic two-column layout with Up next and Session in a rail.
            <div
              className={
                newOverview ? 'space-y-5' : 'grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_332px]'
              }
            >
              <div className="min-w-0 space-y-5">
              {/* Greeting and the three numbers worth knowing. Deliberately
                  short: the work and the courses below are what the page is
                  for, and both should be visible without scrolling. */}
              <section className="panel relative overflow-hidden px-5 py-5 sm:px-6">
                {/* The hero is the one place the accent is allowed to bloom. */}
                <div
                  className="pointer-events-none absolute -right-10 -top-24 h-[300px] w-[300px] rounded-full blur-[80px]"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-violet-500) 26%, transparent)' }}
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(104deg, transparent 46%, color-mix(in srgb, var(--color-violet-500) 8%, transparent) 100%)',
                  }}
                />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <div className="relative flex flex-wrap items-center justify-between gap-x-10 gap-y-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-ink-4">
                      <span className="h-1 w-1 rounded-full bg-violet-400 shadow-[0_0_8px_1px_rgba(139,125,255,0.8)]" />
                      {longDate()}
                    </div>
                    <h2 className="mt-2 font-display text-[24px] font-semibold leading-[1.14] tracking-[-0.028em] text-ink-1">
                      {greeting()}
                      {userName ? `, ${userName.split(' ')[0]}` : ''}
                      <span className="text-violet-400 [text-shadow:0_0_22px_rgba(139,125,255,0.55)]">.</span>
                    </h2>
                    <p className="mt-1.5 max-w-[560px] text-[12px] leading-relaxed text-ink-3">{heroSummary}</p>
                  </div>

                  <dl className="flex items-stretch">
                    {[
                      { label: 'Courses', value: courseCount },
                      { label: 'Subjects', value: subjectCount },
                      { label: 'Due in 14 days', value: dueSoon },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="border-l border-line px-5 first:border-l-0 first:pl-0 last:pr-0"
                      >
                        <dt className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                          {stat.label}
                        </dt>
                        <dd className="mt-1 font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink-1 tabular-nums">
                          {stat.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>

                {dashboard?.notice && (connected || courses.length > 0) && (
                  <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-amber-400/20 bg-amber-400/[0.055] px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] border border-amber-400/25 bg-amber-400/[0.1] text-amber-300">
                      <Sparkles className="h-3.5 w-3.5" strokeWidth={1.9} />
                    </span>
                    <p className="flex-1 text-[12px] leading-relaxed text-amber-100/85">{dashboard.notice}</p>
                    <button
                      type="button"
                      onClick={() => setDialogOpen(true)}
                      className="focus-ring shrink-0 rounded-[9px] border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-100 transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-amber-400/20 active:scale-[0.985]"
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
                <>
                  {/* Work beside the day: the two things the overview is opened
                      for, both above the course grid. The classic layout puts
                      them in the right rail instead. */}
                  {newOverview && (
                    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_332px]">
                      <DueSoon events={events} connected={connected} onViewCalendar={() => changeView('calendar')} />
                      <TodaySchedule events={events} onEdit={() => changeView('calendar')} />
                    </div>
                  )}

                <div>
                  <div className="mb-3 flex items-center gap-2.5">
                    <h2 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-ink-1">
                      Your courses
                    </h2>
                    <span className="chip font-mono tabular-nums">{filteredCourses.length}</span>
                    <div className="ml-auto">
                      <GroupToggle mode={groupMode} onChange={changeGroupMode} />
                    </div>
                  </div>

                  {activeCategory && (
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/[0.13] px-2.5 py-1 text-[11px] text-violet-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
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

                  {newOverview && (
                    <SessionBar
                      connected={connected}
                      baseUrl={baseUrl}
                      savedAt={appState?.savedAt ?? null}
                      fetchedAt={dashboard?.fetchedAt ?? new Date().toISOString()}
                      onManage={() => setDialogOpen(true)}
                      onRefresh={() => void refresh()}
                      refreshing={refreshing}
                    />
                  )}
                </>
                )}
              </div>

              {!newOverview && (
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
              )}
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
                  <h2 className="font-display text-[20px] font-semibold tracking-[-0.026em] text-ink-1">Course library</h2>
                  <p className="mt-1 text-[12px] text-ink-3">
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
            <ContentSpace
              courses={courses}
              ai={appState?.ai ?? null}
              onOpenSettings={() => {
                setSettingsTab('ai');
                setSettingsOpen(true);
              }}
            />
          ) : (
            <ExamBank
              banks={appState?.examBanks}
              ai={appState?.ai ?? null}
              onOpenSettings={() => {
                setSettingsTab('ai');
                setSettingsOpen(true);
              }}
            />
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
        activeOverview={newOverview}
        initialTab={settingsTab}
        onPreferences={changePreferences}
        onRestart={() => void restart()}
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
