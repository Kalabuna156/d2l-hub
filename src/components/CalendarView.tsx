import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileUp,
  History,
  RefreshCw,
  ScanLine,
  Upload,
  X,
} from 'lucide-react';
import type { AiStatus, CalendarEvent, Course } from '../../shared/types';
import {
  CALENDAR_SOURCES,
  CALENDAR_VIEWS,
  calendarRangeDates,
  calendarRangeTitle,
  filterEventsBySource,
  isCalendarSourceKey,
  isCalendarView,
  shiftCalendarAnchor,
  type CalendarSourceKey,
  type CalendarView,
} from '../lib/calendar';
import {
  courseShortCode,
  groupEventsByMonth,
  isClassEvent,
  relativeLabel,
  shortDateParts,
  sourceLabel,
  syncTime,
  timeLabel,
  urgencyFor,
  urgencyStyles,
} from '../lib/format';
import { layoutWeek, startOfDay, startOfWeek } from '../lib/schedule';
import { AutoImportDialog } from './AutoImportDialog';
import { CalendarBoard } from './CalendarBoard';
import { CourseFormImport } from './CourseFormImport';
import { EventDialog, type EventDialogTarget } from './EventDialog';
import { ScheduleGrid } from './ScheduleGrid';

interface CalendarViewProps {
  events: CalendarEvent[];
  courses: Course[];
  /** True when Google Calendar or Notion is feeding events in. */
  calendarConnected: boolean;
  onConnectCalendar: () => void;
  fetchedAt: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  /** Reload after a drag moved an event. */
  onChanged?: () => void;
  ai: AiStatus | null;
  onOpenSettings: () => void;
}

const VIEW_KEY = 'd2lhub.calendar.view';
const HIDDEN_SOURCES_KEY = 'd2lhub.calendar.hiddenSources';

function storedView(): CalendarView {
  try {
    const value = typeof window === 'undefined' ? null : window.localStorage.getItem(VIEW_KEY);
    return isCalendarView(value) ? value : 'month';
  } catch {
    return 'month';
  }
}

function storedHiddenSources(): Set<CalendarSourceKey> {
  try {
    const raw =
      typeof window === 'undefined'
        ? null
        : window.localStorage.getItem(HIDDEN_SOURCES_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(isCalendarSourceKey));
  } catch {
    return new Set();
  }
}

const SOURCE_FILTER_STYLES: Record<CalendarSourceKey, { active: string; dot: string }> = {
  d2l: {
    active: 'border-violet-400/35 bg-violet-500/[0.14] text-violet-100',
    dot: 'bg-violet-300',
  },
  google: {
    active: 'border-sky-400/35 bg-sky-500/[0.14] text-sky-100',
    dot: 'bg-sky-300',
  },
  notion: {
    active: 'border-white/20 bg-white/[0.09] text-slate-100',
    dot: 'bg-slate-200',
  },
};

function EventRow({ event, onEdit }: { event: CalendarEvent; onEdit: (event: CalendarEvent) => void }) {
  const date = shortDateParts(event.startsAt);
  const course = courseShortCode(event.courseCode);
  const time = timeLabel(event.startsAt);
  const source = sourceLabel(event);
  const urgency = urgencyFor(event.startsAt);
  const tone = urgencyStyles(urgency);

  const chip =
    urgency === 'urgent'
      ? 'border-rose-400/35 bg-rose-500/[0.12]'
      : urgency === 'soon'
        ? 'border-amber-400/35 bg-amber-400/[0.1]'
        : 'border-white/[0.07] bg-white/[0.04]';
  const chipText =
    urgency === 'urgent' ? 'text-rose-200' : urgency === 'soon' ? 'text-amber-100' : 'text-slate-100';

  // An event this app owns opens for editing; anything else follows its link.
  const editable = event.source === 'local' || event.source === 'form';
  const rowClass = `focus-ring group flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-white/[0.03] ${tone.row}`;

  const body = (
    <>
      <div className={`grid w-11 shrink-0 place-items-center rounded-lg border py-1.5 leading-none ${chip}`}>
        <span className={`text-[9px] font-semibold tracking-[0.1em] ${chipText} opacity-70`}>{date.month}</span>
        <span className={`mt-0.5 font-display text-base font-semibold ${chipText}`}>{date.day}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[13.5px] font-medium transition group-hover:text-white ${tone.title}`}>
          {event.title}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          {time && (
            <span>
              {date.weekday} · {time}
            </span>
          )}
          {!time && event.whenLabel && <span>{event.whenLabel}</span>}
          {course && (
            <>
              <span className="text-slate-700">·</span>
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-400">
                {course}
              </span>
            </>
          )}
          {source && (
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-slate-400">
              {source}
            </span>
          )}
        </p>
      </div>
      <span
        className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-medium sm:block ${tone.chip}`}
      >
        {relativeLabel(event.startsAt)}
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:text-slate-300" />
    </>
  );

  if (editable) {
    return (
      <button type="button" onClick={() => onEdit(event)} className={rowClass}>
        {body}
      </button>
    );
  }

  return (
    <a href={event.url ?? undefined} target="_blank" rel="noreferrer" className={rowClass}>
      {body}
    </a>
  );
}

function MonthGroup({
  label,
  events,
  onEdit,
}: {
  label: string;
  events: CalendarEvent[];
  onEdit: (event: CalendarEvent) => void;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</h3>
        <div className="h-px flex-1 bg-gradient-to-r from-white/[0.07] to-transparent" />
      </div>
      <div className="panel divide-y divide-white/[0.055] overflow-hidden">
        {events.map((event) => (
          <EventRow key={event.id} event={event} onEdit={onEdit} />
        ))}
      </div>
    </section>
  );
}

export function CalendarView({
  events,
  courses,
  calendarConnected,
  onConnectCalendar,
  fetchedAt,
  refreshing,
  onRefresh,
  onChanged,
  ai,
  onOpenSettings,
}: CalendarViewProps) {
  const [showPast, setShowPast] = useState(false);
  const [dialog, setDialog] = useState<EventDialogTarget | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [view, setView] = useState<CalendarView>(storedView);
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [hiddenSources, setHiddenSources] =
    useState<Set<CalendarSourceKey>>(storedHiddenSources);

  const today = startOfDay(new Date());

  // The confirmation is useful for a moment, then it is just clutter.
  useEffect(() => {
    if (!importNote) return;
    const timer = window.setTimeout(() => setImportNote(null), 8000);
    return () => window.clearTimeout(timer);
  }, [importNote]);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Private mode or a full disk: the view still works for this session.
    }
  }, [view]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HIDDEN_SOURCES_KEY, JSON.stringify([...hiddenSources]));
    } catch {
      // Persisting the filters is a nicety, not a requirement.
    }
  }, [hiddenSources]);

  const filteredEvents = useMemo(
    () => filterEventsBySource(events, hiddenSources),
    [events, hiddenSources],
  );

  const rangeDates = useMemo(() => calendarRangeDates(view, anchor), [view, anchor]);
  const rangeTitle = useMemo(
    () => calendarRangeTitle(view, anchor, rangeDates),
    [view, anchor, rangeDates],
  );
  const gridWeek = useMemo(() => startOfWeek(anchor), [anchor]);

  const { upcoming, past, weekClasses, syncedCount } = useMemo(() => {
    const todayStart = startOfDay(new Date()).getTime();
    const deadlines = filteredEvents.filter((event) => !isClassEvent(event) && !event.hidden);
    return {
      upcoming: deadlines.filter(
        (event) => !event.startsAt || new Date(event.startsAt).getTime() >= todayStart,
      ),
      past: deadlines.filter(
        (event) => Boolean(event.startsAt) && new Date(event.startsAt!).getTime() < todayStart,
      ),
      weekClasses: layoutWeek(filteredEvents, startOfWeek(new Date())).blocks.length,
      syncedCount: filteredEvents.filter(
        (event) => event.source === 'google' || event.source === 'notion',
      ).length,
    };
  }, [filteredEvents]);

  const deadlineCount = upcoming.length + past.length;
  const summary = useMemo(() => {
    if (events.length === 0) {
      return 'No events yet. Connect a calendar or upload a course outline to put its due dates here.';
    }
    const parts = [
      deadlineCount > 0
        ? `${deadlineCount} ${deadlineCount === 1 ? 'deadline' : 'deadlines'}`
        : null,
      weekClasses > 0
        ? `${weekClasses} ${weekClasses === 1 ? 'class' : 'classes'} this week`
        : null,
    ].filter(Boolean) as string[];
    if (parts.length === 0) {
      parts.push(`${filteredEvents.length} ${filteredEvents.length === 1 ? 'event' : 'events'} showing`);
    }
    if (syncedCount > 0) parts.push('synced with your calendars');
    return `${parts.join(' · ')}.`;
  }, [events.length, deadlineCount, weekClasses, syncedCount, filteredEvents.length]);

  const openEvent = (event: CalendarEvent) => setDialog({ kind: 'event', event });

  /** Chips open the edit dialog for local and Google events, and follow the link otherwise. */
  const openBoardEvent = (event: CalendarEvent) => {
    if (
      event.source === 'local' ||
      event.source === 'form' ||
      event.source === 'google'
    ) {
      setDialog({ kind: 'event', event });
      return;
    }
    if (event.url) window.open(event.url, '_blank', 'noopener,noreferrer');
  };

  const shift = (direction: number) => {
    setAnchor((current) => shiftCalendarAnchor(view, current, direction));
  };

  const goToday = () => setAnchor(startOfDay(new Date()));

  const pickDay = (date: Date) => {
    setAnchor(date);
    setView('day');
  };

  const toggleSource = (source: CalendarSourceKey) => {
    setHiddenSources((current) => {
      const next = new Set(current);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  /** The toolbar's add button: the next half hour today, or 9am tomorrow. */
  const addDefault = () => {
    const now = new Date();
    const base = new Date(now);
    base.setSeconds(0, 0);
    if (now.getHours() >= 21) {
      base.setDate(base.getDate() + 1);
      base.setHours(9, 0, 0, 0);
    } else {
      base.setMinutes(now.getMinutes() < 30 ? 30 : 60);
    }
    setDialog({
      kind: 'create',
      startsAt: base.toISOString(),
      endsAt: new Date(base.getTime() + 60 * 60_000).toISOString(),
    });
  };

  const upcomingGroups = useMemo(() => groupEventsByMonth(upcoming), [upcoming]);
  const pastGroups = useMemo(() => groupEventsByMonth(past, 'desc'), [past]);
  const allSourcesHidden = hiddenSources.size === CALENDAR_SOURCES.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[19px] font-semibold tracking-tight text-white">Schedule</h2>
          <p className="mt-1 text-[12.5px] text-slate-500">{summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!calendarConnected && (
            <button
              type="button"
              onClick={onConnectCalendar}
              className="focus-ring flex h-8 items-center gap-1.5 rounded-lg border border-sky-400/25 bg-sky-500/[0.1] px-2.5 text-[11.5px] font-medium text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-500/[0.16]"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Connect calendar
            </button>
          )}
          <button
            type="button"
            onClick={() => setAutoOpen(true)}
            className="focus-ring flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2.5 text-[11.5px] font-medium text-slate-200 transition hover:border-violet-400/40 hover:bg-violet-500/[0.12] hover:text-violet-100"
          >
            <ScanLine className="h-3.5 w-3.5" />
            Auto-import
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="focus-ring flex h-8 items-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-500/[0.1] px-2.5 text-[11.5px] font-medium text-violet-100 transition hover:border-violet-400/40 hover:bg-violet-500/[0.16]"
          >
            <Upload className="h-3.5 w-3.5" />
            Import outline
          </button>
          <span className="hidden items-center gap-1.5 text-[10.5px] text-slate-500 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            due in 3 days
            <span className="ml-2 h-1.5 w-1.5 rounded-full bg-amber-300" />
            due this week
          </span>
        </div>
      </div>

      {importNote && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.07] px-3.5 py-2.5 text-[12px] text-emerald-100/90">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="flex-1 leading-relaxed">{importNote}</p>
          <button
            type="button"
            onClick={() => setImportNote(null)}
            aria-label="Dismiss"
            className="focus-ring rounded-md p-0.5 text-emerald-200/60 transition hover:bg-white/10 hover:text-emerald-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {events.length === 0 ? (
        <div className="panel grid place-items-center px-6 py-16 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.04] text-slate-500 ring-1 ring-inset ring-white/[0.07]">
            <CalendarDays className="h-5 w-5" />
          </span>
          <p className="mt-4 text-sm font-medium text-slate-300">Your calendar is clear</p>
          <p className="mt-1 max-w-sm text-[12px] text-slate-600">
            Once D2L reports due dates, quizzes or course events, they will be listed here by month.
            Connect Google Calendar or Notion to bring in the events you already plan, or upload a
            course outline and its schedule comes in automatically.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {!calendarConnected && (
              <button
                type="button"
                onClick={onConnectCalendar}
                className="focus-ring flex h-9 items-center gap-1.5 rounded-lg border border-sky-400/25 bg-sky-500/[0.1] px-3 text-[12px] font-medium text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-500/[0.16]"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Connect calendar
              </button>
            )}
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="focus-ring flex h-9 items-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-500/[0.1] px-3 text-[12px] font-medium text-violet-100 transition hover:border-violet-400/40 hover:bg-violet-500/[0.16]"
            >
              <FileUp className="h-3.5 w-3.5" />
              Upload a course outline
            </button>
            <button
              type="button"
              onClick={() => setAutoOpen(true)}
              className="focus-ring flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 text-[12px] font-medium text-slate-200 transition hover:border-violet-400/40 hover:bg-violet-500/[0.12] hover:text-violet-100"
            >
              <ScanLine className="h-3.5 w-3.5" />
              Scan my courses
            </button>
            <button
              type="button"
              onClick={addDefault}
              className="focus-ring flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 text-[12px] font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              New event
            </button>
          </div>
        </div>
      ) : (
        <>
          <section className="panel overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-white/[0.06] px-3 py-2.5">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => shift(-1)}
                  aria-label="Previous range"
                  title="Previous"
                  className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.07] hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => shift(1)}
                  aria-label="Next range"
                  title="Next"
                  className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.07] hover:text-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={goToday}
                className="focus-ring h-7 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
              >
                Today
              </button>

              <h3 className="min-w-0 truncate font-display text-[14px] font-semibold tracking-tight text-white">
                {rangeTitle}
              </h3>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
                  {CALENDAR_VIEWS.map((option) => {
                    const selected = option.key === view;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setView(option.key)}
                        aria-pressed={selected}
                        className={`focus-ring rounded-md px-2 py-1 text-[10.5px] font-medium transition ${
                          selected
                            ? 'bg-violet-500/[0.22] text-violet-100 shadow-sm shadow-black/20'
                            : 'text-slate-500 hover:bg-white/[0.07] hover:text-slate-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={refreshing}
                  aria-label="Sync calendars now"
                  title="Sync calendars now"
                  className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-slate-200 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={addDefault}
                  aria-label="Add event"
                  title="Add an event"
                  className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-slate-200"
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.06] px-3 py-2">
              {CALENDAR_SOURCES.map((source) => {
                const enabled = !hiddenSources.has(source.key);
                const styles = SOURCE_FILTER_STYLES[source.key];
                return (
                  <button
                    key={source.key}
                    type="button"
                    onClick={() => toggleSource(source.key)}
                    aria-pressed={enabled}
                    title={
                      enabled
                        ? `Hide ${source.label} events`
                        : `Show ${source.label} events`
                    }
                    className={`focus-ring flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[10.5px] font-medium transition ${
                      enabled
                        ? styles.active
                        : 'border-white/[0.07] bg-white/[0.02] text-slate-500 hover:border-white/15 hover:text-slate-300'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${enabled ? styles.dot : 'bg-slate-600'}`}
                    />
                    {source.label}
                    {enabled && <span className="text-[9px] font-bold opacity-80">✓</span>}
                  </button>
                );
              })}

              <span className="ml-auto hidden items-center gap-1 text-[10.5px] text-slate-600 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
                Updated {syncTime(fetchedAt)}
              </span>
            </div>

            {allSourcesHidden && (
              <div className="border-b border-amber-400/20 bg-amber-500/[0.07] px-3 py-2 text-[11.5px] text-amber-100/90">
                All three sources are hidden. Turn one back on above to see its events.
              </div>
            )}

            {view === 'month' ? (
              <CalendarBoard
                anchor={anchor}
                events={filteredEvents}
                today={today}
                onPickDay={pickDay}
                onOpenEvent={openBoardEvent}
              />
            ) : view === 'week' ? (
              <ScheduleGrid
                embedded
                weekStart={gridWeek}
                events={filteredEvents}
                fetchedAt={fetchedAt}
                refreshing={refreshing}
                onRefresh={onRefresh}
                onEdit={openEvent}
                onCreate={(startsAt, endsAt) => setDialog({ kind: 'create', startsAt, endsAt })}
                onMoved={onChanged}
              />
            ) : view === 'three-days' ? (
              <CalendarBoard
                mode="three-days"
                dates={rangeDates}
                events={filteredEvents}
                today={today}
                onPickDay={pickDay}
                onOpenEvent={openBoardEvent}
              />
            ) : (
              <CalendarBoard
                mode="day"
                date={anchor}
                events={filteredEvents}
                today={today}
                onPickDay={pickDay}
                onOpenEvent={openBoardEvent}
              />
            )}

            <p className="border-t border-white/[0.06] px-3 py-2 text-[10.5px] text-slate-600">
              {view === 'month'
                ? 'Click a day for its full list · click an event to open it.'
                : view === 'week'
                  ? 'Click or drag free space to add an event · drag a class to move it.'
                  : view === 'three-days'
                    ? 'Click a day header for its full list.'
                    : 'Times are shown in your local timezone.'}
            </p>
          </section>

          {(upcomingGroups.length > 0 || past.length > 0) && (
            <div className="space-y-7">
              <div>
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className="font-display text-[15px] font-semibold tracking-tight text-white">Upcoming</h2>
                  <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-slate-400">
                    {upcoming.length}
                  </span>
                </div>
                {upcomingGroups.length === 0 ? (
                  <p className="panel px-4 py-6 text-center text-[12px] text-slate-500">
                    Nothing due from here on — the past is tucked away below.
                  </p>
                ) : (
                  <div className="space-y-7">
                    {upcomingGroups.map((group) => (
                      <MonthGroup
                        key={group.label}
                        label={group.label}
                        events={group.events}
                        onEdit={openEvent}
                      />
                    ))}
                  </div>
                )}
              </div>

              {past.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowPast((value) => !value)}
                    aria-expanded={showPast}
                    className="focus-ring flex w-full items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-left transition hover:border-white/[0.1] hover:bg-white/[0.04]"
                  >
                    <History className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-[12.5px] font-medium text-slate-300">
                      Older dates
                      <span className="ml-1.5 font-normal text-slate-500">· {past.length} past</span>
                    </span>
                    <span className="ml-auto text-[10.5px] text-slate-500">{showPast ? 'Hide' : 'Show'}</span>
                    <ChevronRight
                      className={`h-4 w-4 text-slate-500 transition ${showPast ? 'rotate-90' : ''}`}
                    />
                  </button>

                  {showPast && (
                    <div className="mt-5 space-y-7">
                      {pastGroups.map((group) => (
                        <MonthGroup
                          key={group.label}
                          label={group.label}
                          events={group.events}
                          onEdit={openEvent}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <EventDialog
        target={dialog}
        onClose={() => setDialog(null)}
        onSaved={() => {
          setDialog(null);
          onRefresh();
        }}
      />

      <AutoImportDialog
        open={autoOpen}
        ai={ai}
        onClose={() => setAutoOpen(false)}
        onOpenSettings={onOpenSettings}
        onImported={({ added, skipped }) => {
          setAutoOpen(false);
          setImportNote(
            added === 0
              ? 'Nothing new to add — those dates are already on your calendar.'
              : `Added ${added} ${added === 1 ? 'date' : 'dates'} from your outlines${
                  skipped > 0 ? ` · ${skipped} already there` : ''
                }.`,
          );
          onRefresh();
        }}
      />

      <CourseFormImport
        open={importOpen}
        courses={courses}
        onClose={() => setImportOpen(false)}
        onImported={({ added, skipped }) => {
          setImportOpen(false);
          setImportNote(
            added === 0
              ? 'Nothing new to add — those dates are already on your calendar.'
              : `Added ${added} ${added === 1 ? 'date' : 'dates'} to your calendar${
                  skipped > 0 ? ` · ${skipped} already there` : ''
                }.`,
          );
          onRefresh();
        }}
      />
    </div>
  );
}
