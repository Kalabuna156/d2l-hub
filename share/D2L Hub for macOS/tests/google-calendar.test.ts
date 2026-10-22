import { describe, expect, it } from 'vitest';
import { googleCalendarUrl } from '../src/lib/google-calendar';

describe('googleCalendarUrl', () => {
  it('prefills the template with the event fields', () => {
    const url = new URL(
      googleCalendarUrl({
        title: 'Study group',
        location: 'Library 302',
        startsAt: '2026-10-23T18:30:00.000Z',
        endsAt: '2026-10-23T19:30:00.000Z',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Study group');
    expect(url.searchParams.get('dates')).toBe('20261023T183000Z/20261023T193000Z');
    expect(url.searchParams.get('location')).toBe('Library 302');
  });

  it('leaves the location out when there is no room', () => {
    const url = new URL(
      googleCalendarUrl({
        title: 'Focus block',
        startsAt: '2026-10-24T13:00:00.000Z',
        endsAt: '2026-10-24T15:30:00.000Z',
      }),
    );
    expect(url.searchParams.has('location')).toBe(false);
  });
});
