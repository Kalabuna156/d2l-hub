import { cookieHeader, type StoredCookie } from './config';
import { parseCalendarMonth, parseCourseName } from './parse';
import type { CalendarEvent, Course } from '../shared/types';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

const TIMEOUT_MS = 20_000;

export interface Session {
  baseUrl: string;
  cookies: StoredCookie[];
}

export type ApiResponse =
  | { ok: true; text: string; url: string }
  | { ok: false; status: number; expired: boolean };

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function get(session: Session, path: string, accept: string): Promise<ApiResponse> {
  let response: Response;
  try {
    response = await fetch(`${normalizeBase(session.baseUrl)}${path}`, {
      headers: {
        cookie: cookieHeader(session.cookies),
        accept,
        'accept-language': 'en-CA,en;q=0.9',
        'user-agent': USER_AGENT,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 0, expired: false };
  }

  const text = await response.text().catch(() => '');
  // Brightspace bounces unauthenticated requests to the login page instead of 401.
  const expired =
    response.status === 401 ||
    response.status === 403 ||
    /\/d2l\/login/i.test(response.url) ||
    /<title>\s*Login/i.test(text.slice(0, 2000));

  if (!response.ok) return { ok: false, status: response.status, expired };
  return { ok: true, text, url: response.url };
}

async function getJson<T>(session: Session, path: string): Promise<T | null> {
  const response = await get(session, path, 'application/json');
  if (!response.ok) return null;
  try {
    return JSON.parse(response.text) as T;
  } catch {
    return null;
  }
}

/**
 * Brightspace exposes different API versions per product; read the latest one
 * once instead of guessing a version that may not exist on this instance.
 */
let versionCache: { lp: string; at: number } | null = null;

async function lpVersion(session: Session): Promise<string> {
  if (versionCache && Date.now() - versionCache.at < 6 * 60 * 60 * 1000) return versionCache.lp;

  const products = await getJson<Array<{ ProductCode: string; LatestVersion: string }>>(
    session,
    '/d2l/api/versions/',
  );
  const lp = products?.find((product) => product.ProductCode === 'lp')?.LatestVersion ?? '1.47';
  versionCache = { lp, at: Date.now() };
  return lp;
}

export interface WhoAmI {
  name: string | null;
  uniqueName: string | null;
  /** Numeric user id; the alerts feed is addressed by it */
  id: string | null;
}

export async function fetchWhoAmI(session: Session): Promise<WhoAmI | 'expired' | null> {
  const version = await lpVersion(session);
  const response = await get(session, `/d2l/api/lp/${version}/users/whoami`, 'application/json');
  if (!response.ok) return response.expired ? 'expired' : null;

  try {
    const body = JSON.parse(response.text) as {
      Identifier?: string | number;
      FirstName?: string;
      LastName?: string;
      UniqueName?: string;
    };
    const name = [body.FirstName, body.LastName].filter(Boolean).join(' ').trim();
    const id = body.Identifier === undefined ? '' : String(body.Identifier).trim();
    return {
      name: name || null,
      uniqueName: body.UniqueName ?? null,
      id: /^\d+$/.test(id) ? id : null,
    };
  } catch {
    return null;
  }
}

interface MyCourseRecord {
  OrgUnitId?: string;
  Name?: string;
  Code?: string;
  IsActive?: boolean;
  CanAccessCourse?: boolean;
  FormattedImageLink?: string;
}

/**
 * The "My Courses" home widget reads this endpoint. Unlike the Valence LE API
 * (which many institutions block for students) it is always available to the
 * signed-in user and already contains names, codes and banner images.
 */
export async function fetchCourses(session: Session): Promise<Course[] | 'expired' | null> {
  const body = await getJson<{ Courses?: MyCourseRecord[] }>(
    session,
    '/d2l/le/manageCourses/api/mycourses',
  );
  if (!body) {
    const probe = await get(session, '/d2l/le/manageCourses/api/mycourses', 'application/json');
    return !probe.ok && probe.expired ? 'expired' : null;
  }

  const base = normalizeBase(session.baseUrl);
  const courses: Course[] = [];
  const seen = new Set<string>();

  for (const record of body.Courses ?? []) {
    const id = String(record.OrgUnitId ?? '').trim();
    if (!/^\d+$/.test(id) || seen.has(id)) continue;
    seen.add(id);

    const rawName = parseCourseName(record.Name ?? '');
    const code = (record.Code ?? '').toUpperCase();
    if (!rawName && !code) continue;

    courses.push({
      id,
      name: rawName || code,
      code,
      url: `${base}/d2l/home/${id}`,
      imageUrl: record.FormattedImageLink ? `/api/course-image/${id}` : null,
    });
  }

  return courses;
}

export async function fetchCoursePage(session: Session, path: string): Promise<string | null> {
  const response = await get(session, path, 'text/html');
  return response.ok ? response.text : null;
}

export async function fetchHomeHtml(session: Session): Promise<string | null> {
  const response = await get(session, '/d2l/home', 'text/html');
  return response.ok ? response.text : null;
}

/** The home organisation id is needed to read the personal calendar. */
export async function fetchHomeOrgUnit(session: Session, homeHtml?: string): Promise<string | null> {
  let page = homeHtml;
  if (!page) {
    const response = await get(session, '/d2l/home', 'text/html');
    if (!response.ok) return null;
    page = response.text;
  }

  const calendar = /\/d2l\/le\/calendar\/(\d+)/.exec(page);
  if (calendar) return calendar[1];

  const ouHome = /\/d2l\/lp\/ouHome\/home\.d2l\?ou=(\d+)/.exec(page);
  return ouHome?.[1] ?? null;
}

export async function fetchCalendarEvents(
  session: Session,
  homeOrgUnit: string,
  courses: Course[],
): Promise<CalendarEvent[]> {
  const calendarUrl = `${normalizeBase(session.baseUrl)}/d2l/le/calendar/${homeOrgUnit}`;
  const response = await get(session, `/d2l/le/calendar/${homeOrgUnit}`, 'text/html');
  if (!response.ok) return [];

  return parseCalendarMonth(response.text, calendarUrl, courses);
}

/** One entry of the notification bell, as the LP alerts API returns it. */
export interface AlertRecord {
  Id?: string | number;
  OrgUnitId?: string | number;
  Category?: number;
  /** "Grade Updated", "Content Created"… */
  Title?: string;
  /** The sentence shown in the bell */
  Message?: string;
  MessageURL?: string;
  IconURL?: string;
  AlertDateTime?: string;
  FeedMessageSubjectType?: string;
}

interface AlertPage {
  Next?: string | null;
  Objects?: AlertRecord[];
}

export type AlertsResult =
  | { ok: true; alerts: AlertRecord[] }
  | { ok: false; reason: 'expired' | 'unavailable' | 'signed-out'; status?: number };

/**
 * The bell's feed: GET /d2l/api/lp/<version>/alerts/user/<id>. Brightspace pages
 * it with a `Next` URL rather than offsets, so follow those links (same origin
 * only) until the cap or the end of the list.
 */
export async function fetchAlerts(session: Session, maxPages = 5): Promise<AlertsResult> {
  const who = await fetchWhoAmI(session);
  if (who === 'expired') return { ok: false, reason: 'expired' };
  if (!who?.id) return { ok: false, reason: 'unavailable' };

  const version = await lpVersion(session);
  const origin = normalizeBase(session.baseUrl);
  let next: string | null = `${origin}/d2l/api/lp/${version}/alerts/user/${who.id}`;
  const alerts: AlertRecord[] = [];

  for (let page = 0; page < maxPages && next; page += 1) {
    let response: Response;
    try {
      response = await fetch(next, {
        headers: {
          cookie: cookieHeader(session.cookies),
          accept: 'application/json',
          'accept-language': 'en-CA,en;q=0.9',
          'user-agent': USER_AGENT,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return page === 0 ? { ok: false, reason: 'unavailable' } : { ok: true, alerts };
    }

    if (!response.ok) {
      if (page > 0) return { ok: true, alerts };
      // Only a real auth wall means "reconnect". A 403/404 here usually means
      // the school does not expose the activity feed at all, which is not the
      // user's session being stale.
      const expired = response.status === 401 || /\/d2l\/login/i.test(response.url);
      return { ok: false, reason: expired ? 'expired' : 'unavailable', status: response.status };
    }

    let body: AlertPage | null = null;
    try {
      body = (await response.json()) as AlertPage;
    } catch {
      return page === 0 ? { ok: false, reason: 'unavailable' } : { ok: true, alerts };
    }

    alerts.push(...(Array.isArray(body.Objects) ? body.Objects : []));

    const candidate = typeof body.Next === 'string' ? body.Next.trim() : '';
    if (!candidate) break;
    try {
      const url = new URL(candidate, `${origin}/`);
      next = url.origin === new URL(origin).origin ? url.href : null;
    } catch {
      next = null;
    }
  }

  return { ok: true, alerts };
}

const imageCache = new Map<string, { body: Buffer; contentType: string; at: number }>();
const IMAGE_TTL_MS = 60 * 60 * 1000;

/** Course banners are behind the session cookie, so they are proxied locally. */
export async function fetchCourseImage(
  session: Session,
  orgUnitId: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (!/^\d+$/.test(orgUnitId)) return null;

  const cached = imageCache.get(orgUnitId);
  if (cached && Date.now() - cached.at < IMAGE_TTL_MS) {
    return { body: cached.body, contentType: cached.contentType };
  }

  const version = await lpVersion(session);
  const path = `/d2l/api/lp/${version}/courses/${orgUnitId}/image?autoSelectImage=true`;

  try {
    const response = await fetch(`${normalizeBase(session.baseUrl)}${path}`, {
      headers: {
        cookie: cookieHeader(session.cookies),
        accept: 'image/*',
        'user-agent': USER_AGENT,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;

    const body = Buffer.from(await response.arrayBuffer());
    imageCache.set(orgUnitId, { body, contentType, at: Date.now() });
    return { body, contentType };
  } catch {
    return null;
  }
}

export function clearImageCache(): void {
  imageCache.clear();
}
