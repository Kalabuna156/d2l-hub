import { describe, expect, it } from 'vitest';
import { describeCourse, findCourseCode, groupCourses, themeForSubject } from '../shared/categorize';
import type { Course } from '../shared/types';

function course(id: string, name: string, code: string): Course {
  return { id, name, code, url: `https://example.d2l/d2l/home/${id}`, imageUrl: null };
}

const COURSES = [
  course('1', 'MTH140 - Calculus I - F2026', 'MTH140_F26_01'),
  course('2', 'CHY102 - General Chemistry - F2026', 'CHY102_F26_01'),
  course('3', 'PCS211 - Physics: Mechanics - Tanguay - F2026', 'PCS211_F26_07'),
  course('4', 'WHMIS for Students', 'PD_EHS_WHMIS_STUDENTS'),
  course('5', 'The Esch Awards', 'ORG_ESCH_FOUNDATION'),
  course('6', 'MTH141 - Linear Algebra - W2026', 'MTH141_W26_01'),
];

describe('describeCourse', () => {
  it('splits a sectioned course into subject, number and term', () => {
    const info = describeCourse(COURSES[0]);

    expect(info.subject).toBe('MTH');
    expect(info.subjectLabel).toBe('Mathematics');
    expect(info.number).toBe('140');
    expect(info.termKey).toBe('F2026');
    expect(info.termLabel).toBe('Fall 2026');
    expect(info.kind).toBe('course');
    expect(info.initials).toBe('MTH');
  });

  it('treats non-sectioned enrollments as resources', () => {
    const whmis = describeCourse(COURSES[3]);
    expect(whmis.kind).toBe('resource');
    expect(whmis.termLabel).toBe('Resources & Training');

    const esch = describeCourse(COURSES[4]);
    expect(esch.kind).toBe('resource');
  });

  it('labels winter terms correctly', () => {
    expect(describeCourse(COURSES[5]).termLabel).toBe('Winter 2026');
    expect(describeCourse(COURSES[5]).termKey).toBe('W2026');
  });

  it('falls back gracefully for unknown codes', () => {
    const info = describeCourse({ name: 'Orientation', code: '' });
    expect(info.kind).toBe('resource');
    expect(info.termLabel).toBe('Resources & Training');
  });

  it('keeps long non-course codes together as resources', () => {
    const info = describeCourse({ name: 'Consent Comes First 2026', code: 'PD_CONSENTCOMESFIRST_Y' });
    expect(info.subject).toBe('PD');
    expect(info.kind).toBe('resource');
    expect(info.termLabel).toBe('Resources & Training');
  });
});

describe('findCourseCode', () => {
  it('finds enrollment codes inside arbitrary text', () => {
    expect(findCourseCode('Section MTH140_F26_01 · Calculus')).toBe('MTH140_F26_01');
    expect(findCourseCode('nothing here')).toBeNull();
  });
});

describe('groupCourses', () => {
  it('groups by term with the newest term first and resources last', () => {
    const groups = groupCourses(COURSES, 'term');

    expect(groups.map((group) => group.label)).toEqual([
      'Fall 2026',
      'Winter 2026',
      'Resources & Training',
    ]);
    expect(groups[0].courses).toHaveLength(3);
    expect(groups[2].courses).toHaveLength(2);
  });

  it('groups by subject alphabetically', () => {
    const groups = groupCourses(COURSES, 'subject');
    const labels = groups.map((group) => group.label);

    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(labels).toContain('Mathematics');
    expect(labels).toContain('Physics');
  });

  it('counts every course exactly once', () => {
    for (const mode of ['term', 'subject'] as const) {
      const total = groupCourses(COURSES, mode).reduce((sum, group) => sum + group.courses.length, 0);
      expect(total).toBe(COURSES.length);
    }
  });
});

describe('themeForSubject', () => {
  it('returns a stable palette per subject', () => {
    expect(themeForSubject('MTH')).toEqual(themeForSubject('MTH'));
    expect(themeForSubject('MTH').from).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
