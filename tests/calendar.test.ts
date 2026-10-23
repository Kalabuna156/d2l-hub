import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../shared/types';
import {
  calendarRangeDates,
  calendarRangeTitle,
  dayKey,
  filterEventsBySource,
  groupEventsByDay,
  isCalendarSourceKey,
  isCalendarView,
  monthGridDates,
  shiftCalendarAnchor,
  sourceKeyFor,
} from '../src/lib/calendar';

function event(
  id: string,
  startsAt: string | null,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    title: id,
    courseCode: null,
    startsAt,
    whenLabel: null,
    url: null,
    ...extra,
  };
}

describe('monthGridDates', () => {
  it('starts on the Sunday before the first of the month', () => {
    // October 2026 begins on a Thursday and ends on a Saturday.
    const dates = monthGridDates(new Date(2026, 9, 22));

    expect(dayKey(dates[0])).toBe('2026-09-27');
    expect(dayKey(dates[dates.length - 1])).toBe('2026-10-31');
    expect(dates).toHaveLength(35);
    expect(dates[0].getDay()).toBe(0);
  });

  it('uses six rows when the month needs them', () => {
    // August 2026 begins on a Saturday.
    const dates = monthGridDates(new Date(2026, 7, 15));

    expect(dayKey(dates[0])).toBe('2026-07-26');
    expect(dayKey(dates[dates.length - 1])).toBe('2026-09-05');
    expect(dates).toHaveLength(42);
    expect(dates.length % 7).toBe(0);
  });

  it('needs no padding for February 2026', () => {
    const dates = monthGridDates(new Date(2026, 1, 10));

    expect(dayKey(dates[0])).toBe('2026-02-01');
    expect(dayKey(dates[dates.length - 1])).toBe('2026-02-28');
    expect(dates).toHaveLength(28);
  });
});

describe('calendarRangeDates', () => {
  it('runs Sunday to Saturday for a week', () => {
    const dates = calendarRangeDates('week', new Date(2026, 9, 22));

    expect(dayKey(dates[0])).toBe('2026-10-18');
    expect(dayKey(dates[dates.length - 1])).toBe('2026-10-24');
    expect(dates).toHaveLength(7);
  });

  it('starts three-day and day ranges at the anchor', () => {
    expect(calendarRangeDates('three-days', new Date(2026, 9, 22)).map(dayKey)).toEqual([
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ]);
    expect(calendarRangeDates('day', new Date(2026, 9, 22)).map(dayKey)).toEqual(['2026-10-22']);
  });
});

describe('shiftCalendarAnchor', () => {
  it('moves by one day, three days, a week or a month', () => {
    const anchor = new Date(2026, 9, 22);

    expect(dayKey(shiftCalendarAnchor('day', anchor, -1))).toBe('2026-10-21');
    expect(dayKey(shiftCalendarAnchor('three-days', anchor, 1))).toBe('2026-10-25');
    expect(dayKey(shiftCalendarAnchor('week', anchor, 1))).toBe('2026-10-29');
    expect(dayKey(shiftCalendarAnchor('month', anchor, -1))).toBe('2026-09-01');
  });
});

describe('calendarRangeTitle', () => {
  it('labels months and days in full', () => {
    expect(calendarRangeTitle('month', new Date(2026, 9, 22))).toBe('October 2026');
    expect(calendarRangeTitle('day', new Date(2026, 9, 22))).toContain('October 22, 2026');
    expect(calendarRangeTitle('day', new Date(2026, 9, 22))).toContain('Thursday');
  });

  it('labels ranges inside and across months', () => {
    expect(calendarRangeTitle('week', new Date(2026, 9, 22))).toBe('Oct 18 – 24, 2026');
    expect(calendarRangeTitle('three-days', new Date(2026, 8, 30))).toBe('Sep 30 – Oct 2, 2026');
  });
});

describe('source filters', () => {
  it('counts D2L, outlines and local events as D2L', () => {
    expect(sourceKeyFor({ source: 'd2l' })).toBe('d2l');
    expect(sourceKeyFor({})).toBe('d2l');
    expect(sourceKeyFor({ source: 'form' })).toBe('d2l');
    expect(sourceKeyFor({ source: 'local' })).toBe('d2l');
    expect(sourceKeyFor({ source: 'google' })).toBe('google');
    expect(sourceKeyFor({ source: 'notion' })).toBe('notion');
  });

  it('hides only the unchecked sources', () => {
    const events = [
      event('d2l', null),
      event('gcal', null, { source: 'google' }),
      event('notion', null, { source: 'notion' }),
    ];

    expect(filterEventsBySource(events, new Set()).map((item) => item.id)).toEqual([
      'd2l',
      'gcal',
      'notion',
    ]);
    expect(filterEventsBySource(events, new Set(['google'])).map((item) => item.id)).toEqual([
      'd2l',
      'notion',
    ]);
  });

  it('rejects unknown stored values', () => {
    expect(isCalendarView('month')).toBe(true);
    expect(isCalendarView('year')).toBe(false);
    expect(isCalendarSourceKey('notion')).toBe(true);
    expect(isCalendarSourceKey('outlook')).toBe(false);
  });
});

describe('groupEventsByDay', () => {
  it('sorts by time and groups under local days', () => {
    const events = [
      event('late', new Date(2026, 9, 22, 15, 0).toISOString()),
      event('early', new Date(2026, 9, 22, 9, 0).toISOString()),
      event('next', new Date(2026, 9, 23, 10, 0).toISOString()),
    ];

    const days = groupEventsByDay(events);
    expect([...(days.get('2026-10-22') ?? [])].map((item) => item.id)).toEqual([
      'early',
      'late',
    ]);
    expect([...(days.get('2026-10-23') ?? [])].map((item) => item.id)).toEqual(['next']);
  });

  it('drops hidden events and events without a date', () => {
    const days = groupEventsByDay([
      event('shown', new Date(2026, 9, 22, 9, 0).toISOString()),
      event('hidden', new Date(2026, 9, 22, 11, 0).toISOString(), { hidden: true }),
      event('undated', null),
    ]);

    expect([...(days.get('2026-10-22') ?? [])].map((item) => item.id)).toEqual(['shown']);
    expect(days.size).toBe(1);
  });
});
