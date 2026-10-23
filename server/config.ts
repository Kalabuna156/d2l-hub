import fs from 'node:fs';
import path from 'node:path';
import type {
  AiProvider,
  CalendarEvent,
  EventOverride,
  ExamBankSource,
  LibraryFile,
  OutlineRecord,
  Preferences,
  StudyGuideRecord,
} from '../shared/types';

/**
 * Preview mode (D2L_HUB_DEMO=1 or --demo): sample data only. It gets its own
 * data folder, so a demo run can never read or overwrite a real session.
 */
export const DEMO_MODE =
  /^(1|true|yes)$/i.test(process.env.D2L_HUB_DEMO ?? '') || process.argv.includes('--demo');

// The desktop app points this at Electron's per-user data folder; from source it
// stays next to the project so `npm run dev` keeps working as before.
export const DATA_DIR = process.env.D2L_HUB_DATA_DIR
  ? path.resolve(process.env.D2L_HUB_DATA_DIR)
  : path.resolve(process.cwd(), DEMO_MODE ? '.data-preview' : '.data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

export interface StoredCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
}

export interface GoogleIntegrationConfig {
  /** Private iCal address (a secret: never send it back to the browser) */
  icalUrl: string | null;
  /** Calendar name from X-WR-CALNAME, or the feed host */
  label: string | null;
  lastSync: string | null;
  error: string | null;
}

export interface NotionIntegrationConfig {
  /** Internal integration token (a secret: never send it back to the browser) */
  token: string | null;
  databaseId: string | null;
  databaseTitle: string | null;
  /** Property the due dates come from */
  dateProperty: string | null;
  lastSync: string | null;
  error: string | null;
}

export interface AiConfig {
  provider: AiProvider;
  /** Stored on this computer only; never sent back to the browser */
  apiKey: string | null;
  model: string | null;
  /** OpenAI-compatible endpoint, used when provider is "custom" */
  customBaseUrl: string | null;
  /** Send the text of lecture files along with a study request */
  allowCourseFiles: boolean;
}

export interface AppConfig {
  baseUrl: string;
  userName: string | null;
  savedAt: string | null;
  cookies: StoredCookie[];
  preferences: Preferences;
  google: GoogleIntegrationConfig;
  notion: NotionIntegrationConfig;
  /** Local tweaks to synced calendar events, keyed by event id */
  calendarOverrides: Record<string, EventOverride>;
  /** Events created in this app; they never touch Google Calendar */
  localEvents: CalendarEvent[];
  /** Files saved into Content Space; the bytes live in DATA_DIR/content */
  contentFiles: LibraryFile[];
  /** Extra Google Drive folders shown next to the MUES exam bank */
  examBankSources: ExamBankSource[];
  /** When the notification bell was last cleared, so old alerts stay read */
  notificationsSeenAt: string | null;
  /** Items cleared by id, so a future-dated post still counts as read */
  notificationsSeenIds: string[];
  /** The user's own AI provider */
  ai: AiConfig;
  /** Outlines kept for Study, keyed by short course code in each entry */
  outlines: OutlineRecord[];
  /** Generated study plans, so reopening one is instant */
  studyGuides: StudyGuideRecord[];
}

export const DEFAULT_BASE_URL = 'https://courses.torontomu.ca';

export const DEFAULT_AI: AiConfig = {
  provider: 'gemini',
  apiKey: null,
  model: null,
  customBaseUrl: null,
  allowCourseFiles: false,
};

export const DEFAULT_PREFERENCES: Preferences = {
  accent: 'violet',
  backdrop: 'aurora',
  backgroundImage: null,
  imageDim: 55,
  examBank: true,
  newOverview: true,
};

const DEFAULT_CONFIG: AppConfig = {
  baseUrl: DEFAULT_BASE_URL,
  userName: null,
  savedAt: null,
  cookies: [],
  preferences: { ...DEFAULT_PREFERENCES },
  google: { icalUrl: null, label: null, lastSync: null, error: null },
  notion: {
    token: null,
    databaseId: null,
    databaseTitle: null,
    dateProperty: null,
    lastSync: null,
    error: null,
  },
  calendarOverrides: {},
  localEvents: [],
  contentFiles: [],
  examBankSources: [],
  notificationsSeenAt: null,
  notificationsSeenIds: [],
  ai: { ...DEFAULT_AI },
  outlines: [],
  studyGuides: [],
};

/** At most this many extra exam-bank folders; more is a wall of tabs, not a feature. */
export const MAX_EXAM_BANKS = 12;

/** Hand-edited or half-written entries are dropped rather than trusted. */
function mergeExamBankSources(raw: unknown): ExamBankSource[] {
  if (!Array.isArray(raw)) return [];
  const sources: ExamBankSource[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const candidate = (item ?? {}) as Partial<ExamBankSource>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const url = typeof candidate.url === 'string' ? candidate.url.trim().slice(0, 500) : '';
    const name =
      typeof candidate.name === 'string'
        ? candidate.name.replace(/\s+/g, ' ').trim().slice(0, 60)
        : '';
    if (!/^bank-[a-z0-9]{4,40}$/i.test(id) || !url || seen.has(id)) continue;
    seen.add(id);
    sources.push({ id, name: name || 'Exam bank', url });
    if (sources.length >= MAX_EXAM_BANKS) break;
  }

  return sources;
}

/** Unknown or hand-edited values fall back to the default of the same key. */
function mergePreferences(raw: unknown): Preferences {
  const input = (raw ?? {}) as Partial<Preferences>;
  const accent = ['violet', 'sky', 'emerald', 'amber', 'rose', 'fuchsia'].includes(String(input.accent))
    ? (input.accent as Preferences['accent'])
    : DEFAULT_PREFERENCES.accent;
  const backdrop = ['aurora', 'noir', 'sunset', 'ocean', 'meadow'].includes(String(input.backdrop))
    ? (input.backdrop as Preferences['backdrop'])
    : DEFAULT_PREFERENCES.backdrop;
  const image = typeof input.backgroundImage === 'string' ? input.backgroundImage.trim().slice(0, 2000) : '';
  const dim = Number(input.imageDim);
  return {
    accent,
    backdrop,
    backgroundImage: /^https?:\/\//i.test(image) ? image : null,
    imageDim: Number.isFinite(dim) ? Math.min(100, Math.max(0, Math.round(dim))) : DEFAULT_PREFERENCES.imageDim,
    examBank: typeof input.examBank === 'boolean' ? input.examBank : DEFAULT_PREFERENCES.examBank,
    newOverview: typeof input.newOverview === 'boolean' ? input.newOverview : DEFAULT_PREFERENCES.newOverview,
  };
}

const AI_PROVIDERS: AiProvider[] = ['gemini', 'openai', 'anthropic', 'custom'];

function mergeAi(raw: unknown): AiConfig {
  const input = (raw ?? {}) as Partial<AiConfig>;
  const provider = AI_PROVIDERS.includes(input.provider as AiProvider)
    ? (input.provider as AiProvider)
    : DEFAULT_AI.provider;
  const key = typeof input.apiKey === 'string' ? input.apiKey.trim().slice(0, 300) : '';
  const model = typeof input.model === 'string' ? input.model.trim().slice(0, 80) : '';
  const base = typeof input.customBaseUrl === 'string' ? input.customBaseUrl.trim().slice(0, 400) : '';
  return {
    provider,
    apiKey: key || null,
    model: model || null,
    customBaseUrl: /^https?:\/\//i.test(base) ? base.replace(/\/+$/, '') : null,
    allowCourseFiles: input.allowCourseFiles === true,
  };
}

function mergeOutlines(raw: unknown): OutlineRecord[] {
  if (!Array.isArray(raw)) return [];
  const records: OutlineRecord[] = [];
  for (const item of raw) {
    const input = (item ?? {}) as Partial<OutlineRecord>;
    if (typeof input.courseCode !== 'string' || typeof input.text !== 'string') continue;
    if (!input.text.trim()) continue;
    records.push({
      courseCode: input.courseCode.trim().slice(0, 20),
      fileName: typeof input.fileName === 'string' ? input.fileName.slice(0, 160) : 'Course outline',
      source: input.source === 'd2l' || input.source === 'library' ? input.source : 'saved',
      text: input.text.slice(0, 60_000),
      savedAt:
        typeof input.savedAt === 'string' && !Number.isNaN(Date.parse(input.savedAt))
          ? input.savedAt
          : new Date().toISOString(),
    });
    if (records.length >= 24) break;
  }
  return records;
}

function mergeStudyGuides(raw: unknown): StudyGuideRecord[] {
  if (!Array.isArray(raw)) return [];
  const guides: StudyGuideRecord[] = [];
  for (const item of raw) {
    const input = (item ?? {}) as Partial<StudyGuideRecord>;
    if (typeof input.key !== 'string' || !input.plan || typeof input.plan !== 'object') continue;
    if (
      !Array.isArray(input.plan.focus) ||
      !Array.isArray(input.plan.checklist) ||
      !Array.isArray(input.plan.bookPractice) ||
      !Array.isArray(input.plan.practice)
    ) {
      continue;
    }
    guides.push({
      key: input.key.slice(0, 220),
      courseCode: typeof input.courseCode === 'string' ? input.courseCode.slice(0, 20) : null,
      title: typeof input.title === 'string' ? input.title.slice(0, 160) : 'Assessment',
      startsAt: typeof input.startsAt === 'string' ? input.startsAt : null,
      plan: input.plan,
      generatedAt:
        typeof input.generatedAt === 'string' && !Number.isNaN(Date.parse(input.generatedAt))
          ? input.generatedAt
          : new Date().toISOString(),
      readByAi: Array.isArray(input.readByAi)
        ? input.readByAi.filter((name): name is string => typeof name === 'string').slice(0, 20)
        : [],
    });
  }
  return guides;
}

export function readConfig(): AppConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Partial<AppConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      cookies: Array.isArray(raw.cookies) ? raw.cookies : [],
      preferences: mergePreferences(raw.preferences),
      google: { ...DEFAULT_CONFIG.google, ...(raw.google ?? {}) },
      notion: { ...DEFAULT_CONFIG.notion, ...(raw.notion ?? {}) },
      calendarOverrides:
        raw.calendarOverrides && typeof raw.calendarOverrides === 'object' && !Array.isArray(raw.calendarOverrides)
          ? raw.calendarOverrides
          : {},
      localEvents: Array.isArray(raw.localEvents) ? raw.localEvents : [],
      contentFiles: Array.isArray(raw.contentFiles) ? raw.contentFiles : [],
      examBankSources: mergeExamBankSources(raw.examBankSources),
      notificationsSeenAt:
        typeof raw.notificationsSeenAt === 'string' && !Number.isNaN(Date.parse(raw.notificationsSeenAt))
          ? raw.notificationsSeenAt
          : null,
      notificationsSeenIds: Array.isArray(raw.notificationsSeenIds)
        ? raw.notificationsSeenIds
            .filter((id): id is string => typeof id === 'string' && /^[a-z0-9:_-]{1,140}$/i.test(id))
            .slice(0, 300)
        : [],
      ai: mergeAi(raw.ai),
      outlines: mergeOutlines(raw.outlines),
      studyGuides: mergeStudyGuides(raw.studyGuides),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(config: AppConfig): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/** Read, change a slice of the config and persist it in one step. */
export function updateConfig(change: (current: AppConfig) => AppConfig): AppConfig {
  const next = change(readConfig());
  // Normalise whatever the caller merged in, so a bad value never reaches disk.
  next.preferences = mergePreferences(next.preferences);
  writeConfig(next);
  return next;
}

export function clearSession(): AppConfig {
  const config = readConfig();
  const next: AppConfig = { ...config, cookies: [], userName: null, savedAt: null };
  writeConfig(next);
  return next;
}

export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_BASE_URL;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

export function cookieHeader(cookies: StoredCookie[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

export function hasSessionCookie(cookies: StoredCookie[]): boolean {
  return cookies.some((cookie) => /^d2l(Secure)?SessionVal$/i.test(cookie.name));
}
