import { describe, expect, it } from 'vitest';
import { buildLocalStudyPlan } from '../server/study';
import type { StudyFile } from '../shared/types';

function file(title: string, source: StudyFile['source'] = 'd2l'): StudyFile {
  return {
    id: title,
    title,
    type: 'application/pdf',
    source,
    url: null,
    canOpen: source === 'library',
    folder: null,
    readByAi: false,
  };
}

const now = new Date('2026-10-20T12:00:00');

const outline = [
  'MTH140 Course Outline',
  'Week 3 (Sep 22-26): Chapter 2: Limits and Continuity',
  'Week 4: Chapter 3: Derivatives',
  'Textbook: Calculus: Early Transcendentals, 9th edition',
  'Academic Integrity Policy',
  'Chapter 5 is not covered.',
].join('\n');

describe('buildLocalStudyPlan', () => {
  it('builds a dated plan from the outline and D2L file names without AI', () => {
    const plan = buildLocalStudyPlan({
      title: 'Midterm Test',
      courseCode: 'MTH140_F26_01',
      courseName: 'MTH140 - Calculus I',
      startsAt: '2026-10-25T12:00:00',
      outline,
      files: [
        file('(13) section 3.5-Derivatives of Trig Functions(1)sep30'),
        file('(6) section 2.2-Limits'),
        file('Course Outline 2026', 'library'),
      ],
      now,
    });

    expect(plan.overview).toContain('without AI');
    expect(plan.overview).toContain('5 study sessions');
    expect(plan.focus.length).toBeGreaterThanOrEqual(3);
    expect(plan.focus.length).toBeLessThanOrEqual(6);
    expect(plan.focus.map((item) => item.topic)).toEqual(
      expect.arrayContaining([
        'Chapter 2: Limits and Continuity',
        'Section 3.5 — Derivatives of Trig Functions',
      ]),
    );
    expect(plan.focus.map((item) => item.topic)).not.toContain('Chapter 5');
    expect(plan.focus.map((item) => item.topic)).not.toContain('Course Outline 2026');

    expect(plan.checklist[0]).toContain('Download the 2 D2L files');
    expect(plan.checklist.join(' ')).toContain('Today (Tue, Oct 20)');
    expect(plan.checklist.join(' ')).toContain('timed practice set');
    expect(plan.bookPractice[0]).toMatchObject({
      source: 'Calculus: Early Transcendentals, 9th edition',
    });
    expect(plan.bookPractice[0].problems).toContain('Practice problems for Section 3.5');
    expect(plan.practice).toEqual([]);
  });

  it('still gives a setup checklist when there is no outline or file list', () => {
    const plan = buildLocalStudyPlan({
      title: 'Quiz 1',
      startsAt: '2026-10-21T12:00:00',
      now,
    });

    expect(plan.overview).toContain('setup plan');
    expect(plan.overview).toContain('1 study session');
    expect(plan.overview).toContain('without AI');
    expect(plan.focus).toEqual([]);
    expect(plan.bookPractice).toEqual([]);
    expect(plan.checklist.join(' ')).toContain('Import the course outline');
    expect(plan.checklist.join(' ')).toContain('Download any lecture files');
  });

  it('uses file names when no outline is saved', () => {
    const plan = buildLocalStudyPlan({
      title: 'Midterm Test',
      startsAt: '2026-10-25T12:00:00',
      files: [
        file('(10) section 3.2-The derivative as a function(2)Sep30'),
        file('(9) section 3.1-Defining the Derivative'),
      ],
      now,
    });

    expect(plan.focus.map((item) => item.topic)).toEqual(
      expect.arrayContaining([
        'Section 3.2 — The derivative as a function',
        'Section 3.1 — Defining the Derivative',
      ]),
    );
    expect(plan.overview).toContain('file names');
    expect(plan.bookPractice[0]).toMatchObject({ source: 'Your course materials' });
  });

  it('does not create a session after the assessment day', () => {
    const plan = buildLocalStudyPlan({
      title: 'Quiz tomorrow',
      startsAt: '2026-10-21T12:00:00',
      outline: 'Chapter 1: Limits',
      now,
    });

    expect(plan.checklist.join(' ')).toContain('Today');
    expect(plan.checklist.join(' ')).not.toContain('Thu, Oct 22');
  });
});
