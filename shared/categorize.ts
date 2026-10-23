import type { Course } from './types';

export interface CourseInfo {
  /** Raw subject prefix, e.g. "MTH" */
  subject: string;
  /** Friendly subject name when we know it */
  subjectLabel: string;
  /** Course number, e.g. "140" */
  number: string | null;
  /** Term key like "F2026" or null */
  termKey: string | null;
  /** Term label like "Fall 2026" */
  termLabel: string;
  /** Non-course enrollments (trainings, org pages, student resources) */
  kind: 'course' | 'resource';
  /** Initials used for the card artwork */
  initials: string;
}

const SUBJECT_LABELS: Record<string, string> = {
  ACC: 'Accounting',
  AER: 'Aerospace Engineering',
  BIO: 'Biology',
  BUS: 'Business',
  CEN: 'Civil Engineering',
  CHE: 'Chemical Engineering',
  CHY: 'Chemistry',
  COE: 'Computer Engineering',
  CPS: 'Computer Science',
  ECN: 'Economics',
  ELE: 'Electrical Engineering',
  ENG: 'English',
  FIN: 'Finance',
  GEO: 'Geography',
  HIS: 'History',
  ITM: 'Info Tech Management',
  LAW: 'Law',
  MEC: 'Mechanical Engineering',
  MKT: 'Marketing',
  MTH: 'Mathematics',
  OHS: 'Occupational Health',
  ORG: 'Organizations',
  PCS: 'Physics',
  PD: 'Professional Development',
  PHL: 'Philosophy',
  POL: 'Politics',
  PSY: 'Psychology',
  QMS: 'Quantitative Methods',
  SOC: 'Sociology',
};

const SEASON_LABELS: Record<string, string> = {
  F: 'Fall',
  W: 'Winter',
  S: 'Spring/Summer',
};

/** Course codes look like `MTH140_F26_01`, `PD_EHS_WHMIS_STUDENTS` or `ORG_ESCH_FOUNDATION`. */
const COURSE_CODE_RE = /\b([A-Z]{2,6}(?:\d{2,4}[A-Z]?)?)_([A-Z0-9]{2,20})_([A-Z0-9_]{2,24})\b/;

/** Pull the first D2L enrollment code out of an arbitrary string. */
export function findCourseCode(text: string): string | null {
  return COURSE_CODE_RE.exec((text || '').toUpperCase())?.[0] ?? null;
}

function termFromToken(token: string): { key: string; label: string } | null {
  const match = /^([FWS])(\d{2}|\d{4})$/.exec(token.toUpperCase());
  if (!match) return null;
  const season = SEASON_LABELS[match[1]];
  const rawYear = match[2];
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return { key: `${match[1]}${year}`, label: `${season} ${year}` };
}

export function describeCourse(course: Pick<Course, 'name' | 'code'>): CourseInfo {
  const code = (course.code || '').toUpperCase();
  const name = course.name || '';
  const match = COURSE_CODE_RE.exec(code) ?? COURSE_CODE_RE.exec(name.toUpperCase());

  if (!match) {
    const fallbackSubject = (code.split('_')[0] || name.slice(0, 3) || 'D2L').toUpperCase();
    return {
      subject: fallbackSubject,
      subjectLabel: SUBJECT_LABELS[fallbackSubject] ?? fallbackSubject,
      number: null,
      termKey: null,
      termLabel: 'Resources & Training',
      kind: 'resource',
      initials: fallbackSubject.slice(0, 3),
    };
  }

  const subject = match[1].replace(/\d+.*$/, '');
  const number = (/\d{2,4}[A-Z]?/.exec(match[1]) ?? [null])[0];
  const term = termFromToken(match[2]);

  // The third token is the section ("01"), so an all-letters token means this is
  // something like PD_EHS_WHMIS_STUDENTS rather than a real sectioned course.
  const isSection = /^\d+$/.test(match[3]);
  const kind: CourseInfo['kind'] = term && isSection ? 'course' : 'resource';

  return {
    subject,
    subjectLabel: SUBJECT_LABELS[subject] ?? subject,
    number: number ? String(number) : null,
    termKey: term?.key ?? null,
    termLabel: kind === 'course' && term ? term.label : 'Resources & Training',
    kind,
    initials: subject.slice(0, 3),
  };
}

export type GroupMode = 'term' | 'subject';

export interface CourseGroup {
  key: string;
  label: string;
  hint: string;
  courses: Course[];
  kind: CourseInfo['kind'];
}

function termSortValue(key: string | null): number {
  if (!key) return -1;
  const season = { W: 1, S: 2, F: 3 }[key[0] as 'W' | 'S' | 'F'] ?? 0;
  return Number(key.slice(1)) * 10 + season;
}

export function groupCourses(courses: Course[], mode: GroupMode): CourseGroup[] {
  const buckets = new Map<string, CourseGroup>();
  const meta = new Map<string, CourseInfo>();

  for (const course of courses) {
    const info = describeCourse(course);
    meta.set(course.id, info);
    const key = mode === 'term' ? info.termKey ?? 'resources' : info.subject;
    const label = mode === 'term' ? info.termLabel : info.subjectLabel;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label,
        hint: mode === 'term' ? (info.kind === 'course' ? 'Term' : 'Resources') : 'Subject',
        courses: [],
        kind: info.kind,
      });
    }
    buckets.get(key)!.courses.push(course);
  }

  return [...buckets.values()].sort((a, b) => {
    // Real terms first (newest first), then resources.
    if (mode === 'term') {
      const av = termSortValue(meta.get(a.courses[0].id)?.termKey ?? null);
      const bv = termSortValue(meta.get(b.courses[0].id)?.termKey ?? null);
      if (av !== bv) return bv - av;
      return a.label.localeCompare(b.label);
    }
    return a.label.localeCompare(b.label);
  });
}

/** Stable per-subject accent palette. */
export interface SubjectTheme {
  from: string;
  to: string;
  chip: string;
  dot: string;
}

/**
 * Jewel tones at matched lightness and chroma, so a row of cards reads as a set
 * of tinted glass plates rather than a bag of sweets. Pastels lose their chroma
 * when they meet near-black; these are picked for the darkness.
 */
const SUBJECT_THEMES: SubjectTheme[] = [
  { from: '#6b63d8', to: '#26205e', chip: 'text-violet-200 bg-violet-500/15 ring-violet-400/25', dot: '#9186ff' },
  { from: '#3a80cf', to: '#12325c', chip: 'text-sky-200 bg-sky-500/15 ring-sky-400/25', dot: '#6aa9ff' },
  { from: '#2e9cba', to: '#0c3743', chip: 'text-cyan-200 bg-cyan-500/15 ring-cyan-400/25', dot: '#5ecbe8' },
  { from: '#269b86', to: '#0b3a32', chip: 'text-teal-200 bg-teal-500/15 ring-teal-400/25', dot: '#4fd7bd' },
  { from: '#c25378', to: '#401425', chip: 'text-rose-200 bg-rose-500/15 ring-rose-400/25', dot: '#ff8fae' },
  { from: '#bb57a1', to: '#3c1232', chip: 'text-pink-200 bg-pink-500/15 ring-pink-400/25', dot: '#ef8bd3' },
  { from: '#9a5cc4', to: '#311847', chip: 'text-purple-200 bg-purple-500/15 ring-purple-400/25', dot: '#c795ef' },
  { from: '#b4862c', to: '#3a2a08', chip: 'text-amber-200 bg-amber-500/15 ring-amber-400/25', dot: '#f0bd5c' },
  { from: '#bf7636', to: '#3d2210', chip: 'text-orange-200 bg-orange-500/15 ring-orange-400/25', dot: '#f0a169' },
  { from: '#8b9542', to: '#2a310f', chip: 'text-lime-200 bg-lime-500/15 ring-lime-400/25', dot: '#c6d47a' },
  { from: '#5b7391', to: '#1a2634', chip: 'text-slate-200 bg-slate-500/15 ring-slate-400/25', dot: '#9db4cf' },
];

/**
 * Known TMU subject codes get a fixed hue, which keeps neighbouring courses
 * distinct. A short-string hash piles three-letter codes onto the same index.
 */
const SUBJECT_THEME_INDEX: Record<string, number> = {
  ACC: 7, AER: 10, BIO: 3, BUS: 7, CEN: 10, CHE: 2, CHY: 2, COE: 1, CPS: 0, ECN: 8,
  ELE: 1, ENG: 4, FIN: 7, GEO: 9, HIS: 7, ITM: 10, LAW: 10, MEC: 10, MKT: 8, MTH: 1,
  OHS: 10, ORG: 10, PCS: 2, PD: 10, PHL: 6, POL: 9, PSY: 5, QMS: 1, SOC: 9,
};

export function themeForSubject(subject: string): SubjectTheme {
  const fixed = SUBJECT_THEME_INDEX[subject.toUpperCase()];
  if (fixed !== undefined) return SUBJECT_THEMES[fixed];
  let hash = 0x811c9dc5;
  for (let i = 0; i < subject.length; i += 1) {
    hash ^= subject.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return SUBJECT_THEMES[(hash >>> 0) % SUBJECT_THEMES.length];
}
