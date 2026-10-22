import { describe, expect, it } from 'vitest';
import { demoContent, demoDashboard } from '../server/demo';
import { layoutWeek, startOfWeek } from '../src/lib/schedule';

const BASE = 'https://courses.torontomu.ca';

describe('demoDashboard', () => {
  const data = demoDashboard(BASE, 'Preview data');

  it('never links tiles to invented org unit ids', () => {
    for (const course of data.courses) {
      expect(course.url).not.toMatch(/\/d2l\/home\/\d+/);
    }
    expect(data.courses.every((course) => course.url === `${BASE}/d2l/home`)).toBe(true);
  });

  it('leaves sample events without a D2L deep link', () => {
    expect(data.events.length).toBeGreaterThan(0);
    expect(data.events.every((event) => event.url === null)).toBe(true);
  });

  it('is marked as sample data so the UI can disable links', () => {
    expect(data.source).toBe('sample');
    expect(data.notice).toBe('Preview data');
  });

  it('includes a fictional timetable so the week grid is never blank', () => {
    const classes = data.events.filter((event) => event.endsAt);
    expect(classes.length).toBeGreaterThan(0);
    expect(classes.every((event) => event.location && /Room|Lab|Library|Hall|Wing/.test(event.location))).toBe(
      true,
    );
    expect(layoutWeek(data.events, startOfWeek(new Date())).blocks.length).toBeGreaterThan(0);
  });

  it('offers sample modules and topics for the Content tab', () => {
    const content = demoContent('900001');
    expect(content.modules).toHaveLength(2);
    expect(content.moduleTitle).toContain('Unit 3');
    expect(content.topics.map((topic) => topic.title)).toContain('Unit 3.2 - Derivatives');
    expect(demoContent('900001', '302').topics[0].title).toBe('Unit 4.1 - Integrals');
  });

  it('keeps preview data fictional', () => {
    const fictional = demoDashboard('https://example.edu', 'Preview data');
    const text = JSON.stringify(fictional).toLowerCase();

    expect(fictional.user.name).toBe('User');
    expect(text).not.toContain('shafin');
    for (const code of ['chy102', 'mth140', 'mth141', 'pcs211', 'cen100', 'whmis', 'tanguay']) {
      expect(text).not.toContain(code);
    }
  });
});
