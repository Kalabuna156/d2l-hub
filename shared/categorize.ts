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

const SUBJECT_THEMES: SubjectTheme[] = [
  { from: '#6d5efc', to: '#3f2bb8', chip: 'text-violet-200 bg-violet-500/15 ring-violet-400/25', dot: '#8b7dff' },
  { from: '#0ea5e9', to: '#0c4a6e', chip: 'text-sky-200 bg-sky-500/15 ring-sky-400/25', dot: '#38bdf8' },
  { from: '#14b8a6', to: '#0f3f3a', chip: 'text-teal-200 bg-teal-500/15 ring-teal-400/25', dot: '#2dd4bf' },
  { from: '#f97316', to: '#7c2d12', chip: 'text-orange-200 bg-orange-500/15 ring-orange-400/25', dot: '#fb923c' },
  { from: '#ec4899', to: '#831843', chip: 'text-pink-200 bg-pink-500/15 ring-pink-400/25', dot: '#f472b6' },
  { from: '#22c55e', to: '#14532d', chip: 'text-emerald-200 bg-emerald-500/15 ring-emerald-400/25', dot: '#4ade80' },
  { from: '#eab308', to: '#713f12', chip: 'text-amber-200 bg-amber-500/15 ring-amber-400/25', dot: '#facc15' },
  { from: '#8b5cf6', to: '#312e81', chip: 'text-indigo-200 bg-indigo-500/15 ring-indigo-400/25', dot: '#a78bfa' },
];

export function themeForSubject(subject: string): SubjectTheme {
  let hash = 0;
  for (let i = 0; i < subject.length; i += 1) hash = (hash * 31 + subject.charCodeAt(i)) % 100000;
  return SUBJECT_THEMES[hash % SUBJECT_THEMES.length];
}
