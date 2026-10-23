import type { CalendarEvent } from '../../shared/types';
import { addDays, startOfDay, startOfWeek, weekDays } from './schedule';

/** The view Google Calendar calls Day, 3 days, Week and Month. */
export type CalendarView = 'day' | 'three-days' | 'week' | 'month';

/** Sources the student can toggle in the Calendar tab. */
export type CalendarSourceKey = 'd2l' | 'google' | 'notion';

export const CALENDAR_VIEWS: ReadonlyArray<{ key: CalendarView; label: string }> = [
  { key: 'day', label: 'Day' },
  { key: 'three-days', label: '3 days' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

export const CALENDAR_SOURCES: ReadonlyArray<{ key: CalendarSourceKey; label: string }> = [
  { key: 'd2l', label: 'D2L' },
  { key: 'google', label: 'Google' },
  { key: 'notion', label: 'Notion' },
];

export function isCalendarView(value: unknown): value is CalendarView {
  return CALENDAR_VIEWS.some((view) => view.key === value);
}

export function isCalendarSourceKey(value: unknown): value is CalendarSourceKey {
  return CALENDAR_SOURCES.some((source) => source.key === value);
}

/** Imported outlines and events added in this app belong with D2L's work. */
export function sourceKeyFor(event: Pick<CalendarEvent, 'source'>): CalendarSourceKey {
  if (event.source === 'google') return 'google';
  if (event.source === 'notion') return 'notion';
  return 'd2l';
}

export function filterEventsBySource(
  events: CalendarEvent[],
  hidden: ReadonlySet<CalendarSourceKey>,
): CalendarEvent[] {
  if (hidden.size === 0) return events;
  return events.filter((event) => !hidden.has(sourceKeyFor(event)));
}

export function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * Every cell of the month grid: from the Sunday before the 1st to the Saturday
 * after the last day, so the result is always a whole number of weeks.
 */
export function monthGridDates(anchor: Date): Date[] {
  const first = startOfMonth(anchor);
  const start = addDays(first, -first.getDay());
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const end = addDays(last, 6 - last.getDay());

  const dates: Date[] = [];
  for (let date = start; date.getTime() <= end.getTime(); date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

/** The dates a range shows; week runs Sunday to Saturday like the grid. */
export function calendarRangeDates(view: CalendarView, anchor: Date): Date[] {
  switch (view) {
    case 'day':
      return [startOfDay(anchor)];
    case 'three-days':
      return [0, 1, 2].map((offset) => addDays(startOfDay(anchor), offset));
    case 'week':
      return weekDays(startOfWeek(anchor));
    default:
      return monthGridDates(anchor);
  }
}

/** Move the anchor one page of the current range forwards or backwards. */
export function shiftCalendarAnchor(view: CalendarView, anchor: Date, direction: number): Date {
  switch (view) {
    case 'day':
      return addDays(anchor, direction);
    case 'three-days':
      return addDays(anchor, 3 * direction);
    case 'week':
      return addDays(anchor, 7 * direction);
    default:
      return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  }
}

function formatDay(date: Date, withYear = false): string {
  return date.toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

export function calendarRangeTitle(
  view: CalendarView,
  anchor: Date,
  dates: Date[] = calendarRangeDates(view, anchor),
): string {
  if (view === 'month') {
    return anchor.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  }
  if (view === 'day') {
    return anchor.toLocaleDateString('en-CA', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first.getFullYear() !== last.getFullYear()) {
    return `${formatDay(first, true)} – ${formatDay(last, true)}`;
  }
  if (first.getMonth() !== last.getMonth()) {
    return `${formatDay(first)} – ${formatDay(last, true)}`;
  }
  return `${formatDay(first)} – ${last.getDate()}, ${last.getFullYear()}`;
}

/** Local calendar day key, e.g. 2026-10-22. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Events grouped under their local day, in time order. Hidden events and
 * entries without a parseable date are left out, since the grid cannot place
 * them.
 */
export function groupEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const sorted = [...events]
    .filter((event) => !event.hidden && Boolean(event.startsAt))
    .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime());

  const days = new Map<string, CalendarEvent[]>();
  for (const event of sorted) {
    const date = new Date(event.startsAt!);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(date);
    const list = days.get(key);
    if (list) list.push(event);
    else days.set(key, [event]);
  }
  return days;
}
