/**
 * Study plans for one assessment. Uses the outline saved during import plus the
 * student's own lecture files. Lecture text only leaves the computer when the
 * "let AI read course files" setting is on.
 */

import type {
  CourseDetail,
  LectureStudyPayload,
  LibraryFile,
  StudyAnnouncement,
  StudyBookPractice,
  StudyFile,
  StudyFocus,
  StudyGuideRecord,
  StudyPayload,
  StudyPlan,
  StudyPlanSource,
  StudyQuestion,
  StudyVideoChannel,
  StudyVideoSuggestion,
} from '../shared/types';
import { AI_PROVIDER_LABELS, aiStatus, askAiJson } from './ai';
import { readConfig, updateConfig } from './config';
import { loadCourse } from './d2l';
import { fetchTopicBuffer, readLibraryBuffer } from './library';
import { courseTopics, outlineFor, shortCourseCode, textFromBuffer } from './outlines';
import {
  channelSearchUrl,
  fallbackVideoQuery,
  STUDY_VIDEO_CHANNELS,
} from './study-video';

interface StudyInput {
  title?: unknown;
  courseCode?: unknown;
  courseName?: unknown;
  startsAt?: unknown;
  courseId?: unknown;
  refresh?: unknown;
}

const MAX_PLAN_TEXT = 26_000;
const FILE_TEXT_LIMIT = 7_000;

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function planKey(code: string | null, title: string, startsAt: string | null): string {
  return `${code ?? 'course'}|${title.toLowerCase()}|${startsAt ?? ''}`.slice(0, 220);
}

/** Announcements that speak to what a quiz or exam covers (or leaves out). */
const COVERAGE_WORDS =
  /\b(quiz|quizzes|test|tests|exam|exams|midterm|final|covered|coverage|excluded|not covered|chapter|chapters|module|modules|material)\b/i;

export function announcementsForStudy(detail: CourseDetail | null): StudyAnnouncement[] {
  return (detail?.announcements ?? [])
    .filter((announcement) => COVERAGE_WORDS.test(`${announcement.title} ${announcement.bodyText}`))
    .sort((a, b) => {
      const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return bTime - aTime;
    })
    .slice(0, 6)
    .map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      publishedAt: announcement.publishedAt,
      url: announcement.url,
      text: announcement.bodyText.slice(0, 600),
    }));
}

function fileMatchesCourse(file: LibraryFile, code: string | null, courseName: string): boolean {
  if (file.courseId.startsWith('exam-bank')) return false;
  if (code && shortCourseCode(file.courseCode, file.courseName) === code) return true;
  return (
    courseName.trim().length > 2 &&
    file.courseName.trim().toLowerCase() === courseName.trim().toLowerCase()
  );
}

const STOP_WORDS = new Set([
  'this',
  'that',
  'with',
  'from',
  'your',
  'have',
  'will',
  'course',
  'chapter',
  'chapters',
  'week',
  'weeks',
  'quiz',
  'test',
  'midterm',
  'final',
  'exam',
  'assignment',
  'grade',
  'grading',
  'student',
  'students',
  'should',
  'which',
  'there',
  'their',
  'about',
  'after',
  'before',
  'during',
  'other',
  'following',
  'including',
  'lecture',
  'lectures',
  'notes',
  'part',
  'unit',
  'review',
  'practice',
]);

function keywords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z][a-z0-9]{3,}/g) ?? [];
  return new Set(words.filter((word) => !STOP_WORDS.has(word)));
}

function scoreFile(name: string, terms: Set<string>): number {
  const words = keywords(name);
  let score = 0;
  for (const word of words) if (terms.has(word)) score += 1;
  return score;
}

function relevantLibraryFiles(
  files: LibraryFile[],
  terms: Set<string>,
): Array<{ file: LibraryFile; score: number }> {
  return files
    .map((file) => ({ file, score: scoreFile(`${file.title} ${file.fileName}`, terms) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.file.downloadedAt).getTime() - new Date(a.file.downloadedAt).getTime(),
    );
}

export interface StudyTopic {
  title: string;
  type: string | null;
  url: string;
  folder: string | null;
}

function relevantTopics(
  topics: StudyTopic[],
  terms: Set<string>,
): Array<StudyTopic & { score: number }> {
  return topics
    .map((topic) => ({ ...topic, score: scoreFile(`${topic.title} ${topic.folder ?? ''}`, terms) }))
    .filter((topic) => !/web ?page|content|module|quiz|dropbox/i.test(topic.type ?? ''))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

/** Compare a saved file with a D2L topic without caring about extension or case. */
function normalizedStudyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Every file Study can offer for one assessment: already-saved Content Space
 * files first, then the course's D2L content. A lecture that is both saved and
 * still listed in D2L appears once, as the local copy.
 */
export function studyFileList(saved: LibraryFile[], topics: StudyTopic[]): StudyFile[] {
  const savedTitles = new Set(saved.map((file) => normalizedStudyTitle(file.title)));

  return [
    ...saved.map((file) => ({
      id: file.id,
      title: file.title,
      type: file.mime,
      source: 'library' as const,
      url: `/api/library/file/${file.id}`,
      canOpen: true,
      folder: file.folder,
      readByAi: false,
    })),
    ...topics
      .filter((topic) => !savedTitles.has(normalizedStudyTitle(topic.title)))
      .map((topic) => ({
        id: topic.url,
        title: topic.title,
        type: topic.type,
        source: 'd2l' as const,
        url: topic.url,
        canOpen: false,
        folder: topic.folder,
        readByAi: false,
      })),
  ];
}

export interface LocalPlanInput {
  title: string;
  courseCode?: string | null;
  courseName?: string | null;
  startsAt?: string | null;
  outline?: string | null;
  announcements?: StudyAnnouncement[];
  files?: StudyFile[];
  /** Fixed clock for tests; defaults to now. */
  now?: Date;
}

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
const LONG_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTH_WORDS =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const DATE_AT_START = new RegExp(
  `^(?:(?:${MONTH_WORDS})\\.?\\s+\\d{1,2}(?:\\s*[-–—]\\s*\\d{1,2})?\\s*[:.\\-–—]?\\s*)+`,
  'i',
);
const DATE_ANYWHERE = new RegExp(`\\b(?:${MONTH_WORDS})\\.?\\s+\\d{1,2}\\b`, 'gi');
const OUTLINE_NOISE =
  /\b(?:office hours|e-?mail|instructor|teaching assistant|grading|grade breakdown|late (?:policy|submission)|academic integrity|learning outcomes?|course description|prerequisites?|contact|policy|policies|course website|class location|lecture times?|lab times?|textbook|required text|recommended text|course materials)\b/i;
const TOPIC_FILE_NOISE =
  /\b(?:outline|syllabus|course\s+(?:management\s+)?(?:form|information|info|outline)|grading|rubric|polic(?:y|ies)|announcement|calendar)\b/i;

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addLocalDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function formatPlanDate(value: Date, today: Date): string {
  const base = `${SHORT_WEEKDAYS[value.getDay()]}, ${SHORT_MONTHS[value.getMonth()]} ${value.getDate()}`;
  return sameLocalDay(value, today) ? `Today (${base})` : base;
}

function formatExamDate(value: Date): string {
  return `${LONG_WEEKDAYS[value.getDay()]}, ${LONG_MONTHS[value.getMonth()]} ${value.getDate()}`;
}

/** Clean a D2L topic title such as "(13) section 3.5-Derivatives of Trig Functions(1)sep30". */
function cleanFileTopic(title: string): string {
  let value = title.replace(/\.[a-z0-9]{1,5}$/i, '');
  value = value.replace(/^\(\d+\)\s*/, '');
  value = value.replace(
    new RegExp(`\\(\\d+\\)\\s*(?:(?:${MONTH_WORDS})\\.?\\s*\\d{1,2})?\\s*$`, 'i'),
    '',
  );
  value = value.replace(DATE_ANYWHERE, ' ');
  value = value.replace(/\bsection\s+/i, 'Section ');
  value = value.replace(/_+/g, ' ');
  value = value.replace(/(\d)\s*[-–]\s*(\d)/g, '$1–$2');
  value = value.replace(/(\d)\s*[-–—]\s*(?=[A-Za-z])/g, '$1 — ');
  value = value.replace(/\s+[-–—]\s+/g, ' — ');
  value = oneLine(value).replace(/^[—\-:,\s]+|[—\-:,\s]+$/g, '');
  return value.slice(0, 120);
}

/** Clean one line from an outline: chapters, sections, units, modules, weeks. */
function cleanOutlineTopic(raw: string): string {
  let value = oneLine(raw).replace(/^[\s•·*\-–—]+/, '');
  value = value.replace(/^week\s*\d+\s*(?:\([^)]*\))?\s*[:.\-–—]?\s*/i, '');
  value = value.replace(DATE_AT_START, '');
  value = value.replace(/\s*\((?:week\s*)?\d+(?:\.\d+)?\s*%\)\s*/gi, ' ');

  // A table row can put several cells on one line; keep the one that names a topic.
  if (/[|\t]/.test(value)) {
    const parts = value
      .split(/[|\t]/)
      .map((part) => oneLine(part))
      .filter(Boolean);
    value =
      parts.find((part) => /\b(?:chapter|unit|module|section|topic)\b/i.test(part)) ?? parts[0] ?? value;
  }

  value = value.replace(DATE_ANYWHERE, ' ');
  value = oneLine(value);
  value = value.replace(
    new RegExp(`\\s*\\((?:${MONTH_WORDS})\\.?\\s*\\d{1,2}(?:\\s*[-–—]\\s*\\d{1,2})?\\)\\s*$`, 'i'),
    '',
  );
  value = value.replace(/\s+[-–—]\s+/g, ' — ');
  value = value.replace(/(\d)\s*[-–—]\s*(?=[A-Za-z])/g, '$1 — ');
  value = value.replace(/(\d)\s*[-–]\s*(\d)/g, '$1–$2');
  value = value.replace(/^[—\-:,\s]+|[—\-:,\s]+$/g, '').trim();

  // "Chapter 5 is not covered" must not become a topic to study.
  if (/\b(?:not covered|not included|excluded|will not be covered|isn['’]t|aren['’]t)\b/i.test(value)) return '';

  // A schedule row may be "Midterm 1 (Chapters 1-4, 6)"; keep the coverage part.
  if (/^(?:midterm|final|quiz|test|exam|assignment)\b/i.test(value)) {
    const coverage = value.match(
      /\bchapters?\s+\d+(?:\.\d+)?(?:\s*[-–,]\s*\d+(?:\.\d+)?)*/i,
    );
    value = coverage?.[0] ?? '';
  }

  if (!value || value.length < 3) return '';
  if (OUTLINE_NOISE.test(value) && !/\b(?:chapter|unit|module|section|topic)\s*\d/i.test(value)) {
    return '';
  }
  if (/^(?:page|of|instructor|course)\b/i.test(value)) return '';
  if (/^\d{1,2}[/-]\d{1,2}/.test(value)) return '';
  if (!/[a-z]/i.test(value) && !/^\d+(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?$/.test(value)) {
    return '';
  }

  return oneLine(value).slice(0, 120);
}

function topicKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(?:chapter|section|unit|module|topic)\b/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueTopics(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = topicKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function outlineTopics(text: string): string[] {
  if (!text.trim()) return [];
  const found: string[] = [];
  const patterns = [
    /\bchapters?\s+\d+(?:\.\d+)?(?:\s*[-–,]\s*\d+(?:\.\d+)?)*\b[^\n]{0,90}/gi,
    /\bunits?\s+\d+(?:\.\d+)?\b[^\n]{0,90}/gi,
    /\bmodules?\s+\d+(?:\.\d+)?\b[^\n]{0,90}/gi,
    /\bsections?\s+\d+(?:\.\d+)?\b[^\n]{0,90}/gi,
    /(?:^|\n)\s*\d+\.\d+(?:\.\d+)?\s*[-–—:]\s*[A-Z][^\n]{2,80}/g,
    /(?:^|\n)\s*\d+\.\d+(?:\.\d+)?\s+[A-Z][^\n]{2,80}/gm,
    /(?:^|\n)\s*(?:week|topic|lecture)\s*\d+\s*[:.\-–—]\s*[^\n]{3,90}/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const cleaned = cleanOutlineTopic(match[0].replace(/^\n+/, ''));
      if (cleaned) found.push(cleaned);
    }
  }
  return uniqueTopics(found);
}

function fileTopics(files: StudyFile[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    const title = file.title.trim();
    if (TOPIC_FILE_NOISE.test(title)) continue;
    if (/^(?:untitled|document|scan|image|file|copy)\b/i.test(title)) continue;
    if (!/[a-z]/i.test(title) && !/\d+\.\d+/.test(title)) continue;
    const cleaned = cleanFileTopic(title);
    if (cleaned) found.push(cleaned);
  }
  return uniqueTopics(found);
}

/** Outline topics first, then lecture-file topics, so neither source crowds the other out. */
function pickLocalTopics(outline: string, files: StudyFile[]): string[] {
  const fromOutline = outlineTopics(outline);
  const fromFiles = fileTopics(files);
  const mixed = uniqueTopics([
    ...fromOutline.slice(0, 3),
    ...fromFiles.slice(0, 3),
    ...fromOutline.slice(3),
    ...fromFiles.slice(3),
  ]);
  return mixed.slice(0, 6);
}

function findTextbook(outline: string): string | null {
  for (const line of outline.split(/\r?\n/).map(oneLine)) {
    const match = line.match(
      /\b(?:textbook|required\s+text|course\s+text|recommended\s+text)\b\s*[:\-–—]?\s*(.{3,160})/i,
    );
    if (!match) continue;
    const value = match[1]
      .replace(/^[:\-–—\s]+/, '')
      .replace(/[.;]\s*$/, '')
      .trim();
    if (value.length < 3 || /^(?:and|or|for|is|are|will|required|optional|none|n\/a)\b/i.test(value)) {
      continue;
    }
    return value.slice(0, 160);
  }
  return null;
}

function sessionDates(startsAt: string | null, today: Date): Date[] {
  if (!startsAt) return [0, 1, 2, 3, 4].map((offset) => addLocalDays(today, offset));
  const exam = startOfLocalDay(new Date(startsAt));
  if (Number.isNaN(exam.getTime())) return [0, 1, 2, 3, 4].map((offset) => addLocalDays(today, offset));

  const daysBefore = Math.max(0, Math.round((exam.getTime() - today.getTime()) / 86_400_000));
  if (daysBefore <= 0) return [today];

  const count = Math.min(5, daysBefore);
  if (daysBefore <= 5) {
    return Array.from({ length: count }, (_, index) => addLocalDays(today, index));
  }
  return Array.from({ length: count }, (_, index) =>
    addLocalDays(today, Math.round((index * (daysBefore - 1)) / (count - 1))),
  );
}

function topicSession(index: number, topicCount: number, sessionCount: number): number {
  if (topicCount <= 1 || sessionCount <= 1) return 0;
  return Math.round((index * (sessionCount - 1)) / (topicCount - 1));
}

function topicDetail(topic: string, index: number): string {
  const ideas = [
    'Read it once, then close the notes and write the main definitions and formulas from memory.',
    'Work one example from start to finish without looking, then check every step.',
    'Write three questions this topic could produce on the assessment, then answer them.',
    'Make a one-page summary and mark the parts you had to look up.',
    'Find a practice problem that combines this topic with one you reviewed earlier.',
    'Explain it aloud for two minutes as if teaching it, then fix the gaps.',
  ];
  const source = /^\d|^section|^chapter|^unit|^module|^lecture|^week|^topic/i.test(topic)
    ? 'Use the matching outline section and lecture.'
    : 'Use the matching lecture in the files list.';
  return `${source} ${ideas[index % ideas.length]}`;
}

function localBookPractice(outline: string, topics: string[]): StudyBookPractice[] {
  const textbook = findTextbook(outline);
  const refs = uniqueTopics(
    topics.flatMap((topic) => topic.match(/\b(?:chapters?|sections?|units?|modules?)\s+\d+(?:\.\d+)*/gi) ?? []),
  ).slice(0, 4);
  if (!textbook && refs.length === 0) return [];

  const problems = refs.map((ref) =>
    /^sections?/i.test(ref) ? `Practice problems for ${ref}` : `End-of-chapter problems for ${ref}`,
  );
  return [
    {
      source: textbook ?? 'Your course materials',
      problems: problems.length > 0 ? problems : ['Practice problems for the sections above'],
    },
  ];
}

function localOverview(input: {
  startsAt: string | null;
  outline: string;
  files: StudyFile[];
  topics: string[];
  sessions: Date[];
  today: Date;
  announcements: StudyAnnouncement[];
}): string {
  const exam = input.startsAt ? startOfLocalDay(new Date(input.startsAt)) : null;
  const validExam = exam && !Number.isNaN(exam.getTime()) ? exam : null;
  const daysBefore = validExam
    ? Math.max(0, Math.round((validExam.getTime() - input.today.getTime()) / 86_400_000))
    : null;
  const when = validExam
    ? daysBefore === 0
      ? ' today'
      : ` before ${formatExamDate(validExam)}`
    : '';
  const sessionText = `${input.sessions.length} study session${input.sessions.length === 1 ? '' : 's'}`;
  const source = input.outline.trim()
    ? 'your saved outline'
    : input.files.length > 0
      ? 'the file names below'
      : 'the assessment date';
  const announcementText = input.announcements.length > 0
    ? ' The coverage announcements below override the outline.'
    : '';

  if (input.topics.length === 0) {
    return `No outline or readable lecture topics are available yet, so this is a setup plan for ${sessionText}${when}. Use the checklist to import the outline and download the lectures, then rebuild for a topic-by-topic plan. It was built on this computer without AI.${announcementText}`;
  }

  const listed = input.topics.slice(0, 3).map((topic) => `“${topic}”`).join(', ');
  const more = input.topics.length > 3 ? ` and ${input.topics.length - 3} more` : '';
  return `This plan uses ${source} to cover ${listed}${more} in ${sessionText}${when}. It was built on this computer without AI; check the outline if a topic looks wrong, and open the matching lecture from the files list.${announcementText}`;
}

function localChecklist(input: {
  startsAt: string | null;
  files: StudyFile[];
  topics: string[];
  sessions: Date[];
  assignments: string[][];
  today: Date;
  announcements: StudyAnnouncement[];
}): string[] {
  const checklist: string[] = [];
  if (input.announcements.length > 0) {
    checklist.push('Read the coverage announcements below first; they override the outline.');
  }

  const d2lCount = input.files.filter((file) => file.source === 'd2l').length;
  if (d2lCount > 0) {
    checklist.push(
      `Download the ${d2lCount} D2L file${d2lCount === 1 ? '' : 's'} marked “not downloaded” below so they open offline.`,
    );
  }

  if (input.topics.length === 0) {
    checklist.push('Import the course outline from Calendar or Auto-import so Study can name the chapters.');
    checklist.push('Download any lecture files below, then rebuild this plan.');
    checklist.push('Write down the assessment format, weight, and allowed materials from the outline.');
    checklist.push('List the topics you remember, then check the list against the outline.');
    checklist.push('Do one short practice set and mark what you cannot do without notes.');
    return checklist.slice(0, 8);
  }

  input.sessions.forEach((date, index) => {
    const label = formatPlanDate(date, input.today);
    const assigned = input.assignments[index] ?? [];
    checklist.push(
      assigned.length > 0
        ? `${label}: ${assigned.join(' + ')} — read the matching lecture, then write a five-line summary from memory.`
        : `${label}: mixed practice — problems from the topics you have already reviewed.`,
    );
  });

  const last = input.sessions[input.sessions.length - 1] ?? input.today;
  const exam = input.startsAt ? startOfLocalDay(new Date(input.startsAt)) : null;
  const daysBefore =
    exam && !Number.isNaN(exam.getTime())
      ? Math.max(0, Math.round((exam.getTime() - input.today.getTime()) / 86_400_000))
      : null;
  if (daysBefore === 0) {
    checklist.push('Final pass today: definitions, formulas, and one worked example of each type.');
  } else {
    checklist.push(
      sameLocalDay(last, input.today)
        ? 'Finish with a timed practice set today, with notes closed.'
        : `On ${formatPlanDate(last, input.today)}, do a timed practice set with notes closed.`,
    );
  }
  checklist.push('Make one page of formulas, definitions, and mistakes to review before the assessment.');
  return checklist.slice(0, 9);
}

/**
 * Build a useful plan with no API key: pick topics from the saved outline and
 * lecture titles, place them across the days before the assessment, and give
 * concrete active-study steps. No text leaves this computer.
 */
export function buildLocalStudyPlan(input: LocalPlanInput): StudyPlan {
  const title = clean(input.title, 160) || 'Upcoming assessment';
  const outline = typeof input.outline === 'string' ? input.outline : '';
  const files = input.files ?? [];
  const announcements = input.announcements ?? [];
  const startsAt =
    typeof input.startsAt === 'string' && !Number.isNaN(Date.parse(input.startsAt))
      ? input.startsAt
      : null;
  const now = input.now ?? new Date();
  const today = startOfLocalDay(now);
  const sessions = sessionDates(startsAt, today);
  const topics = pickLocalTopics(outline, files);
  const assignments: string[][] = sessions.map(() => []);
  topics.forEach((topic, index) => {
    const session = topicSession(index, topics.length, sessions.length);
    assignments[session]?.push(topic);
  });

  return {
    overview: localOverview({
      startsAt,
      outline,
      files,
      topics,
      sessions,
      today,
      announcements,
    }),
    focus: topics.map((topic, index) => ({ topic, detail: topicDetail(topic, index) })),
    checklist: localChecklist({
      startsAt,
      files,
      topics,
      sessions,
      assignments,
      today,
      announcements,
    }),
    bookPractice: localBookPractice(outline, topics),
    practice: [],
  };
}

interface AiStudyReply {
  overview?: unknown;
  focus?: unknown;
  checklist?: unknown;
  bookPractice?: unknown;
  practice?: unknown;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizePlan(reply: AiStudyReply): StudyPlan {
  const focus: StudyFocus[] = list(reply.focus)
    .map((item) => {
      const entry = (item ?? {}) as { topic?: unknown; detail?: unknown };
      return { topic: clean(entry.topic, 120), detail: clean(entry.detail, 400) };
    })
    .filter((item) => item.topic)
    .slice(0, 8);

  const checklist = list(reply.checklist)
    .map((item) => clean(item, 180))
    .filter(Boolean)
    .slice(0, 10);

  const bookPractice: StudyBookPractice[] = list(reply.bookPractice)
    .map((item) => {
      const entry = (item ?? {}) as { source?: unknown; problems?: unknown };
      return {
        source: clean(entry.source, 160),
        problems: list(entry.problems)
          .map((problem) => clean(problem, 160))
          .filter(Boolean)
          .slice(0, 12),
      };
    })
    .filter((item) => item.source || item.problems.length > 0)
    .slice(0, 6);

  const practice: StudyQuestion[] = list(reply.practice)
    .map((item) => {
      const entry = (item ?? {}) as { question?: unknown; answer?: unknown; source?: unknown };
      return {
        question: clean(entry.question, 600),
        answer: clean(entry.answer, 1200),
        source: clean(entry.source, 160),
      };
    })
    .filter((item) => item.question && item.answer)
    .slice(0, 10);

  const overview = clean(reply.overview, 900);
  if (!overview && focus.length === 0 && practice.length === 0) {
    throw new Error('The AI did not return a usable study plan. Try again.');
  }

  return { overview, focus, checklist, bookPractice, practice };
}

function studyPrompt(input: {
  title: string;
  courseCode: string | null;
  courseName: string | null;
  startsAt: string | null;
  outline: string;
  announcements: StudyAnnouncement[];
  excerpts: Array<{ name: string; text: string }>;
  availableFiles: string[];
}): string {
  const when = input.startsAt
    ? new Date(input.startsAt).toLocaleString('en-CA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'a date on the calendar';

  const fileBlock =
    input.excerpts.length > 0
      ? `\nLecture material supplied (this is the student's own course content):\n${input.excerpts
          .map((excerpt) => `--- ${excerpt.name} ---\n${excerpt.text.slice(0, FILE_TEXT_LIMIT)}`)
          .join('\n\n')}`
      : '\nNo lecture text was supplied. Work from the outline and the file names below.';

  const names =
    input.availableFiles.length > 0
      ? `\nFiles the student has for this course (titles only): ${input.availableFiles.join(' · ')}`
      : '';

  const announcements =
    input.announcements.length > 0
      ? `\nCourse announcements about coverage (these are the instructor's words, treated as the final word):\n${input.announcements
          .map(
            (announcement) =>
              `--- ${announcement.title}${announcement.publishedAt ? ` (${new Date(announcement.publishedAt).toLocaleDateString('en-CA')})` : ''} ---\n${announcement.text}`,
          )
          .join('\n\n')}`
      : '\nNo announcement mentions what this assessment covers.';

  return `You are helping a university student prepare for "${input.title}" in ${
    input.courseName ?? input.courseCode ?? 'their course'
  }${input.courseCode ? ` (${input.courseCode})` : ''}, on ${when}.

Build a focused, specific study plan from the course outline${input.excerpts.length ? ' and the lecture excerpts' : ''}.
Do not give generic advice like "start early" or "take breaks".
If no outline is supplied, use the lecture file titles and announcements below. Never invent chapter numbers
that no source states.

- overview: 2-3 sentences on what this assessment covers and how to spend the time.
- focus: 3-6 topics to review. Say what to be able to do and why it matters, using the outline's chapters/topics.
- checklist: 4-8 concrete actions the student can tick off (problems to do, definitions to write, formulas to memorise).
- bookPractice: use the textbook and any question numbers, end-of-chapter exercises or "problems" the outline names.
  If the outline names a textbook but no numbers, name the exact chapter/section and suggest practice from it.
  Do not invent a page number. An empty list is better than a made-up citation.
- practice: 6-8 questions likely to appear on this assessment, each with a concise worked answer.
  Mix conceptual and calculation questions; for calculations show the setup and the final answer.
  Use the supplied lecture material when it is present. "source" names the chapter, topic or file.
- The announcements below override the outline. If one says a topic is not covered, excluded, or replaced,
  leave it out and mention the change in overview or focus. If one names exactly what is covered, make that
  the core of the plan instead of guessing from the whole outline. Do not invent coverage that no source states.

Return JSON only:
{"overview":string,"focus":[{"topic":string,"detail":string}],"checklist":[string],
 "bookPractice":[{"source":string,"problems":[string]}],
 "practice":[{"question":string,"answer":string,"source":string}]}

Course outline (may be long; the schedule, grading table and textbook list matter most):
${input.outline.slice(0, MAX_PLAN_TEXT)}${announcements}${fileBlock}${names}`;
}

export async function buildStudyPlan(input: StudyInput): Promise<StudyPayload> {
  const title = clean(input.title, 160) || 'Upcoming assessment';
  const courseCode = clean(input.courseCode, 40) || null;
  const code = courseCode ? shortCourseCode(courseCode) : null;
  const courseName = clean(input.courseName, 160) || null;
  const startsAt =
    typeof input.startsAt === 'string' && !Number.isNaN(Date.parse(input.startsAt))
      ? input.startsAt
      : null;
  const courseId = typeof input.courseId === 'string' && /^\d+$/.test(input.courseId) ? input.courseId : null;

  const status = aiStatus();
  const outline = (code ? outlineFor(code) : null) ?? (courseCode ? outlineFor(courseCode) : null);

  const library = readConfig()
    .contentFiles.filter((file) => fileMatchesCourse(file, code, courseName ?? ''))
    // The outline is already supplied in full; it is not a lecture file.
    .filter(
      (file) =>
        !(
          outline &&
          file.fileName === outline.fileName &&
          /outline|syllabus|course\s+(?:management\s+)?form/i.test(`${file.title} ${file.fileName}`)
        ),
    );

  let topics: StudyTopic[] = [];
  let announcements: StudyAnnouncement[] = [];
  if (courseId) {
    // The content list is fetched even before an outline or local file exists:
    // those are exactly the files Study should offer to download.
    const [detail, contentTopics] = await Promise.all([
      loadCourse(courseId).catch(() => null),
      courseTopics(courseId).catch(() => []),
    ]);
    announcements = announcementsForStudy(detail);
    topics = contentTopics;
  }

  const terms = keywords(`${title} ${outline?.text.slice(0, 12_000) ?? ''} ${courseName ?? ''}`);
  const rankedLibrary = relevantLibraryFiles(library, terms);
  // The outline is not a lecture file; it travels separately and is already known.
  const rankedTopics = relevantTopics(topics, terms).filter(
    (topic) => !/outline|syllabus|course\s+(?:management\s+)?form/i.test(topic.title),
  );

  const chosenLibrary = rankedLibrary.slice(0, 10);
  const chosenTopics = rankedTopics.slice(0, 10);

  const files = studyFileList(
    chosenLibrary.map(({ file }) => file),
    chosenTopics,
  );

  const availableFiles = files.map((file) => file.title);
  const notes: string[] = [];
  if (!outline) {
    notes.push(
      `No outline is saved for ${code ?? courseName ?? 'this course'} yet. Import or auto-scan it once so Study knows the chapters and textbook.`,
    );
  }
  if (library.length === 0 && topics.length === 0) {
    notes.push(
      courseId
        ? 'No files are saved and D2L returned no content for this course. Open the course content to see the lectures.'
        : 'No course is linked to this assessment yet. Choose the course below to list its files and download them.',
    );
  }
  if (announcements.length > 0) {
    notes.push(
      `Read ${announcements.length} course ${
        announcements.length === 1 ? 'announcement' : 'announcements'
      } for what this assessment covers.`,
    );
  }
  if (status.configured) {
    notes.push('AI-generated plan — check anything that matters against your outline.');
  }

  // Build the local plan first. It needs no key, no network and no AI; when AI
  // is configured and answers, that plan replaces it below.
  const localPlan = buildLocalStudyPlan({
    title,
    courseCode: code,
    courseName,
    startsAt,
    outline: outline?.text ?? '',
    announcements,
    files,
  });
  const key = planKey(code, title, startsAt);
  let plan: StudyPlan | null = null;
  let planSource: StudyPlanSource = 'local';
  let readByAi: string[] = [];

  if (status.configured) {
    const cachedGuide = readConfig().studyGuides.find((guide) => guide.key === key);
    if (cachedGuide && input.refresh !== true) {
      if (!status.allowCourseFiles && cachedGuide.readByAi.length > 0) {
        notes.push(
          'This saved plan was built while file reading was on. Rebuild with it off if you want a names-only plan.',
        );
      }
      return {
        title,
        courseCode,
        courseName,
        startsAt,
        courseId,
        plan: cachedGuide.plan,
        planSource: 'ai',
        generatedAt: cachedGuide.generatedAt,
        cached: true,
        ai: status,
        outlineFileName: outline?.fileName ?? null,
        announcements,
        files: files.map((file) => ({
          ...file,
          readByAi: cachedGuide.readByAi.includes(file.title),
        })),
        readByAi: cachedGuide.readByAi,
        notes,
      };
    }

    // Reading lecture text is opt-in; without it the AI only sees titles.
    const excerpts: Array<{ name: string; text: string }> = [];
    if (status.allowCourseFiles) {
      for (const { file } of rankedLibrary.slice(0, 3)) {
        const found = readLibraryBuffer(file.id);
        if (!found) continue;
        const text = await textFromBuffer(found.buffer, found.file.mime, found.file.fileName);
        if (!text) continue;
        excerpts.push({ name: file.title, text: text.slice(0, FILE_TEXT_LIMIT) });
        if (excerpts.length >= 3) break;
      }

      const pdfTopics = rankedTopics
        .filter((topic) => /pdf|slides|notes|document|file/i.test(`${topic.type ?? ''} ${topic.url}`))
        .slice(0, 2);
      for (const topic of pdfTopics) {
        if (excerpts.length >= 4) break;
        try {
          const fetched = await fetchTopicBuffer({ url: topic.url });
          const text = await textFromBuffer(fetched.buffer, fetched.mime, fetched.name ?? topic.title);
          if (text) excerpts.push({ name: topic.title, text: text.slice(0, FILE_TEXT_LIMIT) });
        } catch {
          // A topic that will not download is left out; the plan still works.
        }
      }
    }

    readByAi = excerpts.map((excerpt) => excerpt.name);
    if (status.allowCourseFiles && excerpts.length > 0) {
      notes.push(
        `File reading is on: ${excerpts.length} course ${
          excerpts.length === 1 ? 'file was' : 'files were'
        } sent to ${AI_PROVIDER_LABELS[status.provider]} with this request.`,
      );
    } else if (status.allowCourseFiles && files.length > 0) {
      notes.push(
        'File reading is on, but none of these files had readable text; the AI only saw their names.',
      );
    } else if (!status.allowCourseFiles && files.length > 0) {
      notes.push(
        'File reading is off, so the AI only saw file names. Turn on "Let AI read course files" in Settings → AI to include the slides.',
      );
    }

    if (!outline && excerpts.length === 0) {
      notes.push(
        'Without an outline or readable files there is little for the AI to work from. The plan will be general.',
      );
    }

    // A failed AI request must not hide the files or leave the page empty: the
    // local plan below still gives the student a schedule and a file list.
    try {
      const reply = await askAiJson<AiStudyReply>(
        studyPrompt({
          title,
          courseCode: code,
          courseName,
          startsAt,
          outline: outline?.text ?? '',
          announcements,
          excerpts,
          availableFiles,
        }),
        { maxTokens: 5000 },
      );
      plan = normalizePlan(reply);
      planSource = 'ai';
    } catch (error) {
      notes.push(error instanceof Error ? error.message : 'The AI could not build a study plan.');
    }
  }

  if (!plan) {
    plan = localPlan;
    planSource = 'local';
    if (status.configured) {
      notes.push(
        'The AI request did not finish, so this plan was built locally from your outline and file names.',
      );
    }
  }

  const generatedAt = new Date().toISOString();
  if (planSource === 'ai') {
    const guide: StudyGuideRecord = {
      key,
      courseCode: code,
      title,
      startsAt,
      plan,
      generatedAt,
      readByAi,
    };

    updateConfig((config) => ({
      ...config,
      studyGuides: [guide, ...config.studyGuides.filter((item) => item.key !== key)].slice(0, 40),
    }));
  }

  return {
    title,
    courseCode,
    courseName,
    startsAt,
    courseId,
    plan,
    planSource,
    generatedAt,
    cached: false,
    ai: status,
    outlineFileName: outline?.fileName ?? null,
    announcements,
    files: files.map((file) => ({ ...file, readByAi: readByAi.includes(file.title) })),
    readByAi,
    notes:
      planSource === 'local'
        ? notes.filter((note) => !note.startsWith('AI-generated plan'))
        : notes,
  };
}

interface LectureInput {
  courseId?: unknown;
  courseCode?: unknown;
  courseName?: unknown;
  topicTitle?: unknown;
  topicType?: unknown;
  topicUrl?: unknown;
  moduleTitle?: unknown;
  refresh?: unknown;
}

interface AiLectureReply extends AiStudyReply {
  videos?: unknown;
}

/** Two channel searches that work even before an AI key is saved. */
function fallbackChannelPicks(topicTitle: string, courseName: string): StudyVideoSuggestion[] {
  return (Object.keys(STUDY_VIDEO_CHANNELS) as StudyVideoChannel[]).map((channel) => {
    const info = STUDY_VIDEO_CHANNELS[channel];
    const query = fallbackVideoQuery(topicTitle, courseName);
    return {
      channel,
      channelName: info.name,
      title: `Find ${query} on ${info.name}`,
      query,
      reason: 'A channel search for this lecture. With an AI key, this becomes a specific topic pick.',
      url: channelSearchUrl(info.channelId, query),
      fromAi: false,
    };
  });
}

/** Read the AI's per-channel picks, falling back for a missing channel. */
function channelPicks(
  value: unknown,
  topicTitle: string,
  courseName: string,
): StudyVideoSuggestion[] {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return (Object.keys(STUDY_VIDEO_CHANNELS) as StudyVideoChannel[]).map((channel) => {
    const info = STUDY_VIDEO_CHANNELS[channel];
    const raw =
      (record[channel] as { title?: unknown; query?: unknown; reason?: unknown } | undefined) ?? {};
    const title = clean(raw.title, 140);
    const query = clean(raw.query, 140).replace(/^["'“”]+|["'“”]+$/g, '');
    const reason = clean(raw.reason, 400);
    const finalQuery = query || title || fallbackVideoQuery(topicTitle, courseName);
    const picked = Boolean(title || query);

    return {
      channel,
      channelName: info.name,
      title: title || finalQuery,
      query: finalQuery,
      reason: reason || `A ${info.name} search for this lecture.`,
      url: channelSearchUrl(info.channelId, finalQuery),
      fromAi: picked,
    };
  });
}

const lectureCache = new Map<string, LectureStudyPayload>();

/**
 * One lecture, not a whole assessment: what to know, what to practise, and one
 * video pick per channel. Used by the Content tab's lecture button.
 */
export async function buildLecturePlan(input: LectureInput): Promise<LectureStudyPayload> {
  const topicTitle = clean(input.topicTitle, 200);
  if (!topicTitle) throw new Error('Choose a lecture first.');
  const topicType = clean(input.topicType, 80) || null;
  const moduleTitle = clean(input.moduleTitle, 160) || null;
  const courseCode = clean(input.courseCode, 40) || null;
  const code = courseCode ? shortCourseCode(courseCode) : null;
  const courseName = clean(input.courseName, 160) || courseCode || 'this course';
  const courseId = typeof input.courseId === 'string' && /^\d+$/.test(input.courseId) ? input.courseId : null;
  const topicUrl = typeof input.topicUrl === 'string' ? input.topicUrl.trim().slice(0, 2000) : '';

  const status = aiStatus();
  const outline = (code ? outlineFor(code) : null) ?? (courseCode ? outlineFor(courseCode) : null);
  const notes: string[] = [];

  const announcementDetail = courseId ? await loadCourse(courseId).catch(() => null) : null;
  const announcements = announcementsForStudy(announcementDetail);
  if (announcements.length > 0) {
    notes.push(
      `Read ${announcements.length} course ${
        announcements.length === 1 ? 'announcement' : 'announcements'
      } for coverage.`,
    );
  }

  const videos = fallbackChannelPicks(topicTitle, courseName);
  if (!status.configured) {
    notes.unshift('Add your own Gemini, OpenAI or Claude API key in Settings → AI to build the lecture plan. The channel links below still work.');
    return {
      topicTitle,
      topicType,
      topicUrl,
      moduleTitle,
      courseCode,
      courseName,
      plan: null,
      generatedAt: null,
      ai: status,
      videos,
      readByAi: false,
      notes,
    };
  }

  const cacheKey = `${code ?? courseName}|${topicTitle.toLowerCase()}|${status.model}|${status.allowCourseFiles ? 'files' : 'names'}`.slice(
    0,
    260,
  );
  const cached = lectureCache.get(cacheKey);
  if (cached && input.refresh !== true) return cached;

  let lectureText = '';
  if (status.allowCourseFiles && /^https?:/i.test(topicUrl)) {
    try {
      const fetched = await fetchTopicBuffer({ url: topicUrl });
      lectureText = (
        (await textFromBuffer(fetched.buffer, fetched.mime, fetched.name ?? topicTitle)) ?? ''
      ).slice(0, FILE_TEXT_LIMIT);
    } catch {
      notes.push('The lecture file could not be downloaded, so the plan uses the title, outline and announcements.');
    }
  } else if (status.allowCourseFiles) {
    notes.push('This lecture has no downloadable file, so the plan uses the title, outline and announcements.');
  }

  const announcementBlock =
    announcements.length > 0
      ? `\nAnnouncements about coverage:\n${announcements
          .map((announcement) => `--- ${announcement.title} ---\n${announcement.text}`)
          .join('\n\n')}`
      : '';

  const prompt = `You are helping a university student study ONE lecture, not an exam.

Course: ${courseName}${code ? ` (${code})` : ''}
Lecture: "${topicTitle}"${topicType ? ` (${topicType})` : ''}${moduleTitle ? `\nModule: ${moduleTitle}` : ''}

Build a compact, specific lecture study plan. Do not give generic advice.
- overview: 2-3 sentences on the lecture's core idea and how to study it.
- focus: 3-6 things the student must understand, with enough detail to be actionable.
- checklist: 4-8 concrete actions (derive an equation, redo an example, define terms).
- bookPractice: only if the outline names a textbook or problems. Never invent a page number.
- practice: 4-6 questions on this lecture with concise worked answers. "source" names the lecture or outline.
- videos: choose one search phrase for each channel. 3Blue1Brown is visual, concept-first math;
  The Organic Chemistry Tutor is worked-example chemistry/physics/math. Stay on this lecture's topic.
  Do not include the channel name, "YouTube", or quotation marks in a query. Do not invent video URLs.

Return JSON only:
{"overview":string,"focus":[{"topic":string,"detail":string}],"checklist":[string],
 "bookPractice":[{"source":string,"problems":[string]}],
 "practice":[{"question":string,"answer":string,"source":string}],
 "videos":{"3blue1brown":{"title":string,"query":string,"reason":string},
           "organic-chem-tutor":{"title":string,"query":string,"reason":string}}}
${outline ? `\nCourse outline (excerpt):\n${outline.text.slice(0, MAX_PLAN_TEXT)}` : ''}${announcementBlock}${
    lectureText ? `\nLecture file text:\n${lectureText}` : ''
  }`;

  let reply: AiLectureReply | null = null;
  let plan: StudyPlan | null = null;
  try {
    reply = await askAiJson<AiLectureReply>(prompt, { maxTokens: 5000 });
    plan = normalizePlan(reply);
  } catch (error) {
    notes.push(error instanceof Error ? error.message : 'The AI could not build this lecture plan.');
  }

  const generatedAt = plan ? new Date().toISOString() : null;
  const payload: LectureStudyPayload = {
    topicTitle,
    topicType,
    topicUrl,
    moduleTitle,
    courseCode,
    courseName,
    plan,
    generatedAt,
    ai: status,
    videos: reply ? channelPicks(reply.videos, topicTitle, courseName) : videos,
    readByAi: Boolean(lectureText),
    notes,
  };

  if (plan) {
    lectureCache.set(cacheKey, payload);
    if (lectureCache.size > 40) {
      const oldest = lectureCache.keys().next().value;
      if (oldest) lectureCache.delete(oldest);
    }
  }

  return payload;
}
