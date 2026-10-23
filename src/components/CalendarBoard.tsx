import { useMemo } from 'react';
import { ArrowUpRight, CalendarDays } from 'lucide-react';
import type { CalendarEvent } from '../../shared/types';
import {
  calendarRangeDates,
  dayKey,
  groupEventsByDay,
  isSameMonth,
  sourceKeyFor,
  type CalendarSourceKey,
} from '../lib/calendar';
import { courseShortCode, sourceLabel, timeLabel } from '../lib/format';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_CHIPS = 4;

interface SourceStyle {
  /** Small chip in the month grid */
  chip: string;
  /** Larger card in the 3-day board */
  card: string;
  time: string;
  dot: string;
}

const SOURCE_STYLES: Record<CalendarSourceKey, SourceStyle> = {
  d2l: {
    chip: 'border-violet-400/25 bg-violet-500/[0.18] text-violet-100 hover:bg-violet-500/[0.28]',
    card: 'border-violet-400/25 bg-violet-500/[0.12] text-violet-50 hover:bg-violet-500/[0.18]',
    time: 'text-violet-200/80',
    dot: 'bg-violet-300',
  },
  google: {
    chip: 'border-sky-400/25 bg-sky-500/[0.16] text-sky-100 hover:bg-sky-500/[0.26]',
    card: 'border-sky-400/25 bg-sky-500/[0.12] text-sky-50 hover:bg-sky-500/[0.18]',
    time: 'text-sky-200/80',
    dot: 'bg-sky-300',
  },
  notion: {
    chip: 'border-slate-300/20 bg-slate-200/[0.1] text-slate-100 hover:bg-slate-200/[0.17]',
    card: 'border-slate-300/20 bg-slate-200/[0.08] text-slate-50 hover:bg-slate-200/[0.13]',
    time: 'text-slate-300/80',
    dot: 'bg-slate-200',
  },
};

function styleFor(event: CalendarEvent): SourceStyle {
  return SOURCE_STYLES[sourceKeyFor(event)];
}

/** An event without a link still opens the edit dialog for these sources. */
function actionable(event: CalendarEvent): boolean {
  return (
    Boolean(event.url) ||
    event.source === 'local' ||
    event.source === 'form' ||
    event.source === 'google'
  );
}

interface BoardProps {
  events: CalendarEvent[];
  today: Date;
  onPickDay: (date: Date) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}

interface MonthBoardProps extends BoardProps {
  anchor: Date;
}

export type CalendarBoardProps =
  | (MonthBoardProps & { mode?: 'month' })
  | (MultiDayBoardProps & { mode: 'three-days' })
  | (DayBoardProps & { mode: 'day' });

/** Picks the board that matches the Calendar tab's current range. */
export function CalendarBoard(props: CalendarBoardProps) {
  if (props.mode === 'three-days') return <MultiDayBoard {...props} />;
  if (props.mode === 'day') return <DayBoard {...props} />;
  return <MonthBoard {...props} />;
}

/** Google-style month grid with a coloured chip per event. */
export function MonthBoard({ events, anchor, today, onPickDay, onOpenEvent }: MonthBoardProps) {
  const dates = useMemo(() => calendarRangeDates('month', anchor), [anchor]);
  const byDay = useMemo(() => groupEventsByDay(events), [events]);
  const todayKey = dayKey(today);

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-white/[0.06] bg-white/[0.015]">
        {WEEKDAYS.map((label) => (
          <div
            key={label}
            className="py-1.5 text-center text-[9.5px] font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {dates.map((date, index) => {
          const key = dayKey(date);
          const inMonth = isSameMonth(date, anchor);
          const isToday = key === todayKey;
          const dayEvents = byDay.get(key) ?? [];
          const shown = dayEvents.slice(0, MONTH_CHIPS);
          const overflow = dayEvents.length - shown.length;

          return (
            <div
              key={key}
              onClick={() => onPickDay(date)}
              className={`group min-h-[118px] cursor-pointer border-b border-white/[0.055] px-1.5 pb-1.5 pt-1 transition ${
                index % 7 === 6 ? '' : 'border-r'
              } ${inMonth ? 'bg-white/[0.012] hover:bg-white/[0.03]' : 'hover:bg-white/[0.02]'}`}
            >
              <div className="mb-1 flex justify-center">
                <button
                  type="button"
                  onClick={(mouse) => {
                    mouse.stopPropagation();
                    onPickDay(date);
                  }}
                  aria-label={`Open ${date.toLocaleDateString('en-CA', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}`}
                  className={`focus-ring grid h-6 min-w-6 place-items-center rounded-full px-1 text-[11px] font-medium tabular-nums transition ${
                    isToday
                      ? 'bg-white text-slate-900 hover:bg-slate-200'
                      : inMonth
                        ? 'text-slate-300 hover:bg-white/[0.08] group-hover:text-white'
                        : 'text-slate-600 hover:bg-white/[0.06]'
                  }`}
                >
                  {date.getDate()}
                </button>
              </div>

              <div className="space-y-1">
                {shown.map((event) => {
                  const style = styleFor(event);
                  const label = event.title;
                  const tip = [event.title, timeLabel(event.startsAt), event.location]
                    .filter(Boolean)
                    .join(' · ');

                  if (!actionable(event)) {
                    return (
                      <div
                        key={event.id}
                        title={tip}
                        className={`truncate rounded-[4px] border px-1.5 py-[2px] text-[10.5px] font-medium leading-[1.35] ${style.chip} ${
                          inMonth ? '' : 'opacity-45'
                        }`}
                      >
                        {label}
                      </div>
                    );
                  }

                  return (
                    <button
                      key={event.id}
                      type="button"
                      title={tip}
                      onClick={(mouse) => {
                        mouse.stopPropagation();
                        onOpenEvent(event);
                      }}
                      className={`focus-ring block w-full truncate rounded-[4px] border px-1.5 py-[2px] text-left text-[10.5px] font-medium leading-[1.35] transition ${style.chip} ${
                        inMonth ? '' : 'opacity-45'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {overflow > 0 && (
                <p className="mt-1 text-center text-[9.5px] text-slate-600">+{overflow} more</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MultiDayBoardProps extends BoardProps {
  dates: Date[];
}

/** Three side-by-side day columns, each card labelled with its time. */
export function MultiDayBoard({ dates, events, today, onPickDay, onOpenEvent }: MultiDayBoardProps) {
  const byDay = useMemo(() => groupEventsByDay(events), [events]);
  const todayKey = dayKey(today);

  return (
    <div className="grid gap-2 p-2 md:grid-cols-3">
      {dates.map((date) => {
        const key = dayKey(date);
        const isToday = key === todayKey;
        const dayEvents = byDay.get(key) ?? [];

        return (
          <div
            key={key}
            className="flex min-h-[220px] flex-col rounded-xl border border-white/[0.06] bg-white/[0.015] p-2"
          >
            <button
              type="button"
              onClick={() => onPickDay(date)}
              title={`Open ${date.toLocaleDateString('en-CA', { weekday: 'long' })}`}
              className="focus-ring mb-2 flex w-full items-center justify-center gap-2 rounded-lg py-1 transition hover:bg-white/[0.04]"
            >
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {date.toLocaleDateString('en-CA', { weekday: 'short' })}
              </span>
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-[12px] font-medium tabular-nums ${
                  isToday ? 'bg-white text-slate-900' : 'text-slate-300'
                }`}
              >
                {date.getDate()}
              </span>
            </button>

            {dayEvents.length === 0 ? (
              <p className="grid flex-1 place-items-center py-5 text-[11px] text-slate-600">
                Nothing scheduled
              </p>
            ) : (
              <div className="space-y-1.5">
                {dayEvents.map((event) => {
                  const style = styleFor(event);
                  const time = timeLabel(event.startsAt);
                  const content = (
                    <>
                      {time && (
                        <p className={`text-[9.5px] font-semibold ${style.time}`}>{time}</p>
                      )}
                      <p className="mt-0.5 line-clamp-2 text-[11.5px] font-medium leading-snug">
                        {event.title}
                      </p>
                      {event.location && (
                        <p className="mt-0.5 truncate text-[10px] opacity-60">{event.location}</p>
                      )}
                    </>
                  );

                  if (!actionable(event)) {
                    return (
                      <div
                        key={event.id}
                        className={`rounded-lg border px-2 py-1.5 ${style.card}`}
                      >
                        {content}
                      </div>
                    );
                  }

                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onOpenEvent(event)}
                      title={event.title}
                      className={`focus-ring block w-full rounded-lg border px-2 py-1.5 text-left transition ${style.card}`}
                    >
                      {content}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface DayBoardProps extends BoardProps {
  date: Date;
}

/** One day as a readable list, with the time and source of each event. */
export function DayBoard({ date, events, today, onOpenEvent }: DayBoardProps) {
  const dayEvents = useMemo(
    () => groupEventsByDay(events).get(dayKey(date)) ?? [],
    [events, date],
  );
  const isToday = dayKey(date) === dayKey(today);

  return (
    <div className="px-3 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {isToday ? 'Today' : date.toLocaleDateString('en-CA', { weekday: 'long' })} ·{' '}
          {date.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}
        </p>
        <p className="text-[10.5px] text-slate-600">
          {dayEvents.length} {dayEvents.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      {dayEvents.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-white/[0.08] bg-white/[0.015] px-6 py-12 text-center">
          <CalendarDays className="h-5 w-5 text-slate-600" />
          <p className="mt-3 text-[12.5px] font-medium text-slate-300">Nothing scheduled</p>
          <p className="mt-1 max-w-sm text-[11.5px] text-slate-600">
            No D2L, Google Calendar or Notion entries on{' '}
            {date.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015]">
          {dayEvents.map((event) => {
            const style = styleFor(event);
            const source = sourceLabel(event) ?? 'D2L';
            const course = courseShortCode(event.courseCode);
            const end = timeLabel(event.endsAt ?? null);
            const meta = [source, course, event.location].filter(Boolean).join(' · ');
            const body = (
              <>
                <div className="w-14 shrink-0 text-right">
                  <p className={`text-[11.5px] font-semibold tabular-nums ${style.time}`}>
                    {timeLabel(event.startsAt) || '—'}
                  </p>
                  {end && <p className="mt-0.5 text-[10px] tabular-nums text-slate-600">{end}</p>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-slate-100">{event.title}</p>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-[10.5px] text-slate-500">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                    <span className="truncate">{meta}</span>
                  </p>
                </div>
                {actionable(event) && (
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-600 transition group-hover:text-slate-300" />
                )}
              </>
            );

            if (!actionable(event)) {
              return (
                <div key={event.id} className="flex items-center gap-3 px-3 py-3">
                  {body}
                </div>
              );
            }

            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onOpenEvent(event)}
                className="focus-ring group flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-white/[0.03]"
              >
                {body}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
