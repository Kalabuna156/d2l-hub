import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import {
  DATA_DIR,
  DEMO_MODE,
  clearSession,
  hasSessionCookie,
  normalizeBaseUrl,
  readConfig,
  writeConfig,
  type StoredCookie,
} from './config';
import { chromeInstallHint, findChrome } from './chrome';
import {
  parseAnnouncements,
  parseAssignments,
  parseContentModuleTitle,
  parseContentModules,
  parseContentTopics,
  parseCourses,
  parseEvents,
  parseGrades,
  parseUserName,
} from './parse';
import {
  clearImageCache,
  fetchCalendarEvents,
  fetchCourseImage,
  fetchCoursePage,
  fetchCourses,
  fetchHomeHtml,
  fetchHomeOrgUnit,
  fetchWhoAmI,
  type Session,
} from './d2l-api';
import { demoContent } from './demo';
import type {
  AppState,
  CalendarEvent,
  ConnectStatus,
  Course,
  CourseContent,
  CourseDetail,
  CourseGrades,
  CourseLink,
  DashboardData,
} from '../shared/types';

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

let connectStatus: ConnectStatus = { phase: 'idle', message: '' };
let cancelRequested = false;
let browser: Browser | null = null;

interface ChromeCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function homeUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/d2l/home`;
}

/** Keep only cookies that D2L itself needs; avoids persisting the whole SSO browser profile. */
function pickCookies(cookies: ChromeCookie[], baseUrl: string): StoredCookie[] {
  const baseHost = new URL(baseUrl).hostname.replace(/^www\./i, '');
  return cookies
    .filter((cookie) => {
      const domain = cookie.domain.replace(/^\./, '').toLowerCase();
      return baseHost === domain || baseHost.endsWith(`.${domain}`);
    })
    .map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
    }));
}

export function getConnectStatus(): ConnectStatus {
  return connectStatus;
}

/** Everything about the D2L session; the server adds preferences and integrations. */
export type BaseAppState = Omit<AppState, 'preferences' | 'integrations' | 'ai' | 'examBanks'>;

export function getAppState(): BaseAppState {
  const config = readConfig();
  return {
    baseUrl: config.baseUrl,
    connected: hasSessionCookie(config.cookies),
    userName: config.userName,
    savedAt: config.savedAt,
    chromeAvailable: Boolean(findChrome()),
    connect: connectStatus,
  };
}

export function cancelConnect(): ConnectStatus {
  cancelRequested = true;
  connectStatus = { phase: 'idle', message: 'Sign-in cancelled.' };
  void browser?.close().catch(() => undefined);
  browser = null;
  return connectStatus;
}

export function disconnect(): BaseAppState {
  cancelConnect();
  clearSession();
  clearImageCache();
  clearCourseCache();
  connectStatus = { phase: 'idle', message: '' };
  return getAppState();
}

export function setBaseUrl(input: string): BaseAppState {
  const config = readConfig();
  const baseUrl = normalizeBaseUrl(input);
  if (baseUrl !== config.baseUrl) {
    writeConfig({ ...config, baseUrl, cookies: [], userName: null, savedAt: null });
  }
  return getAppState();
}

async function runLogin(baseUrl: string): Promise<void> {
  const executablePath = findChrome();
  if (!executablePath) {
    throw new Error(`No Chromium browser was found. ${chromeInstallHint()}`);
  }

  const userDataDir = path.join(DATA_DIR, 'chrome-profile');
  fs.mkdirSync(userDataDir, { recursive: true });

  browser = await puppeteer.launch({
    executablePath,
    headless: false,
    defaultViewport: null,
    userDataDir,
    args: ['--start-maximized', '--no-first-run', '--no-default-browser-check'],
  });
  const launched = browser;

  try {
    const pages = await launched.pages();
    const page = pages[0] ?? (await launched.newPage());
    const cdp = await page.createCDPSession();

    await page
      .goto(homeUrl(baseUrl), { waitUntil: 'domcontentloaded', timeout: 60_000 })
      .catch(() => undefined);

    connectStatus = {
      phase: 'waiting',
      message: 'Complete the sign-in in the Chrome window. This screen updates automatically.',
    };

    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    while (Date.now() < deadline && !cancelRequested) {
      let cookies: StoredCookie[] = [];
      try {
        const result = (await cdp.send('Network.getAllCookies')) as { cookies: ChromeCookie[] };
        cookies = pickCookies(result.cookies, baseUrl);
      } catch {
        if (!launched.connected) {
          throw new Error('The sign-in window was closed before sign-in finished.');
        }
      }

      if (hasSessionCookie(cookies)) {
        const config = readConfig();
        writeConfig({
          ...config,
          baseUrl,
          cookies,
          savedAt: new Date().toISOString(),
          userName: config.userName,
        });
        connectStatus = { phase: 'connected', message: 'Signed in to D2L.' };

        // Best effort: remember the display name for the greeting.
        try {
          const who = await fetchWhoAmI({ baseUrl, cookies });
          if (who && who !== 'expired' && who.name) {
            writeConfig({ ...readConfig(), userName: who.name });
          }
        } catch {
          /* greeting can fall back to the scraper or the email later */
        }
        return;
      }

      await sleep(1500);
    }

    if (cancelRequested) return;
    throw new Error('Sign-in timed out after 5 minutes. Try connecting again.');
  } finally {
    if (launched.connected) await launched.close().catch(() => undefined);
    if (browser === launched) browser = null;
  }
}

export function startConnect(inputBaseUrl?: string): ConnectStatus {
  if (connectStatus.phase === 'waiting') return connectStatus;

  const config = readConfig();
  const baseUrl = normalizeBaseUrl(inputBaseUrl ?? config.baseUrl);
  if (baseUrl !== config.baseUrl) {
    writeConfig({ ...config, baseUrl, cookies: [], userName: null, savedAt: null });
  }

  cancelRequested = false;
  connectStatus = { phase: 'waiting', message: 'Opening a Chrome window…' };

  void runLogin(baseUrl)
    .then(() => undefined)
    .catch((error: unknown) => {
      if (cancelRequested) return;
      connectStatus = {
        phase: 'error',
        message: error instanceof Error ? error.message : 'Could not connect to D2L.',
      };
    });

  return connectStatus;
}

/** Render the home page in headless Chrome so JS-built widgets are included. */
async function renderHomePage(baseUrl: string, cookies: StoredCookie[]): Promise<string | null> {
  const executablePath = findChrome();
  if (!executablePath) return null;

  let headless: Browser | null = null;
  try {
    headless = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-first-run', '--no-default-browser-check'],
    });
    const page = await headless.newPage();
    await page.setViewport({ width: 1440, height: 1400 });
    await page.setCookie(...cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      expires: cookie.expires,
    })));
    await page.goto(homeUrl(baseUrl), { waitUntil: 'networkidle2', timeout: 45_000 });
    await sleep(1500);
    if (/\/d2l\/login/i.test(page.url())) return null;
    return await page.content();
  } catch {
    return null;
  } finally {
    if (headless?.connected) await headless.close().catch(() => undefined);
  }
}

export interface DashboardResult {
  data: DashboardData;
  connected: boolean;
}

function liveDashboard(
  baseUrl: string,
  userName: string | null,
  courses: Course[],
  events: CalendarEvent[],
): DashboardResult {
  return {
    connected: true,
    data: {
      source: 'live',
      notice: null,
      user: { name: userName, baseUrl },
      courses,
      events,
      fetchedAt: new Date().toISOString(),
    },
  };
}

/**
 * No session, nothing invented: the dashboard stays empty and the UI asks the
 * student to connect. Sample data exists only in preview mode (`--demo`).
 */
function emptyDashboard(
  baseUrl: string,
  notice: string | null,
  connected = false,
): DashboardResult {
  return {
    connected,
    data: {
      source: 'empty',
      notice,
      user: { name: null, baseUrl },
      courses: [],
      events: [],
      fetchedAt: new Date().toISOString(),
    },
  };
}

export async function loadDashboard(): Promise<DashboardResult> {
  const config = readConfig();
  const baseUrl = config.baseUrl;

  if (!hasSessionCookie(config.cookies)) {
    return emptyDashboard(
      baseUrl,
      'Connect your D2L account to load your courses, due dates and course files.',
    );
  }

  const session: Session = { baseUrl, cookies: config.cookies };

  const who = await fetchWhoAmI(session);
  if (who === 'expired') {
    clearSession();
    return emptyDashboard(
      baseUrl,
      'Your D2L session expired. Reconnect to load your courses again.',
    );
  }

  const home = await fetchHomeHtml(session);
  if (home === null && who === null) {
    return emptyDashboard(baseUrl, 'Could not reach D2L. Check your connection and refresh.', true);
  }

  let courses = await fetchCourses(session);
  if (courses === 'expired') {
    clearSession();
    return emptyDashboard(
      baseUrl,
      'Your D2L session expired. Reconnect to load your courses again.',
    );
  }

  let list: Course[] = courses ?? [];
  let events: CalendarEvent[] = [];
  let userName = who?.name ?? (home ? parseUserName(home) : null);
  userName = userName ?? config.userName;

  // Fallback for instances without the widget endpoint: read the home page tiles.
  if (list.length === 0 && home) {
    list = parseCourses(home, baseUrl);
    events = parseEvents(home, baseUrl);
  }

  // Brightspace builds some home widgets client-side; fall back to a real render.
  if (list.length === 0) {
    const rendered = await renderHomePage(baseUrl, config.cookies);
    if (rendered) {
      const renderedCourses = parseCourses(rendered, baseUrl);
      if (renderedCourses.length > 0) {
        list = renderedCourses;
        events = parseEvents(rendered, baseUrl);
        userName = parseUserName(rendered) ?? userName;
      }
    }
  }

  if (list.length > 0) {
    const orgUnit = await fetchHomeOrgUnit(session, home ?? undefined);
    if (orgUnit) {
      const calendarEvents = await fetchCalendarEvents(session, orgUnit, list);
      if (calendarEvents.length > 0) events = calendarEvents;
      else if (events.length === 0) events = parseEvents(home ?? '', baseUrl);
    }
  }

  if (userName && userName !== config.userName) {
    writeConfig({ ...readConfig(), userName });
  }

  if (list.length === 0) {
    return emptyDashboard(
      baseUrl,
      'Signed in, but no courses could be read from D2L. Refresh, or check that your courses are visible on the D2L home page.',
      true,
    );
  }

  return liveDashboard(baseUrl, userName, list, events);
}

const courseCache = new Map<string, { at: number; detail: CourseDetail }>();
const COURSE_CACHE_MS = 60_000;
const contentCache = new Map<string, { at: number; content: CourseContent }>();
const gradesCache = new Map<string, { at: number; grades: CourseGrades }>();
const COURSE_PAGE_CACHE_MS = 5 * 60_000;
let calendarCache: { at: number; events: CalendarEvent[] } | null = null;
const CALENDAR_CACHE_MS = 60_000;

export function clearCourseCache(): void {
  courseCache.clear();
  contentCache.clear();
  gradesCache.clear();
  calendarCache = null;
}

/** Calendar events for every course, cached briefly so opening courses stays fast. */
async function allCalendarEvents(session: Session, courses: Course[]): Promise<CalendarEvent[]> {
  if (calendarCache && Date.now() - calendarCache.at < CALENDAR_CACHE_MS) return calendarCache.events;

  const home = await fetchHomeHtml(session);
  const orgUnit = home ? await fetchHomeOrgUnit(session, home) : await fetchHomeOrgUnit(session);
  if (!orgUnit) return [];

  const events = await fetchCalendarEvents(session, orgUnit, courses);
  calendarCache = { at: Date.now(), events };
  return events;
}

/** Links that stay in D2L; content and grades are in-app tabs, quizzes are left out. */
function courseLinks(baseUrl: string, courseId: string): CourseLink[] {
  const base = baseUrl.replace(/\/+$/, '');
  return [
    { label: 'Announcements', href: `${base}/d2l/lms/news/main.d2l?ou=${courseId}` },
    { label: 'Assignments', href: `${base}/d2l/lms/dropbox/user/folders_list.d2l?ou=${courseId}` },
    { label: 'Discussions', href: `${base}/d2l/le/${courseId}/discussions/List` },
  ];
}

export async function loadCourse(courseId: string, fresh = false): Promise<CourseDetail | null> {
  if (!/^\d+$/.test(courseId)) return null;

  const config = readConfig();
  if (!hasSessionCookie(config.cookies)) return null;

  const cached = courseCache.get(courseId);
  if (!fresh && cached && Date.now() - cached.at < COURSE_CACHE_MS) return cached.detail;

  const session: Session = { baseUrl: config.baseUrl, cookies: config.cookies };
  const courses = await fetchCourses(session);
  if (!courses || courses === 'expired') return null;

  const course = courses.find((entry) => entry.id === courseId);
  if (!course) return null;

  const [news, assignmentsPage, events] = await Promise.all([
    fetchCoursePage(session, `/d2l/lms/news/main.d2l?ou=${courseId}`),
    fetchCoursePage(session, `/d2l/lms/dropbox/user/folders_list.d2l?ou=${courseId}`),
    allCalendarEvents(session, courses),
  ]);

  const detail: CourseDetail = {
    course,
    announcements: news ? parseAnnouncements(news, config.baseUrl) : [],
    assignments: assignmentsPage ? parseAssignments(assignmentsPage, config.baseUrl) : [],
    events: events.filter((event) => event.courseCode === course.code),
    links: courseLinks(config.baseUrl, courseId),
    notice:
      news === null && assignmentsPage === null
        ? 'D2L did not return this course. Your session may have expired — reconnect and try again.'
        : null,
    fetchedAt: new Date().toISOString(),
  };

  courseCache.set(courseId, { at: Date.now(), detail });
  return detail;
}

function activeSession(): Session | null {
  const config = readConfig();
  if (!hasSessionCookie(config.cookies)) return null;
  return { baseUrl: config.baseUrl, cookies: config.cookies };
}

/** Modules plus the topics D2L renders for the selected module. */
export async function loadCourseContent(
  courseId: string,
  moduleId?: string,
): Promise<CourseContent | null> {
  if (!/^\d+$/.test(courseId)) return null;
  if (DEMO_MODE) return demoContent(courseId, moduleId);
  const session = activeSession();
  if (!session) return null;

  const wanted = moduleId && /^\d+$/.test(moduleId) ? moduleId : null;
  const cacheKey = `${courseId}:${wanted ?? 'default'}`;
  const cached = contentCache.get(cacheKey);
  if (cached && Date.now() - cached.at < COURSE_PAGE_CACHE_MS) return cached.content;

  const path = wanted
    ? `/d2l/le/content/${courseId}/Home?itemIdentifier=ModuleCO-${wanted}`
    : `/d2l/le/content/${courseId}/Home`;
  const html = await fetchCoursePage(session, path);
  if (!html) return null;

  const modules = parseContentModules(html);
  const moduleTitle = parseContentModuleTitle(html);
  const resolvedId = wanted ?? modules.find((module) => module.name === moduleTitle)?.id ?? null;

  const content: CourseContent = {
    modules,
    moduleId: resolvedId,
    moduleTitle,
    topics: parseContentTopics(html, session.baseUrl),
    contentUrl: `${session.baseUrl.replace(/\/+$/, '')}/d2l/le/content/${courseId}/Home`,
    fetchedAt: new Date().toISOString(),
  };

  contentCache.set(cacheKey, { at: Date.now(), content });
  return content;
}

/** The gradebook rows D2L shows on the student's grades page. */
export async function loadCourseGrades(courseId: string): Promise<CourseGrades | null> {
  if (!/^\d+$/.test(courseId)) return null;
  const session = activeSession();
  if (!session) return null;

  const cached = gradesCache.get(courseId);
  if (cached && Date.now() - cached.at < COURSE_PAGE_CACHE_MS) return cached.grades;

  const html = await fetchCoursePage(session, `/d2l/lms/grades/my_grades/main.d2l?ou=${courseId}`);
  if (!html) return null;

  const grades: CourseGrades = {
    items: parseGrades(html, session.baseUrl),
    gradesUrl: `${session.baseUrl.replace(/\/+$/, '')}/d2l/lms/grades/my_grades/main.d2l?ou=${courseId}`,
    fetchedAt: new Date().toISOString(),
  };

  gradesCache.set(courseId, { at: Date.now(), grades });
  return grades;
}

/** Course banner images need the session cookie, so the browser loads them through us. */
export async function getCourseImage(
  orgUnitId: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  const config = readConfig();
  if (!hasSessionCookie(config.cookies)) return null;
  return fetchCourseImage({ baseUrl: config.baseUrl, cookies: config.cookies }, orgUnitId);
}
