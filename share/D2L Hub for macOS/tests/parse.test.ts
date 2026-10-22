import { describe, expect, it } from 'vitest';
import { parseCalendarMonth, parseCourses, parseEvents, parseUserName } from '../server/parse';
import type { Course } from '../shared/types';

const BASE = 'https://courses.torontomu.ca';

const HOME_HTML = `
<html><body>
  <h1>Welcome back, Shafin</h1>
  <div class="courses-widget">
    <div class="d2l-card">
      <a href="/d2l/home/11111" aria-label="MTH140 - Calculus I - F2026">
        <img src="/content/enforced/11111/banner.png" alt="" />
      </a>
      <h3>MTH140 - Calculus I - F2026</h3>
      <p>MTH140_F26_01</p>
    </div>
    <div class="d2l-card">
      <a href="/d2l/home/22222" aria-label="CHY102 - General Chemistry - F2026">
        <h3>CHY102 - General Chemistry - F2026</h3>
        <p>CHY102_F26_01</p>
      </a>
    </div>
    <div class="d2l-card">
      <a href="/d2l/home/22222">CHY102_F26_01</a>
    </div>
    <div class="d2l-card">
      <a href="/d2l/home/33333">PD_EHS_WHMIS_STUDENTS</a>
      <h4>WHMIS for Students</h4>
    </div>
  </div>
  <a href="/d2l/home">Home</a>
  <a href="/d2l/home/44444">View All Courses (9)</a>
</body></html>`;

const EVENTS_HTML = `
<html><body>
  <div class="upcoming-events">
    <div class="event">
      <span>OCT 28</span>
      <a href="/d2l/le/calendar/6606/events/9001">Academic Integrity Quiz - Availability Ends</a>
      <time datetime="2026-10-28T15:00:00">3:00 PM</time>
      <span>CEN100_F26_03</span>
    </div>
    <div class="event">
      <span>Nov 4</span>
      <a href="/d2l/le/calendar/6606/events/9002">Assignment 4 - Problem Set Due</a>
      <span>11:59 PM</span>
      <span>MTH140_F26_01</span>
    </div>
    <a href="/d2l/le/calendar">Calendar</a>
  </div>
</body></html>`;

describe('parseCourses', () => {
  it('reads course tiles, codes and images', () => {
    const courses = parseCourses(HOME_HTML, BASE);

    expect(courses).toHaveLength(3);
    const calc = courses.find((course) => course.id === '11111');
    expect(calc).toEqual({
      id: '11111',
      name: 'MTH140 - Calculus I - F2026',
      code: 'MTH140_F26_01',
      url: 'https://courses.torontomu.ca/d2l/home/11111',
      imageUrl: 'https://courses.torontomu.ca/content/enforced/11111/banner.png',
    });
  });

  it('deduplicates the same org unit and ignores navigation links', () => {
    const courses = parseCourses(HOME_HTML, BASE);
    const ids = courses.map((course) => course.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('44444');
    expect(courses.some((course) => /view all/i.test(course.name))).toBe(false);
  });

  it('falls back to the enrollment code when a tile has no heading', () => {
    const courses = parseCourses(HOME_HTML, BASE);
    const whmis = courses.find((course) => course.id === '33333');

    expect(whmis?.name).toBe('WHMIS for Students');
    expect(whmis?.code).toBe('PD_EHS_WHMIS_STUDENTS');
  });

  it('returns nothing for a page without course tiles', () => {
    expect(parseCourses('<html><body><p>Sign in</p></body></html>', BASE)).toEqual([]);
  });
});

describe('parseEvents', () => {
  it('extracts upcoming events with dates and course codes', () => {
    const events = parseEvents(EVENTS_HTML, BASE);

    expect(events).toHaveLength(2);
    const quiz = events.find((event) => event.title.startsWith('Academic Integrity'));
    expect(quiz?.courseCode).toBe('CEN100_F26_03');
    expect(quiz?.startsAt).toBe(new Date('2026-10-28T15:00:00').toISOString());
    expect(quiz?.url).toBe('https://courses.torontomu.ca/d2l/le/calendar/6606/events/9001');
  });

  it('parses month/day text when no time element exists', () => {
    const events = parseEvents(EVENTS_HTML, BASE);
    const assignment = events.find((event) => event.title.startsWith('Assignment 4'));

    expect(assignment?.courseCode).toBe('MTH140_F26_01');
    expect(assignment?.startsAt).not.toBeNull();
    const parsed = new Date(assignment!.startsAt!);
    expect(parsed.getMonth()).toBe(10);
    expect(parsed.getDate()).toBe(4);
    expect(parsed.getHours()).toBe(23);
  });

  it('skips the calendar navigation link', () => {
    const events = parseEvents(EVENTS_HTML, BASE);
    expect(events.some((event) => event.title.toLowerCase() === 'calendar')).toBe(false);
  });
});

const CALENDAR_COURSES: Course[] = [
  {
    id: '1194174',
    name: 'CEN100 - 3 - Introduction to Engineering - F2026',
    code: 'CEN100_F26_03',
    url: `${BASE}/d2l/home/1194174`,
    imageUrl: null,
  },
  {
    id: '1202805',
    name: 'CHY102 - General Chemistry - F2026',
    code: 'CHY102_F26_01',
    url: `${BASE}/d2l/home/1202805`,
    imageUrl: null,
  },
];

const CALENDAR_HTML = `
<html><body>
  <a class="d2l-iterator-button-next" aria-label="Next: November 2026" href="javascript:void(0);">Next</a>
  <a class="d2l-iterator-button-prev" aria-label="Previous: September 2026" href="javascript:void(0);">Prev</a>
  <table><tbody><tr>
    <td class="d2l-le-calendar-month-other"><div class="d2l-le-calendar-month-day"> 30</div></td>
    <td>
      <div class="d2l-le-calendar-month-day"> 2<a title="Project Outline and User Research (Milestone 2) - Due - CEN100 - 3 - Introduction to Engineering - F2026" class="d2l-le-calendar-event" href="javascript:void(0);">
        <span class="d2l-le-calendar-event-time">11:59 PM</span>
        <span class="d2l-le-calendar-event-title">Project Outline and User Research (Milestone 2) - Due</span>
      </a>
      <div class="d2l-floating-container d2l-hidden"><div class="d2l-le-calendar-event-overlay">
        <abbr class="d2l-fuzzydate" data-date="1790999999000" title="Oct 2, 2026 11:59 PM">October 2 at 11:59 PM</abbr>
      </div></div>
      <div class="d2l-le-calendar-month-day"> 14<a title="Academic Integrity Quiz - Ends - CHY102 - General Chemistry - F2026" class="d2l-le-calendar-event" href="javascript:void(0);">
        <span class="d2l-le-calendar-event-time">3:00 PM</span>
      </a></div>
    </td>
    <td><div class="d2l-le-calendar-month-day"> 31</div></td>
  </tr></tbody></table>
</body></html>`;

describe('parseCalendarMonth', () => {
  it('reads day, time, course and cleaned title from the month grid', () => {
    const events = parseCalendarMonth(CALENDAR_HTML, `${BASE}/d2l/le/calendar/6606`, CALENDAR_COURSES);

    const milestone = events.find((event) => event.title.startsWith('Project Outline'));
    expect(milestone?.title).toBe('Project Outline and User Research (Milestone 2)');
    expect(milestone?.courseCode).toBe('CEN100_F26_03');
    expect(milestone?.url).toBe(`${BASE}/d2l/le/calendar/6606`);

    const startsAt = new Date(milestone!.startsAt!);
    expect(startsAt.getMonth()).toBe(9);
    expect(startsAt.getDate()).toBe(2);
    expect(startsAt.getHours()).toBe(23);
    expect(startsAt.getMinutes()).toBe(59);
  });

  it('handles several events inside one day cell and skips other-month cells', () => {
    const events = parseCalendarMonth(CALENDAR_HTML, `${BASE}/d2l/le/calendar/6606`, CALENDAR_COURSES);

    expect(events).toHaveLength(2);
    const quiz = events.find((event) => event.title.startsWith('Academic Integrity'));
    expect(quiz?.courseCode).toBe('CHY102_F26_01');
    expect(new Date(quiz!.startsAt!).getDate()).toBe(14);
    expect(new Date(quiz!.startsAt!).getHours()).toBe(15);
  });

  it('returns nothing for a calendar without events', () => {
    expect(parseCalendarMonth('<html><body></body></html>', `${BASE}/d2l/le/calendar/6606`, [])).toEqual([]);
  });
});

describe('parseUserName', () => {
  it('reads the name from the welcome heading', () => {
    expect(parseUserName(HOME_HTML)).toBe('Shafin');
  });

  it('does not swallow the next heading into the name', () => {
    const html = '<html><body><h1>Welcome back, Shafin My Courses</h1></body></html>';
    expect(parseUserName(html)).toBe('Shafin');
  });

  it('keeps a two-word name', () => {
    const html = '<html><body><h1>Welcome back, Shafin Islam</h1></body></html>';
    expect(parseUserName(html)).toBe('Shafin Islam');
  });

  it('returns null when the page has no name', () => {
    expect(parseUserName('<html><body><p>Sign in</p></body></html>')).toBeNull();
  });
});
