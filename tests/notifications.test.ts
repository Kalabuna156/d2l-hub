import { describe, expect, it } from 'vitest';
import type { Course } from '../shared/types';
import {
  announcementNotifications,
  buildFeed,
  classifyAlert,
  demoNotifications,
  feedFromRows,
  mapAlert,
} from '../server/notifications';
import type { AlertRecord } from '../server/d2l-api';

const BASE = 'https://courses.torontomu.ca';

const COURSES: Course[] = [
  {
    id: '123',
    name: 'MTH140 - Calculus I - F2026',
    code: 'MTH140',
    url: `${BASE}/d2l/home/123`,
    imageUrl: null,
  },
];

const GRADE_ALERT: AlertRecord = {
  Id: 42,
  OrgUnitId: 123,
  Category: 1,
  Title: 'Grade Updated',
  Message: '“Quiz 3” updated.',
  MessageURL: '/d2l/lms/grades/my_grades/main.d2l?ou=123',
  AlertDateTime: '2026-10-21T20:42:00.000Z',
  FeedMessageSubjectType: 'GradeUpdated',
};

describe('classifyAlert', () => {
  it('reads the D2L label to pick an icon family', () => {
    expect(classifyAlert(GRADE_ALERT)).toBe('grade');
    expect(classifyAlert({ Title: 'Content Created', Message: 'Unit 3 notes created' })).toBe('content');
    expect(classifyAlert({ Title: 'Announcement', Message: 'Class moved' })).toBe('announcement');
    expect(classifyAlert({ Title: 'Message', Message: 'New discussion post' })).toBe('message');
    expect(classifyAlert({ Title: 'Something else' })).toBe('other');
  });
});

describe('mapAlert', () => {
  it('uses the message as the row title and resolves the course and link', () => {
    const row = mapAlert(GRADE_ALERT, COURSES, null, BASE);

    expect(row.id).toBe('alert-42');
    expect(row.title).toBe('“Quiz 3” updated.');
    expect(row.categoryLabel).toBe('Grade Updated');
    expect(row.courseId).toBe('123');
    expect(row.courseCode).toBe('MTH140');
    expect(row.courseName).toBe('MTH140 - Calculus I - F2026');
    expect(row.url).toBe(`${BASE}/d2l/lms/grades/my_grades/main.d2l?ou=123`);
    expect(row.createdAt).toBe('2026-10-21T20:42:00.000Z');
    expect(row.read).toBe(false);
  });

  it('counts alerts older than the last clear as read', () => {
    expect(mapAlert(GRADE_ALERT, COURSES, '2026-10-22T00:00:00.000Z', BASE).read).toBe(true);
    expect(mapAlert(GRADE_ALERT, COURSES, '2026-10-20T00:00:00.000Z', BASE).read).toBe(false);
    expect(mapAlert(GRADE_ALERT, COURSES, null, BASE).read).toBe(false);
  });

  it('trusts a cleared id even when the post is dated in the future', () => {
    const future = { ...GRADE_ALERT, AlertDateTime: '2026-10-23T09:00:00.000Z' };

    expect(mapAlert(future, COURSES, '2026-10-22T00:00:00.000Z', BASE).read).toBe(false);
    expect(mapAlert(future, COURSES, '2026-10-22T00:00:00.000Z', BASE, ['alert-42']).read).toBe(true);
  });

  it('survives alerts without a course, date or link', () => {
    const row = mapAlert({ Id: 7, Title: 'Update', Message: '' }, COURSES, null, BASE);

    expect(row.courseName).toBeNull();
    expect(row.url).toBeNull();
    expect(row.createdAt).toBeNull();
    expect(row.title).toBe('Update');
  });
});

describe('buildFeed', () => {
  const alerts: AlertRecord[] = [
    { Id: 1, OrgUnitId: 123, Title: 'Content Created', Message: 'Older', AlertDateTime: '2026-10-18T10:00:00.000Z' },
    { Id: 2, OrgUnitId: 123, Title: 'Grade Updated', Message: 'Newest', AlertDateTime: '2026-10-22T09:00:00.000Z' },
    { Id: 3, OrgUnitId: 999, Title: 'Announcement', Message: 'Middle', AlertDateTime: '2026-10-20T12:00:00.000Z' },
  ];

  it('returns newest first and pages with the limit', () => {
    const feed = buildFeed(alerts, COURSES, null, 2, BASE);

    expect(feed.items.map((item) => item.title)).toEqual(['Newest', 'Middle']);
    expect(feed.total).toBe(3);
    expect(feed.unread).toBe(3);
    expect(feed.error).toBeNull();
  });

  it('counts unread alerts across the whole list, not just the page', () => {
    const feed = buildFeed(alerts, COURSES, '2026-10-19T00:00:00.000Z', 1, BASE);

    expect(feed.items).toHaveLength(1);
    expect(feed.unread).toBe(2);
  });

  it('drops duplicate alert ids', () => {
    const feed = buildFeed([...alerts, alerts[0]], COURSES, null, 8, BASE);
    expect(feed.total).toBe(3);
  });
});

describe('announcement fallback', () => {
  const course = COURSES[0];
  const entries = [
    {
      course,
      announcement: {
        id: '9',
        title: 'Midterm room changed',
        publishedAt: '2026-10-21T15:00:00.000Z',
        bodyHtml: '',
        bodyText: '',
        url: `${BASE}/d2l/le/news/123/9/view`,
      },
    },
  ];

  it('draws a course announcement as a notification row', () => {
    const rows = announcementNotifications(entries, null);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'news-123-9',
      kind: 'announcement',
      categoryLabel: 'Announcement',
      title: 'Midterm room changed',
      courseName: COURSES[0].name,
      read: false,
    });
  });

  it('marks announcements older than the last clear as read', () => {
    expect(announcementNotifications(entries, '2026-10-22T00:00:00.000Z')[0].read).toBe(true);
    expect(announcementNotifications(entries, '2026-10-20T00:00:00.000Z')[0].read).toBe(false);
  });

  it('stays read once cleared, even if its date is ahead of the clock', () => {
    const ahead = [
      { ...entries[0], announcement: { ...entries[0].announcement, publishedAt: '2026-10-23T09:00:00.000Z' } },
    ];

    expect(announcementNotifications(ahead, '2026-10-22T00:00:00.000Z')[0].read).toBe(false);
    expect(announcementNotifications(ahead, '2026-10-22T00:00:00.000Z', ['news-123-9'])[0].read).toBe(true);
  });

  it('de-duplicates and pages the same way as alerts', () => {
    const rows = announcementNotifications([...entries, ...entries], null);
    const feed = feedFromRows(rows, 8);

    expect(feed.total).toBe(1);
    expect(feed.unread).toBe(1);
  });
});

describe('demoNotifications', () => {
  it('offers a fictional, dated list for preview mode', () => {
    const rows = demoNotifications();

    expect(rows.length).toBeGreaterThan(3);
    expect(rows.every((row) => row.courseName && row.createdAt && !row.url)).toBe(true);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    const text = JSON.stringify(rows).toLowerCase();
    for (const real of ['mth140', 'cen100', 'shafin']) {
      expect(text).not.toContain(real);
    }
  });
});
