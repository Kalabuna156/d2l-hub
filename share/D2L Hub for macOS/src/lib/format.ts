import type { CalendarEvent, EventSource } from '../../shared/types';

/** Short badge for events that came from a synced calendar; null for D2L. */
export function sourceLabel(event: { source?: EventSource; calendarName?: string | null }): string | null {
  if (!event.source || event.source === 'd2l') return null;
  if (event.source === 'local') return 'Added';
  if (event.source === 'form') return 'Outline';
  return event.source === 'google' ? 'GCal' : 'Notion';
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function longDate(now = new Date()): string {
  return now.toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function shortDateParts(iso: string | null): { month: string; day: string; weekday: string } {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return { month: 'TBD', day: '—', weekday: '' };
  }
  return {
    month: date.toLocaleDateString('en-CA', { month: 'short' }).toUpperCase(),
    day: date.toLocaleDateString('en-CA', { day: 'numeric' }),
    weekday: date.toLocaleDateString('en-CA', { weekday: 'short' }),
  };
}

export function timeLabel(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

export function relativeLabel(iso: string | null): string {
  if (!iso) return 'No date';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'No date';

  const now = new Date();
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);

  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Tomorrow';
  if (dayDiff === -1) return 'Yesterday';
  if (dayDiff > 1 && dayDiff < 7) return `In ${dayDiff} days`;
  if (dayDiff >= 7 && dayDiff < 14) return 'Next week';
  if (dayDiff >= 14) return `In ${Math.round(dayDiff / 7)} weeks`;
  if (dayDiff < -1) return `${Math.abs(dayDiff)} days ago`;
  return '';
}

/** Timed calendar entries are weekly class blocks; everything else is a deadline. */
export function isClassEvent(event: CalendarEvent): boolean {
  // A date imported from an outline is a deadline that happens to have a time,
  // not a weekly class block.
  if (event.source === 'form') return false;
  return Boolean(event.startsAt && event.endsAt);
}

export type Urgency = 'urgent' | 'soon' | null;

/** Red when something is due within 3 days, amber within the week after that. */
export function urgencyFor(iso: string | null | undefined, now = new Date()): Urgency {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round((day(date) - day(now)) / 86_400_000);
  if (dayDiff < 0) return null;
  if (dayDiff <= 3) return 'urgent';
  if (dayDiff <= 7) return 'soon';
  return null;
}

export interface UrgencyStyles {
  /** Relative-time pill */
  chip: string;
  /** Event title colour */
  title: string;
  /** Row tint: a coloured left edge, transparent when neutral */
  row: string;
  /** Small trailing dot in the date chip */
  dot: string;
}

const NEUTRAL_STYLES: UrgencyStyles = {
  chip: 'bg-white/[0.05] text-slate-400',
  title: 'text-slate-200',
  row: 'border-l-2 border-l-transparent',
  dot: 'bg-slate-500',
};

export function urgencyStyles(urgency: Urgency): UrgencyStyles {
  if (urgency === 'urgent') {
    return {
      chip: 'bg-rose-500/15 text-rose-200 ring-1 ring-inset ring-rose-400/30',
      title: 'text-rose-100',
      row: 'border-l-2 border-l-rose-500/70',
      dot: 'bg-rose-400',
    };
  }
  if (urgency === 'soon') {
    return {
      chip: 'bg-amber-400/15 text-amber-100 ring-1 ring-inset ring-amber-400/30',
      title: 'text-amber-50',
      row: 'border-l-2 border-l-amber-400/70',
      dot: 'bg-amber-300',
    };
  }
  return NEUTRAL_STYLES;
}

export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (!a.startsAt && !b.startsAt) return a.title.localeCompare(b.title);
    if (!a.startsAt) return 1;
    if (!b.startsAt) return -1;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });
}

export function groupEventsByMonth(
  events: CalendarEvent[],
  direction: 'asc' | 'desc' = 'asc',
): { label: string; events: CalendarEvent[] }[] {
  const groups = new Map<string, CalendarEvent[]>();
  const sorted = sortEvents(events);
  if (direction === 'desc') sorted.reverse();
  for (const event of sorted) {
    const label = event.startsAt
      ? new Date(event.startsAt).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
      : 'No date set';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(event);
  }
  return [...groups.entries()].map(([label, group]) => ({ label, events: group }));
}

export function courseShortCode(code: string | null): string | null {
  if (!code) return null;
  return code.split('_')[0] || code;
}

export function hostLabel(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export function syncTime(iso: string | null | undefined): string {
  if (!iso) return 'Not synced yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not synced yet';
  return date.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}
