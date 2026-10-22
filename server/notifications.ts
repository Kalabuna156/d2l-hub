import type {
  Announcement,
  AppNotification,
  Course,
  NotificationFeed,
  NotificationKind,
} from '../shared/types';
import { DEMO_MODE, readConfig, updateConfig } from './config';
import { fetchAlerts, fetchCoursePage, fetchCourses, type AlertRecord } from './d2l-api';
import { parseAnnouncements } from './parse';

/** How many alerts are kept in memory; more than anyone scrolls through. */
export const MAX_ALERTS = 80;
/** The bell opens with the five newest updates. */
export const PAGE_SIZE = 5;
const CACHE_MS = 60_000;
const NEWS_CACHE_MS = 5 * 60_000;

let cache: { at: number; alerts: AlertRecord[]; courses: Course[] } | null = null;
let newsCache: { at: number; entries: AnnouncementEntry[] } | null = null;

export function clearNotificationCache(): void {
  cache = null;
  newsCache = null;
}

/** Alerts are labelled by D2L; map that label to an icon family. */
export function classifyAlert(alert: AlertRecord): NotificationKind {
  const text = `${alert.FeedMessageSubjectType ?? ''} ${alert.Title ?? ''}`.toLowerCase();
  if (/grade|quiz|assignment|score|rubric|feedback/.test(text)) return 'grade';
  if (/content|topic|module|file|document/.test(text)) return 'content';
  if (/announcement|news|bulletin/.test(text)) return 'announcement';
  if (/message|discussion|post|comment|mail/.test(text)) return 'message';
  return 'other';
}

function absoluteLink(value: string | undefined, baseUrl: string): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  try {
    return new URL(raw, `${baseUrl.replace(/\/+$/, '')}/`).href;
  } catch {
    return null;
  }
}

function parseDate(value: string | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** Cleared by id, or older than the last clear (dates can sit slightly ahead). */
function isRead(id: string, createdAt: string | null, seenAt: string | null, seenIds: string[]): boolean {
  if (seenIds.includes(id)) return true;
  return Boolean(createdAt && seenAt && Date.parse(createdAt) <= Date.parse(seenAt));
}

/** One raw alert turned into the row the bell draws. */
export function mapAlert(
  alert: AlertRecord,
  courses: Course[],
  seenAt: string | null,
  baseUrl: string,
  seenIds: string[] = [],
): AppNotification {
  const courseId = alert.OrgUnitId === undefined ? '' : String(alert.OrgUnitId).trim();
  const course = /^\d+$/.test(courseId) ? courses.find((entry) => entry.id === courseId) ?? null : null;
  const createdAt = parseDate(alert.AlertDateTime);
  const message = (alert.Message ?? '').replace(/\s+/g, ' ').trim();
  const id = `alert-${alert.Id ?? `${courseId}-${createdAt ?? Math.random().toString(36).slice(2)}`}`;

  return {
    id,
    kind: classifyAlert(alert),
    categoryLabel: (alert.Title ?? '').trim() || 'Update',
    title: message || (alert.Title ?? '').trim() || 'Something changed in D2L.',
    courseId: course?.id ?? null,
    courseName: course?.name ?? null,
    courseCode: course?.code ?? null,
    createdAt: createdAt,
    url: absoluteLink(alert.MessageURL, baseUrl),
    read: isRead(id, createdAt, seenAt, seenIds),
  };
}

/** Newest first, de-duplicated, capped, with unread counted across everything. */
export function feedFromRows(
  rows: AppNotification[],
  limit: number,
  error: string | null = null,
): NotificationFeed {
  const seen = new Set<string>();
  const unique = rows
    .slice()
    .sort((a, b) => (b.createdAt ? Date.parse(b.createdAt) : 0) - (a.createdAt ? Date.parse(a.createdAt) : 0))
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .slice(0, MAX_ALERTS);

  return {
    items: unique.slice(0, limit),
    unread: unique.filter((row) => !row.read).length,
    total: unique.length,
    error,
    fetchedAt: new Date().toISOString(),
  };
}

/** The alert feed shaped into the bell's rows. */
export function buildFeed(
  alerts: AlertRecord[],
  courses: Course[],
  seenAt: string | null,
  limit: number,
  baseUrl: string,
  error: string | null = null,
  seenIds: string[] = [],
): NotificationFeed {
  return feedFromRows(
    alerts.map((alert) => mapAlert(alert, courses, seenAt, baseUrl, seenIds)),
    limit,
    error,
  );
}

export interface AnnouncementEntry {
  course: Course;
  announcement: Announcement;
}

/** Course announcements, drawn like alerts so the bell works without the feed. */
export function announcementNotifications(
  entries: AnnouncementEntry[],
  seenAt: string | null,
  seenIds: string[] = [],
): AppNotification[] {
  return entries.map(({ course, announcement }) => {
    const createdAt = announcement.publishedAt;
    const id = `news-${course.id}-${announcement.id}`;
    return {
      id,
      kind: 'announcement' as const,
      categoryLabel: 'Announcement',
      title: announcement.title,
      courseId: course.id,
      courseName: course.name,
      courseCode: course.code,
      createdAt,
      url: announcement.url,
      read: isRead(id, createdAt, seenAt, seenIds),
    };
  });
}

/**
 * Many schools leave the LP alerts route closed to student sessions. Course
 * announcement pages are the one activity source the app already reads
 * successfully, so they become the fallback feed (one request per course).
 */
async function loadAnnouncementEntries(
  courses: Course[],
  baseUrl: string,
  cookies: ReturnType<typeof readConfig>['cookies'],
): Promise<AnnouncementEntry[]> {
  if (newsCache && Date.now() - newsCache.at < NEWS_CACHE_MS) return newsCache.entries;

  const session = { baseUrl, cookies };
  const entries: AnnouncementEntry[] = [];
  let next = 0;

  const worker = async () => {
    while (next < courses.length) {
      const course = courses[next];
      next += 1;
      try {
        const html = await fetchCoursePage(session, `/d2l/lms/news/main.d2l?ou=${course.id}`);
        if (!html) continue;
        for (const announcement of parseAnnouncements(html, baseUrl)) {
          entries.push({ course, announcement });
        }
      } catch {
        // One unreadable course must not empty the whole bell.
      }
    }
  };

  await Promise.all([worker(), worker(), worker()]);
  newsCache = { at: Date.now(), entries };
  return entries;
}

/** Fictional alerts for preview mode, dated so the panel looks alive. */
export function demoNotifications(): AppNotification[] {
  const now = Date.now();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();
  const rows: [NotificationKind, string, string, string, string, number][] = [
    ['grade', 'Grade Updated', '“Lab 03 Report” updated.', 'BIO120', 'BIO120 - Ecology and Evolution - F2026', 2],
    [
      'content',
      'Content Created',
      '(12) section 5.4 - The Fundamental Theorem created',
      'CPS101',
      'CPS101 - Intro to Programming - F2026',
      6,
    ],
    ['content', 'Content Created', 'Midterm practice set created', 'PSY101', 'PSY101 - Introduction to Psychology - F2026', 9],
    ['grade', 'Grade Updated', '“Reading response 4” updated.', 'ENG204', 'ENG204 - Creative Writing - F2026', 26],
    ['announcement', 'Announcement', 'Room change for Thursday’s lecture', 'PHL110', 'PHL110 - Ethics and Society - F2026', 30],
    ['content', 'Content Created', '(8) section 4.2 - Related Rates created', 'CPS101', 'CPS101 - Intro to Programming - F2026', 33],
    ['message', 'Message', 'New reply in “Week 6 study group”', 'BIO120', 'BIO120 - Ecology and Evolution - F2026', 52],
    ['grade', 'Grade Updated', '“Problem set 3” updated.', 'PSY101', 'PSY101 - Introduction to Psychology - F2026', 74],
    ['content', 'Content Created', 'Exam review checklist created', 'HIS105', 'HIS105 - World History - F2026', 96],
  ];

  return rows.map(([kind, categoryLabel, title, courseCode, courseName, hoursAgo], index) => ({
    id: `demo-alert-${index}`,
    kind,
    categoryLabel,
    title,
    courseId: `demo-${courseCode}`,
    courseName,
    courseCode,
    createdAt: at(hoursAgo),
    url: null,
    read: false,
  }));
}

/**
 * D2L's own bell feed, cached for a minute so opening the panel repeatedly is
 * free. When the school does not expose it, course announcements stand in.
 * Read state lives on this computer: anything older than the last "mark all
 * read" counts as read.
 */
export async function getNotifications(limit = PAGE_SIZE, force = false): Promise<NotificationFeed> {
  const config = readConfig();
  const clampLimit = Math.min(MAX_ALERTS, Math.max(PAGE_SIZE, Math.round(limit) || PAGE_SIZE));
  const seenAt = config.notificationsSeenAt;
  const seenIds = config.notificationsSeenIds;
  const baseUrl = config.baseUrl;

  if (DEMO_MODE) {
    const rows = demoNotifications().map((row) => ({
      ...row,
      read: isRead(row.id, row.createdAt, seenAt, seenIds),
    }));
    return feedFromRows(rows, clampLimit);
  }

  const signedIn = config.cookies.some((cookie) => /^d2l(Secure)?SessionVal$/i.test(cookie.name));
  if (!signedIn) {
    return feedFromRows([], clampLimit);
  }

  if (!cache || force || Date.now() - cache.at >= CACHE_MS) {
    const session = { baseUrl, cookies: config.cookies };
    const result = await fetchAlerts(session);

    if (result.ok) {
      const courses = await fetchCourses(session).catch(() => null);
      cache = {
        at: Date.now(),
        alerts: result.alerts,
        courses: courses && courses !== 'expired' ? courses : [],
      };
      newsCache = null;
    } else {
      cache = null;
      const courses = await fetchCourses(session).catch(() => null);
      const list = courses && courses !== 'expired' ? courses : [];

      if (list.length > 0) {
        const entries = await loadAnnouncementEntries(list, baseUrl, config.cookies);
        const rows = announcementNotifications(entries, seenAt, seenIds);
        if (rows.length > 0) {
          // Announcements answer the question well enough; no scary banner.
          return feedFromRows(rows, clampLimit);
        }
      }

      const message =
        result.reason === 'expired'
          ? 'Your D2L session expired. Reconnect to load updates.'
          : 'D2L’s activity feed is not available for this school, so the bell uses course announcements.';
      return feedFromRows([], clampLimit, message);
    }
  }

  return buildFeed(cache.alerts, cache.courses, seenAt, clampLimit, baseUrl, null, seenIds);
}

/** Clear the bell: everything currently in it becomes read. */
export async function markNotificationsRead(): Promise<NotificationFeed> {
  // Remember the ids that were on screen as well as the moment: a post whose
  // date lands slightly in the future would otherwise stay new forever, and a
  // skewed clock must never leave a badge that cannot be cleared.
  const current = await getNotifications(MAX_ALERTS);
  const ids = current.items.map((item) => item.id);
  updateConfig((config) => ({
    ...config,
    notificationsSeenAt: new Date().toISOString(),
    notificationsSeenIds: ids,
  }));

  return {
    ...current,
    items: current.items.map((item) => ({ ...item, read: true })),
    unread: 0,
  };
}
