import { describe, expect, it } from 'vitest';
import {
  applyOverrides,
  mapNotionPages,
  normalizeIcalUrl,
  parseIcalFeed,
  sanitizeLocalEvent,
  sanitizeOverride,
} from '../server/integrations';
import type { CalendarEvent } from '../shared/types';

function buildIcs(parts: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
    'X-WR-CALNAME:School &amp; Work',
    ...parts,
    'END:VCALENDAR',
  ].join('\r\n');
}

const now = new Date('2026-10-21T12:00:00');

describe('normalizeIcalUrl', () => {
  it('upgrades webcal links to https', () => {
    expect(normalizeIcalUrl('webcal://calendar.google.com/calendar/ical/abc/basic.ics')).toBe(
      'https://calendar.google.com/calendar/ical/abc/basic.ics',
    );
  });

  it('keeps https and http addresses', () => {
    expect(normalizeIcalUrl('https://example.com/cal.ics')).toBe('https://example.com/cal.ics');
    expect(normalizeIcalUrl('  http://127.0.0.1:9000/cal.ics  ')).toBe('http://127.0.0.1:9000/cal.ics');
  });

  it('rejects junk and non-web protocols', () => {
    expect(normalizeIcalUrl('')).toBeNull();
    expect(normalizeIcalUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeIcalUrl('not a url')).toBeNull();
  });
});

describe('parseIcalFeed', () => {
  it('maps a timed event and decodes the calendar name', () => {
    const events = parseIcalFeed(
      buildIcs([
        'BEGIN:VEVENT',
        'UID:timed-1',
        'DTSTAMP:20261001T000000Z',
        'DTSTART:20261025T150000Z',
        'DTEND:20261025T160000Z',
        'SUMMARY:MTH141 Midterm',
        'LOCATION:TRS1067',
        'URL:https://example.com/event',
        'END:VEVENT',
      ]),
      'fallback',
      now,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: 'MTH141 Midterm',
      startsAt: '2026-10-25T15:00:00.000Z',
      endsAt: '2026-10-25T16:00:00.000Z',
      location: 'TRS1067',
      source: 'google',
      calendarName: 'School & Work',
      url: 'https://example.com/event',
    });
    expect(events[0].id).toContain('timed-1');
  });

  it('puts all-day events at local noon so the date does not shift', () => {
    const events = parseIcalFeed(
      buildIcs([
        'BEGIN:VEVENT',
        'UID:allday-1',
        'DTSTAMP:20261001T000000Z',
        'DTSTART;VALUE=DATE:20261027',
        'DTEND;VALUE=DATE:20261028',
        'SUMMARY:Reading week starts',
        'END:VEVENT',
      ]),
      'fallback',
      now,
    );

    expect(events).toHaveLength(1);
    expect(events[0].startsAt).toBe(new Date(2026, 9, 27, 12, 0, 0).toISOString());
    // All-day entries are dates, not class blocks, so they have no end time.
    expect(events[0].endsAt).toBeNull();
  });

  it('expands a weekly class into separate upcoming events', () => {
    const events = parseIcalFeed(
      buildIcs([
        'BEGIN:VEVENT',
        'UID:weekly-1',
        'DTSTAMP:20261001T000000Z',
        'DTSTART:20261001T150000Z',
        'DTEND:20261001T160000Z',
        'RRULE:FREQ=WEEKLY;COUNT=6',
        'SUMMARY:Weekly lecture',
        'END:VEVENT',
      ]),
      'fallback',
      now,
    );

    // Oct 1–Nov 5 all sit inside the 30-day-back / 120-day-forward window.
    expect(events).toHaveLength(6);
    expect(new Set(events.map((event) => event.startsAt)).size).toBe(events.length);
    for (const event of events) {
      const start = new Date(event.startsAt!);
      expect(start.getTime()).toBeGreaterThanOrEqual(now.getTime() - 31 * 86_400_000);
      expect(start.getTime()).toBeLessThanOrEqual(now.getTime() + 121 * 86_400_000);
    }
  });

  it('skips cancelled events and leaves empty feeds empty', () => {
    const events = parseIcalFeed(
      buildIcs([
        'BEGIN:VEVENT',
        'UID:cancelled-1',
        'DTSTAMP:20261001T000000Z',
        'DTSTART:20261025T150000Z',
        'SUMMARY:Cancelled thing',
        'STATUS:CANCELLED',
        'END:VEVENT',
      ]),
      'fallback',
      now,
    );

    expect(events).toHaveLength(0);
    expect(parseIcalFeed(buildIcs([]), 'fallback', now)).toHaveLength(0);
  });
});

describe('applyOverrides', () => {
  const base: CalendarEvent = {
    id: 'gcal-uid-1-2026-10-21T12:00:00.000Z',
    title: 'PCS211 - 142 - LAB',
    courseCode: null,
    startsAt: '2026-10-21T12:00:00.000Z',
    endsAt: '2026-10-21T14:00:00.000Z',
    location: 'KHE231A',
    whenLabel: null,
    url: null,
    source: 'google',
    calendarName: 'School',
  };

  it('replaces the edited fields and flags the event', () => {
    const [event] = applyOverrides([base], {
      [base.id]: {
        title: 'PCS211 lab (moved)',
        location: 'KHE133',
        startsAt: '2026-10-21T13:00:00.000Z',
        endsAt: '2026-10-21T15:00:00.000Z',
      },
    });

    expect(event).toMatchObject({
      id: base.id,
      title: 'PCS211 lab (moved)',
      location: 'KHE133',
      startsAt: '2026-10-21T13:00:00.000Z',
      endsAt: '2026-10-21T15:00:00.000Z',
      edited: true,
    });
    expect(event.hidden).toBeUndefined();
  });

  it('marks hidden classes without dropping them', () => {
    const events = applyOverrides([base], { [base.id]: { hidden: true } });
    expect(events).toHaveLength(1);
    expect(events[0].hidden).toBe(true);
    expect(events[0].edited).toBe(true);
  });

  it('leaves events without an override untouched', () => {
    expect(applyOverrides([base], {})[0]).toBe(base);
    const events = applyOverrides([base], { 'some-other-id': { hidden: true } });
    expect(events[0]).toBe(base);
  });

  it('validates and trims incoming changes', () => {
    expect(sanitizeOverride({ title: '  Moved lab  ', location: '   ' })).toEqual({
      title: 'Moved lab',
      location: null,
    });
    expect(sanitizeOverride({ hidden: true })).toEqual({ hidden: true });
    expect(() => sanitizeOverride({ title: '   ' })).toThrow();
    expect(() => sanitizeOverride({ startsAt: 'not a date' })).toThrow();
    expect(() => sanitizeOverride({})).toThrow();
  });
});

describe('sanitizeLocalEvent', () => {
  it('trims fields and converts an empty room to null', () => {
    const event = sanitizeLocalEvent({
      title: '  Study group  ',
      location: '  ',
      startsAt: '2026-10-21T14:00:00.000Z',
      endsAt: '2026-10-21T15:30:00.000Z',
    });

    expect(event).toEqual({
      title: 'Study group',
      location: null,
      startsAt: '2026-10-21T14:00:00.000Z',
      endsAt: '2026-10-21T15:30:00.000Z',
      courseCode: null,
    });
  });

  it('rejects nameless, undated and backwards events', () => {
    expect(() => sanitizeLocalEvent({ title: '  ', startsAt: new Date().toISOString(), endsAt: new Date().toISOString() })).toThrow();
    expect(() => sanitizeLocalEvent({ title: 'Lab', endsAt: '2026-10-21T15:00:00.000Z' })).toThrow();
    expect(() =>
      sanitizeLocalEvent({
        title: 'Lab',
        startsAt: '2026-10-21T15:00:00.000Z',
        endsAt: '2026-10-21T14:00:00.000Z',
      }),
    ).toThrow();
  });
});

describe('mapNotionPages', () => {
  const pages: Parameters<typeof mapNotionPages>[0] = [
    {
      id: 'page-1',
      url: 'https://www.notion.so/page-1',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Lab 4 report' }] },
        Due: { type: 'date', date: { start: '2026-10-30' } },
      },
    },
    {
      id: 'page-2',
      url: 'https://www.notion.so/page-2',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Essay draft' }, { plain_text: ' v2' }] },
        Due: { type: 'date', date: { start: '2026-11-02T23:59:00.000-05:00' } },
      },
    },
    {
      id: 'page-3',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'No date here' }] },
      },
    },
  ];

  it('maps titles, dates and links', () => {
    const events = mapNotionPages(pages, 'Deadlines', 'Due', now);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      title: 'Lab 4 report',
      source: 'notion',
      calendarName: 'Deadlines',
      url: 'https://www.notion.so/page-1',
      startsAt: new Date(2026, 9, 30, 12, 0, 0).toISOString(),
    });
    expect(events[1].title).toBe('Essay draft v2');
    expect(events[1].startsAt).toBe(new Date('2026-11-02T23:59:00.000-05:00').toISOString());
  });

  it('drops entries without a usable date', () => {
    const events = mapNotionPages([pages[2]], 'Deadlines', null, now);
    expect(events).toHaveLength(0);
  });

  it('keeps the calendar window and drops history outside it', () => {
    const events = mapNotionPages(
      [
        ...pages,
        {
          id: 'page-old',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'September check-in' }] },
            Due: { type: 'date', date: { start: '2026-08-01' } },
          },
        },
      ],
      'Deadlines',
      'Due',
      now,
    );

    expect(events.map((event) => event.title)).toEqual(['Lab 4 report', 'Essay draft v2']);
  });

  it('finds a date property even when it is named differently', () => {
    const events = mapNotionPages(
      [
        {
          id: 'page-4',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'Problem set 7' }] },
            Deadline: { type: 'date', date: { start: '2026-12-01' } },
          },
        },
      ],
      'Deadlines',
      null,
      now,
    );
    expect(events[0].title).toBe('Problem set 7');
    expect(events[0].startsAt).toBe(new Date(2026, 11, 1, 12, 0, 0).toISOString());
  });
});
