import type { CalendarEvent } from '../../shared/types';

/** Height of one hour in the week grid, in pixels. */
export const HOUR_HEIGHT = 52;

/** The grid always shows at least a normal school day. */
const DEFAULT_START_MIN = 8 * 60;
const DEFAULT_END_MIN = 18 * 60;
const DAY_MS = 86_400_000;

export function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/** Weeks start on Sunday, like Google Calendar. */
export function startOfWeek(value: Date): Date {
  const day = startOfDay(value);
  day.setDate(day.getDate() - day.getDay());
  return day;
}

export function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => addDays(startOfDay(weekStart), index));
}

export function weekLabel(weekStart: Date): string {
  const start = startOfDay(weekStart);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const from = start.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  const to = end.toLocaleDateString('en-CA', sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
  return `${from} – ${to}, ${end.getFullYear()}`;
}

function compactTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const suffix = hours < 12 ? 'am' : 'pm';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}${minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`}${suffix}`;
}

/** "8 – 10am" for same-half-of-day blocks, "11am – 1pm" across noon. */
export function timeRangeLabel(startIso: string, endIso: string | null | undefined): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return '';
  const end = endIso ? new Date(endIso) : null;
  if (!end || Number.isNaN(end.getTime())) return compactTime(start);
  const sameHalf = start.getHours() < 12 === end.getHours() < 12;
  return `${sameHalf ? compactTime(start).replace(/(am|pm)$/, '') : compactTime(start)} – ${compactTime(end)}`;
}

/**
 * Minutes covered by a click-and-drag on the week grid. A drag upwards covers
 * the same span as the same drag downwards, and even the smallest drag keeps a
 * 30 minute block so a short movement still makes a usable event.
 */
export function dragRange(
  anchorMin: number,
  currentMin: number,
  endMin: number,
): { startMin: number; endMin: number } {
  const from = Math.min(anchorMin, currentMin);
  const to = Math.max(anchorMin, currentMin);
  const startMin = Math.max(0, Math.min(from, endMin - 30));
  const end = Math.min(endMin, Math.max(startMin + 30, to));
  return { startMin, endMin: end };
}

export function hourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export interface ScheduleBlock {
  event: CalendarEvent;
  startMin: number;
  endMin: number;
  /** Pixels from the top of the grid */
  top: number;
  height: number;
  /** Percent of the day column */
  leftPct: number;
  widthPct: number;
}

export interface WeekLayout {
  blocks: ScheduleBlock[];
  /** Minutes from midnight where the grid starts and ends */
  startMin: number;
  endMin: number;
  height: number;
}

interface Entry {
  event: CalendarEvent;
  dayIndex: number;
  startMin: number;
  endMin: number;
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Lay out timed events for the week containing `weekStart`. Overlapping blocks
 * are split into side-by-side columns so two classes at 10am stay readable.
 */
export function layoutWeek(events: CalendarEvent[], weekStart: Date): WeekLayout {
  const weekStartDay = startOfDay(weekStart).getTime();
  const entries: Entry[] = [];

  for (const event of events) {
    // Outline due dates belong in the deadline list, not as 30-minute blocks.
    if (!event.startsAt || !event.endsAt || event.hidden || event.source === 'form') continue;
    const start = new Date(event.startsAt);
    const end = new Date(event.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    const dayIndex = Math.round((startOfDay(start).getTime() - weekStartDay) / DAY_MS);
    if (dayIndex < 0 || dayIndex > 6) continue;

    let startMin = minutesOfDay(start);
    let endMin = minutesOfDay(end);
    if (end.getTime() <= start.getTime() || endMin <= startMin) endMin = startMin + 30;
    startMin = Math.max(0, Math.min(24 * 60 - 15, startMin));
    endMin = Math.min(24 * 60, Math.max(startMin + 15, endMin));
    entries.push({ event, dayIndex, startMin, endMin });
  }

  const startMin =
    entries.length === 0
      ? DEFAULT_START_MIN
      : Math.max(0, Math.min(DEFAULT_START_MIN, Math.floor(Math.min(...entries.map((e) => e.startMin)) / 60) * 60));
  const endMin =
    entries.length === 0
      ? DEFAULT_END_MIN
      : Math.min(24 * 60, Math.max(DEFAULT_END_MIN, Math.ceil(Math.max(...entries.map((e) => e.endMin)) / 60) * 60));

  const blocks: ScheduleBlock[] = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const dayEntries = entries
      .filter((entry) => entry.dayIndex === dayIndex)
      .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

    let cluster: Entry[] = [];
    let clusterEnd = -1;

    const flush = () => {
      if (cluster.length === 0) return;
      const columnEnds: number[] = [];
      const columns = new Map<Entry, number>();
      for (const entry of cluster) {
        let column = columnEnds.findIndex((endsAt) => endsAt <= entry.startMin);
        if (column === -1) {
          column = columnEnds.length;
          columnEnds.push(entry.endMin);
        } else {
          columnEnds[column] = entry.endMin;
        }
        columns.set(entry, column);
      }
      const totalColumns = Math.max(1, columnEnds.length);
      for (const entry of cluster) {
        const column = columns.get(entry) ?? 0;
        blocks.push({
          event: entry.event,
          startMin: entry.startMin,
          endMin: entry.endMin,
          top: ((entry.startMin - startMin) / 60) * HOUR_HEIGHT,
          height: Math.max(24, ((entry.endMin - entry.startMin) / 60) * HOUR_HEIGHT - 2),
          leftPct: (column / totalColumns) * 100,
          widthPct: 100 / totalColumns,
        });
      }
      cluster = [];
      clusterEnd = -1;
    };

    for (const entry of dayEntries) {
      if (cluster.length > 0 && entry.startMin >= clusterEnd) flush();
      cluster.push(entry);
      clusterEnd = Math.max(clusterEnd, entry.endMin);
    }
    flush();
  }

  return { blocks, startMin, endMin, height: ((endMin - startMin) / 60) * HOUR_HEIGHT };
}
