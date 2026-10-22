import { describe, expect, it } from 'vitest';
import type { Announcement, CourseDetail } from '../shared/types';
import { announcementsForStudy } from '../server/study';

function announcement(overrides: Partial<Announcement> & { id: string }): Announcement {
  return {
    title: 'Course update',
    publishedAt: '2026-10-01T12:00:00.000Z',
    bodyHtml: '',
    bodyText: 'General news about the course.',
    url: `https://example.edu/news/${overrides.id}`,
    ...overrides,
  };
}

function detail(announcements: Announcement[]): CourseDetail {
  return { announcements } as CourseDetail;
}

describe('announcementsForStudy', () => {
  it('keeps announcements that mention quiz or exam coverage', () => {
    const result = announcementsForStudy(
      detail([
        announcement({ id: 'coffee', title: 'Coffee chat', bodyText: 'Drop by on Friday.' }),
        announcement({
          id: 'midterm',
          title: 'Midterm 1',
          bodyText: 'Covers chapters 1-4. Chapter 5 is not covered.',
        }),
      ]),
    );
    expect(result.map((entry) => entry.id)).toEqual(['midterm']);
  });

  it('puts the newest coverage note first and keeps the text snippet', () => {
    const result = announcementsForStudy(
      detail([
        announcement({
          id: 'old',
          title: 'Quiz 1 topics',
          publishedAt: '2026-09-01T12:00:00.000Z',
          bodyText: 'Quiz 1 covers limits.',
        }),
        announcement({
          id: 'new',
          title: 'Quiz 2 topics',
          publishedAt: '2026-10-10T12:00:00.000Z',
          bodyText: 'Quiz 2 covers derivatives and does not cover integration.',
        }),
      ]),
    );
    expect(result.map((entry) => entry.id)).toEqual(['new', 'old']);
    expect(result[0].text).toContain('derivatives');
  });

  it('returns nothing without a course detail', () => {
    expect(announcementsForStudy(null)).toEqual([]);
  });
});
