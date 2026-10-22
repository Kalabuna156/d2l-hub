import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../shared/types';
import { upcomingAssessments } from '../src/lib/priority';

function event(overrides: Partial<CalendarEvent> & { id: string; startsAt: string }): CalendarEvent {
  return {
    title: 'Assessment',
    courseCode: 'MTH140',
    whenLabel: null,
    url: null,
    ...overrides,
  };
}

const now = new Date(2026, 9, 22, 14, 0); // Thu 22 Oct 2026, 2 PM

describe('upcomingAssessments', () => {
  it('puts the nearest deadline first', () => {
    const result = upcomingAssessments(
      [
        event({ id: 'later', startsAt: '2026-10-29T13:00:00' }),
        event({ id: 'next', startsAt: '2026-10-23T09:00:00' }),
      ],
      now,
    );
    expect(result.map((entry) => entry.id)).toEqual(['next', 'later']);
  });

  it('keeps today and tomorrow, and drops an exam after its day ends', () => {
    const events = [
      event({ id: 'today', startsAt: '2026-10-22T09:00:00' }),
      event({ id: 'tomorrow', startsAt: '2026-10-23T09:00:00' }),
      event({ id: 'passed', startsAt: '2026-10-21T09:00:00' }),
    ];

    expect(upcomingAssessments(events, now).map((entry) => entry.id)).toEqual(['today', 'tomorrow']);
    // 00:00 on the day after the exam: the midterm is gone.
    expect(upcomingAssessments(events, new Date(2026, 9, 24, 0, 1)).map((entry) => entry.id)).toEqual(
      [],
    );
  });

  it('ignores weekly classes, hidden events and undated rows', () => {
    const result = upcomingAssessments(
      [
        event({ id: 'class', startsAt: '2026-10-22T09:00:00', endsAt: '2026-10-22T10:00:00' }),
        event({ id: 'hidden', startsAt: '2026-10-22T09:00:00', hidden: true }),
        event({ id: 'undated', startsAt: '' }),
        event({ id: 'real', startsAt: '2026-10-25T09:00:00' }),
      ],
      now,
    );
    expect(result.map((entry) => entry.id)).toEqual(['real']);
  });
});
