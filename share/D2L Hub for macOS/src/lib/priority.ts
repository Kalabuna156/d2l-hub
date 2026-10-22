import type { CalendarEvent } from '../../shared/types';
import { isClassEvent } from './format';
import { startOfDay } from './schedule';

/**
 * Assessments Study should still offer. An exam stays listed through the end
 * of its own day, so a midterm tomorrow is still there for last-minute review
 * and disappears the following morning.
 */
export function upcomingAssessments(
  events: CalendarEvent[],
  now = new Date(),
): CalendarEvent[] {
  const today = startOfDay(now).getTime();
  return events
    .filter((event) => !isClassEvent(event) && !event.hidden)
    .filter((event) => {
      if (!event.startsAt) return false;
      const time = Date.parse(event.startsAt);
      return Number.isFinite(time) && time >= today;
    })
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));
}
