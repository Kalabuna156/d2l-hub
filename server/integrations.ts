import ical from 'node-ical';
import type { EventInstance, VEvent } from 'node-ical';
import type {
  CalendarEvent,
  EventOverride,
  IntegrationStatus,
  NotionDatabaseList,
  NotionDatabaseOption,
} from '../shared/types';
import { readConfig, updateConfig, type AppConfig } from './config';

const NOTION_API = 'https://api.notion.com/v1';
// 2022-06-28 is still supported and works with plain database ids; the newer
// data-source API would need extra discovery for every database.
const NOTION_VERSION = '2022-06-28';

const DAY = 86_400_000;
/**
 * How far back and forward synced events are read. Past entries exist so the
 * calendar can tuck them into a collapsed section; anything older is noise.
 */
const PAST_DAYS = 30;
const FUTURE_DAYS = 120;
// Short enough that the app's own five-minute poll always re-reads the feeds.
const CACHE_TTL_MS = 2 * 60_000;

/** True when a timestamp falls inside the window the app keeps around today. */
export function inSyncWindow(iso: string, now = new Date()): boolean {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  return time >= now.getTime() - PAST_DAYS * DAY && time <= now.getTime() + FUTURE_DAYS * DAY;
}

interface SyncCache {
  events: CalendarEvent[];
  googleCount: number;
  notionCount: number;
  at: number;
}

let cache: SyncCache | null = null;

function emptyStatus(): IntegrationStatus {
  return {
    google: { connected: false, label: null, lastSync: null, error: null, count: 0 },
    notion: { connected: false, label: null, lastSync: null, error: null, count: 0 },
  };
}

export function getIntegrationStatus(config: AppConfig = readConfig()): IntegrationStatus {
  const status = emptyStatus();
  status.google = {
    connected: Boolean(config.google.icalUrl),
    label: config.google.label,
    lastSync: config.google.lastSync,
    error: config.google.error,
    count: cache?.googleCount ?? 0,
  };
  status.notion = {
    connected: Boolean(config.notion.token && config.notion.databaseId),
    label: config.notion.databaseTitle,
    lastSync: config.notion.lastSync,
    error: config.notion.error,
    count: cache?.notionCount ?? 0,
  };
  return status;
}

export function invalidateIntegrationCache(): void {
  cache = null;
}

/** Cached events for the dashboard, refreshed when stale or forced. */
export async function getExternalEvents(force = false): Promise<CalendarEvent[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.events;

  const config = readConfig();
  const [google, notion] = await Promise.all([syncGoogle(config), syncNotion(config)]);

  const at = new Date().toISOString();
  updateConfig((current) => ({
    ...current,
    google: {
      ...current.google,
      lastSync: current.google.icalUrl ? at : current.google.lastSync,
      error: google.error,
    },
    notion: {
      ...current.notion,
      lastSync: current.notion.token && current.notion.databaseId ? at : current.notion.lastSync,
      error: notion.error,
    },
  }));

  const events = applyOverrides(
    [...(config.localEvents ?? []), ...google.events, ...notion.events],
    config.calendarOverrides,
  );
  cache = {
    events,
    googleCount: google.events.length,
    notionCount: notion.events.length,
    at: Date.now(),
  };
  return events;
}

// ---------------------------------------------------------------------------
// Local edits on top of synced events
// ---------------------------------------------------------------------------

const MAX_TEXT = 200;

/** Apply stored changes; a hidden event stays in the list so it can be restored. */
export function applyOverrides(
  events: CalendarEvent[],
  overrides: Record<string, EventOverride>,
): CalendarEvent[] {
  if (Object.keys(overrides).length === 0) return events;
  return events.map((event) => {
    const override = overrides[event.id];
    if (!override) return event;
    return {
      ...event,
      title: override.title ?? event.title,
      location: override.location !== undefined ? override.location : (event.location ?? null),
      startsAt: override.startsAt ?? event.startsAt,
      endsAt: override.endsAt !== undefined ? override.endsAt : (event.endsAt ?? null),
      ...(override.hidden ? { hidden: true } : {}),
      edited: true,
    };
  });
}

function isoOrUndefined(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** Validate one change coming from the interface. */
export function sanitizeOverride(input: unknown): EventOverride {
  const patch = (input ?? {}) as Record<string, unknown>;
  const result: EventOverride = {};

  if ('title' in patch) {
    if (typeof patch.title !== 'string' || patch.title.trim().length === 0) {
      throw new Error('Give the class a name.');
    }
    const title = patch.title.trim();
    if (title.length > MAX_TEXT) throw new Error('That name is too long.');
    result.title = title;
  }

  if ('location' in patch) {
    if (patch.location !== null && typeof patch.location !== 'string') {
      throw new Error('The room has to be text.');
    }
    const location = typeof patch.location === 'string' ? patch.location.trim() : '';
    if (location.length > MAX_TEXT) throw new Error('That room name is too long.');
    result.location = location.length > 0 ? location : null;
  }

  if ('startsAt' in patch) {
    const startsAt = isoOrUndefined(patch.startsAt);
    if (!startsAt) throw new Error('That start time is not valid.');
    result.startsAt = startsAt;
  }

  if ('endsAt' in patch) {
    const endsAt = isoOrUndefined(patch.endsAt);
    if (endsAt === undefined) throw new Error('That end time is not valid.');
    result.endsAt = endsAt;
  }

  if ('hidden' in patch) {
    if (typeof patch.hidden !== 'boolean') throw new Error('A class is either hidden or not.');
    result.hidden = patch.hidden;
  }

  if (Object.keys(result).length === 0) throw new Error('Nothing was changed.');
  return result;
}

function overrideKey(id: unknown): string {
  const key = typeof id === 'string' ? id.trim() : '';
  if (!key.startsWith('gcal-') || key.length > 500) throw new Error('That class could not be found.');
  return key;
}

/** Store a local change for one class, replacing what Google reports for it. */
export function setEventOverride(id: unknown, patch: unknown): void {
  const key = overrideKey(id);
  const change = sanitizeOverride(patch);
  updateConfig((config) => {
    const merged: EventOverride = { ...config.calendarOverrides[key], ...change };
    if (merged.startsAt && merged.endsAt && new Date(merged.endsAt).getTime() <= new Date(merged.startsAt).getTime()) {
      throw new Error('The class has to end after it starts.');
    }
    return { ...config, calendarOverrides: { ...config.calendarOverrides, [key]: merged } };
  });
  cache = null;
}

/** Drop every local change for one class, going back to what the feed says. */
export function clearEventOverride(id: unknown): void {
  const key = overrideKey(id);
  updateConfig((config) => {
    if (!config.calendarOverrides[key]) return config;
    const next = { ...config.calendarOverrides };
    delete next[key];
    return { ...config, calendarOverrides: next };
  });
  cache = null;
}

// ---------------------------------------------------------------------------
// Events created in the app
// ---------------------------------------------------------------------------

export interface LocalEventInput {
  title?: unknown;
  location?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  courseCode?: unknown;
}

interface CleanLocalEvent {
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  courseCode: string | null;
}

/** Validate an event typed into the week grid. */
export function sanitizeLocalEvent(input: LocalEventInput): CleanLocalEvent {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) throw new Error('Give the event a name.');
  if (title.length > MAX_TEXT) throw new Error('That name is too long.');

  const location = typeof input.location === 'string' ? input.location.trim() : '';
  if (location.length > MAX_TEXT) throw new Error('That room name is too long.');

  const startsAt = isoOrUndefined(input.startsAt);
  const endsAt = isoOrUndefined(input.endsAt);
  if (!startsAt) throw new Error('Pick a start time.');
  if (!endsAt) throw new Error('Pick an end time.');
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new Error('The event has to end after it starts.');
  }

  const courseCode =
    typeof input.courseCode === 'string' ? input.courseCode.trim().slice(0, 20) : '';

  return {
    title,
    location: location.length > 0 ? location : null,
    startsAt,
    endsAt,
    courseCode: courseCode.length > 0 ? courseCode : null,
  };
}

function localKey(id: unknown): string {
  const key = typeof id === 'string' ? id.trim() : '';
  if (!key.startsWith('local-') || key.length > 200) throw new Error('That event could not be found.');
  return key;
}

export function listLocalEvents(): CalendarEvent[] {
  return readConfig().localEvents ?? [];
}

/** Add an event that lives only in this app. */
export function createLocalEvent(input: LocalEventInput): CalendarEvent {
  const clean = sanitizeLocalEvent(input);
  const event: CalendarEvent = {
    id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    ...clean,
    whenLabel: null,
    url: null,
    source: 'local',
    calendarName: 'My events',
  };
  updateConfig((config) => ({ ...config, localEvents: [...(config.localEvents ?? []), event] }));
  cache = null;
  return event;
}

export function updateLocalEvent(id: unknown, input: LocalEventInput): CalendarEvent {
  const key = localKey(id);
  const existing = listLocalEvents().find((event) => event.id === key);
  if (!existing) throw new Error('That event no longer exists.');

  const clean = sanitizeLocalEvent(input);
  const updated: CalendarEvent = { ...existing, ...clean };
  updateConfig((config) => ({
    ...config,
    localEvents: (config.localEvents ?? []).map((event) => (event.id === key ? updated : event)),
  }));
  cache = null;
  return updated;
}

/**
 * Save due dates read out of an uploaded course outline. A date already on the
 * calendar (same name, same moment) is skipped, so re-uploading a corrected
 * outline does not double every entry.
 */
export function importFormDeadlines(
  courseCode: unknown,
  deadlines: unknown,
): { added: number; skipped: number; events: CalendarEvent[] } {
  if (!Array.isArray(deadlines) || deadlines.length === 0) {
    throw new Error('There are no dates to add.');
  }
  if (deadlines.length > 200) throw new Error('That is too many dates for one outline.');

  const code = typeof courseCode === 'string' ? courseCode.trim().slice(0, 20) : '';
  const config = readConfig();
  const seen = new Set(
    (config.localEvents ?? []).map((event) => `${event.title.toLowerCase()}|${event.startsAt}`),
  );

  const imported: CalendarEvent[] = [];
  let skipped = 0;

  for (const item of deadlines) {
    const input = (item ?? {}) as LocalEventInput;
    let clean: CleanLocalEvent;
    try {
      clean = sanitizeLocalEvent({ ...input, courseCode: code });
    } catch {
      skipped += 1;
      continue;
    }

    const key = `${clean.title.toLowerCase()}|${clean.startsAt}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);

    imported.push({
      id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      ...clean,
      whenLabel: null,
      url: null,
      source: 'form',
      calendarName: 'Course outline',
    });
  }

  if (imported.length > 0) {
    updateConfig((current) => ({
      ...current,
      localEvents: [...(current.localEvents ?? []), ...imported],
    }));
    cache = null;
  }

  return { added: imported.length, skipped, events: listLocalEvents() };
}

export function removeLocalEvent(id: unknown): void {
  const key = localKey(id);
  updateConfig((config) => ({
    ...config,
    localEvents: (config.localEvents ?? []).filter((event) => event.id !== key),
  }));
  cache = null;
}

// ---------------------------------------------------------------------------
// Google Calendar (private iCal address)
// ---------------------------------------------------------------------------

export function normalizeIcalUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = trimmed.replace(/^webcal:\/\//i, 'https://');
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return decodeEntities(value).trim();
  if (value && typeof value === 'object' && 'val' in value) {
    const inner = (value as { val?: unknown }).val;
    if (typeof inner === 'string') return decodeEntities(inner).trim();
  }
  return '';
}

function calendarNameOf(parsed: Record<string, unknown>): string | null {
  const root = parsed.vcalendar as { 'WR-CALNAME'?: unknown } | undefined;
  const name = root ? textOf(root['WR-CALNAME']) : '';
  return name || null;
}

function localNoon(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 12, 0, 0, 0);
}

/**
 * Turn an iCalendar feed into dashboard events, expanding recurring entries
 * across the display window so a weekly class does not collapse into one row.
 */
export function parseIcalFeed(text: string, fallbackLabel: string | null, now = new Date()): CalendarEvent[] {
  const parsed = ical.sync.parseICS(text) as unknown as Record<string, unknown>;
  const calendarName = calendarNameOf(parsed) ?? fallbackLabel;
  const from = new Date(now.getTime() - PAST_DAYS * DAY);
  const to = new Date(now.getTime() + FUTURE_DAYS * DAY);
  const events: CalendarEvent[] = [];

  for (const component of Object.values(parsed)) {
    if (!component || typeof component !== 'object') continue;
    const event = component as VEvent & { type?: string; status?: string };
    if (event.type !== 'VEVENT') continue;
    if (String(event.status ?? '').toUpperCase() === 'CANCELLED') continue;

    let instances: EventInstance[] = [];
    try {
      instances = ical.expandRecurringEvent(event, { from, to, expandOngoing: true });
    } catch {
      continue;
    }

    for (const instance of instances) {
      const start = instance.start instanceof Date ? instance.start : new Date(String(instance.start));
      if (Number.isNaN(start.getTime())) continue;
      const startsAt = instance.isFullDay
        ? localNoon(start.getFullYear(), start.getMonth(), start.getDate()).toISOString()
        : start.toISOString();
      if (!inSyncWindow(startsAt, now)) continue;
      // All-day entries stay date-only; a timed entry with an end is a class block.
      const rawEnd = instance.end instanceof Date ? instance.end : null;
      const endsAt =
        !instance.isFullDay && rawEnd && !Number.isNaN(rawEnd.getTime()) ? rawEnd.toISOString() : null;
      const source = (instance.event ?? event) as VEvent;
      const location = textOf(source.location) || textOf(event.location) || null;
      const title = textOf(instance.summary) || textOf(event.summary) || 'Untitled event';
      const uid = typeof event.uid === 'string' ? event.uid : title;
      events.push({
        id: `gcal-${uid}-${startsAt}`,
        title,
        courseCode: null,
        startsAt,
        endsAt,
        location,
        whenLabel: null,
        url: typeof event.url === 'string' ? event.url : null,
        source: 'google',
        calendarName,
      });
    }
  }

  return events.sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
}

async function fetchText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { 'user-agent': 'D2L-Hub/1.0' },
    });
  } catch {
    throw new Error('Could not reach that calendar address. Check the link and your connection.');
  }
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'That calendar address was not found. Re-copy it from Google Calendar settings.'
        : `Google Calendar returned ${response.status}. Check the address and try again.`,
    );
  }
  return response.text();
}

/** Validate and store a private iCal address, returning the events it yields. */
export async function connectGoogleFeed(input: string): Promise<CalendarEvent[]> {
  const url = normalizeIcalUrl(input);
  if (!url) throw new Error('Paste the full https:// address of the calendar.');

  const text = await fetchText(url);
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    throw new Error('That address did not return a calendar. Use the “Secret address in iCal format”.');
  }

  const fallback = (() => {
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  })();
  const events = parseIcalFeed(text, fallback);

  updateConfig((current) => ({
    ...current,
    google: {
      icalUrl: url,
      label: events[0]?.calendarName ?? fallback,
      lastSync: new Date().toISOString(),
      error: null,
    },
  }));
  const overrideConfig = readConfig();
  const merged = applyOverrides(events, overrideConfig.calendarOverrides);
  cache = {
    events: [
      ...merged,
      ...(overrideConfig.localEvents ?? []),
      ...(cache?.events.filter((event) => event.source === 'notion') ?? []),
    ],
    googleCount: events.length,
    notionCount: cache?.notionCount ?? 0,
    at: Date.now(),
  };
  return merged;
}

export function disconnectGoogle(): void {
  updateConfig((current) => ({
    ...current,
    google: { icalUrl: null, label: null, lastSync: null, error: null },
  }));
  cache = cache ? { ...cache, events: cache.events.filter((event) => event.source !== 'google'), googleCount: 0, at: Date.now() } : null;
}

async function syncGoogle(config: AppConfig): Promise<{ events: CalendarEvent[]; error: string | null }> {
  if (!config.google.icalUrl) return { events: [], error: null };
  try {
    const text = await fetchText(config.google.icalUrl);
    const events = parseIcalFeed(text, config.google.label);
    if (events[0]?.calendarName && events[0].calendarName !== config.google.label) {
      updateConfig((current) => ({
        ...current,
        google: { ...current.google, label: events[0].calendarName ?? current.google.label },
      }));
    }
    return { events, error: null };
  } catch (error) {
    return {
      events: [],
      error: error instanceof Error ? error.message : 'Could not read that Google Calendar feed.',
    };
  }
}

// ---------------------------------------------------------------------------
// Notion (one database of deadlines)
// ---------------------------------------------------------------------------

function readToken(input: string): string {
  const token = input.trim();
  if (!token) throw new Error('Paste the integration token first.');
  if (token.length > 400) throw new Error('That token looks too long. Copy just the Internal Integration Secret.');
  return token;
}

function notionHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'notion-version': NOTION_VERSION,
    'content-type': 'application/json',
  };
}

function notionError(status: number, body: unknown): Error {
  const code = (body as { code?: string } | null)?.code;
  if (status === 401) return new Error('Notion rejected that token. Copy the Internal Integration Secret again.');
  if (status === 404) return new Error('Notion cannot see that database. Share it with your integration, then retry.');
  if (code === 'validation_error') return new Error('Notion could not read that database. Try a single-source database.');
  return new Error(`Notion returned ${status}. Check the token and the database, then retry.`);
}

async function notionRequest<T>(token: string, path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${NOTION_API}${path}`, {
      method: 'POST',
      headers: notionHeaders(token),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error('Could not reach Notion. Check your connection and try again.');
  }
  const json = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw notionError(response.status, json);
  return json as T;
}

interface NotionRichText {
  plain_text?: string;
}

interface NotionProperty {
  type?: string;
  title?: NotionRichText[];
  date?: { start?: string | null; end?: string | null } | null;
  rich_text?: NotionRichText[];
  select?: { name?: string } | null;
}

interface NotionPage {
  id: string;
  url?: string;
  properties?: Record<string, NotionProperty>;
}

interface NotionDatabase {
  id: string;
  title?: NotionRichText[];
  url?: string;
  properties?: Record<string, NotionProperty>;
}

interface NotionSearchResponse {
  results: NotionDatabase[];
}

interface NotionQueryResponse {
  results: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
}

function plainText(parts: NotionRichText[] | undefined): string {
  return (parts ?? [])
    .map((part) => part.plain_text ?? '')
    .join('')
    .trim();
}

function pickDateProperty(properties: Record<string, NotionProperty> | undefined): string | null {
  const entries = Object.entries(properties ?? {});
  const dates = entries.filter(([, value]) => value?.type === 'date');
  if (dates.length === 0) return null;
  const preferred = dates.find(([name]) => /due|deadline|date|when/i.test(name));
  return (preferred ?? dates[0])[0];
}

function notionPageDate(page: NotionPage, dateProperty: string | null): string | null {
  const properties = page.properties ?? {};
  const candidates = dateProperty ? [dateProperty] : Object.keys(properties);
  for (const name of candidates) {
    const property = properties[name];
    if (property?.type !== 'date' || !property.date?.start) continue;
    return property.date.start;
  }
  return null;
}

function notionPageTitle(page: NotionPage): string {
  for (const property of Object.values(page.properties ?? {})) {
    if (property?.type === 'title') {
      const text = plainText(property.title);
      if (text) return text;
    }
  }
  return 'Untitled entry';
}

/** Local calendar day, used for the Notion date filter so no entry slips a day. */
function localIsoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Read the dated entries of a database. The filter keeps the query small: the
 * whole history of a semester-long database is not worth the round trips.
 */
async function fetchNotionPages(
  token: string,
  databaseId: string,
  dateProperty: string | null,
): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  const filter = dateProperty
    ? { property: dateProperty, date: { on_or_after: localIsoDay(new Date(Date.now() - PAST_DAYS * DAY)) } }
    : undefined;
  let cursor: string | null | undefined;
  for (let page = 0; page < 3; page += 1) {
    const response = await notionRequest<NotionQueryResponse>(token, `/databases/${databaseId}/query`, {
      page_size: 100,
      ...(filter ? { filter } : {}),
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...(response.results ?? []));
    if (!response.has_more || !response.next_cursor) break;
    cursor = response.next_cursor;
  }
  return pages;
}

/** ISO date or datetime from Notion → an ISO timestamp; date-only entries land at local noon. */
function notionTimestamp(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return localNoon(year, month - 1, day).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Map Notion database pages to dashboard events. Exported for tests. */
export function mapNotionPages(
  pages: NotionPage[],
  databaseTitle: string,
  dateProperty: string | null,
  now = new Date(),
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const page of pages) {
    const rawDate = notionPageDate(page, dateProperty);
    if (!rawDate) continue;
    const startsAt = notionTimestamp(rawDate);
    if (!startsAt || !inSyncWindow(startsAt, now)) continue;
    events.push({
      id: `notion-${page.id}`,
      title: notionPageTitle(page),
      courseCode: null,
      startsAt,
      whenLabel: null,
      url: typeof page.url === 'string' ? page.url : null,
      source: 'notion',
      calendarName: databaseTitle,
    });
  }
  return events.sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
}

/** List the databases this integration token can see. */
export async function listNotionDatabases(input: string): Promise<NotionDatabaseList> {
  const token = readToken(input);

  const result = await notionRequest<NotionSearchResponse>(token, '/search', {
    filter: { property: 'object', value: 'database' },
    page_size: 100,
  });

  const databases: NotionDatabaseOption[] = (result.results ?? [])
    .map((database) => ({
      id: database.id,
      title: plainText(database.title) || 'Untitled database',
      dateProperty: pickDateProperty(database.properties),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return { databases, empty: databases.length === 0 };
}

/** Store the token + database and pull the dated entries. */
export async function connectNotion(tokenInput: string, databaseId: string): Promise<CalendarEvent[]> {
  const token = readToken(tokenInput);
  const id = databaseId.trim();
  if (!id) throw new Error('Choose a database first.');

  const list = await listNotionDatabases(token);
  const database = list.databases.find((entry) => entry.id === id);
  if (!database) throw new Error('That database is not shared with this integration.');

  const pages = await fetchNotionPages(token, id, database.dateProperty);
  const events = mapNotionPages(pages, database.title, database.dateProperty);

  updateConfig((current) => ({
    ...current,
    notion: {
      token,
      databaseId: id,
      databaseTitle: database.title,
      dateProperty: database.dateProperty,
      lastSync: new Date().toISOString(),
      error: null,
    },
  }));
  cache = {
    events: [...(cache?.events.filter((event) => event.source === 'google') ?? []), ...events],
    googleCount: cache?.googleCount ?? 0,
    notionCount: events.length,
    at: Date.now(),
  };
  return events;
}

export function disconnectNotion(): void {
  updateConfig((current) => ({
    ...current,
    notion: {
      token: null,
      databaseId: null,
      databaseTitle: null,
      dateProperty: null,
      lastSync: null,
      error: null,
    },
  }));
  cache = cache ? { ...cache, events: cache.events.filter((event) => event.source !== 'notion'), notionCount: 0, at: Date.now() } : null;
}

async function syncNotion(config: AppConfig): Promise<{ events: CalendarEvent[]; error: string | null }> {
  if (!config.notion.token || !config.notion.databaseId) return { events: [], error: null };
  try {
    const pages = await fetchNotionPages(
      config.notion.token,
      config.notion.databaseId,
      config.notion.dateProperty,
    );
    return {
      events: mapNotionPages(pages, config.notion.databaseTitle ?? 'Notion', config.notion.dateProperty),
      error: null,
    };
  } catch (error) {
    return {
      events: [],
      error: error instanceof Error ? error.message : 'Could not read that Notion database.',
    };
  }
}
