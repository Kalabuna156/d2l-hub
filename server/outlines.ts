/**
 * Outline scanning: find the course management form in a course's files, read
 * its text, and let the user's AI turn it into calendar dates. The text is kept
 * on this computer so Study can use the same topics later.
 */

import { describeCourse, findCourseCode } from '../shared/categorize';
import type {
  Course,
  CourseFormDeadline,
  LibraryFile,
  OutlineRecord,
  OutlineScanResult,
} from '../shared/types';
import { AI_PROVIDER_LABELS, aiStatus, askAiJson } from './ai';
import { readConfig, updateConfig } from './config';
import { loadCourseContent, loadDashboard } from './d2l';
import { fetchTopicBuffer, readLibraryBuffer } from './library';
import { pdfText, readCourseForm } from './course-form';
import { officeText } from './office';

const OUTLINE_NAME =
  /outline|syllabus|course\s+(?:management\s+)?(?:form|information|info|description|policy|policies)/i;

const MAX_OUTLINE_TEXT = 60_000;
const MAX_PROMPT_TEXT = 42_000;

/** MTH141_F26_01 / "MTH 141" → "MTH141", the key outlines and files share. */
export function shortCourseCode(code: string | null | undefined, name?: string | null): string {
  const info = describeCourse({ code: code ?? '', name: name ?? '' });
  if (info.number) return `${info.subject}${info.number}`.toUpperCase();

  const found = findCourseCode(code ?? '') ?? findCourseCode(name ?? '');
  if (found) {
    const match = /^([A-Z]{2,6}\d{2,4}[A-Z]?)_/.exec(found.toUpperCase());
    if (match) return match[1];
  }
  return (code ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase() || 'COURSE';
}

export function outlineFor(courseCode: string | null | undefined): OutlineRecord | null {
  const key = shortCourseCode(courseCode);
  return readConfig().outlines.find((outline) => outline.courseCode === key) ?? null;
}

export function saveOutline(
  courseCode: string,
  fileName: string,
  source: OutlineRecord['source'],
  text: string,
): OutlineRecord {
  const key = shortCourseCode(courseCode);
  const record: OutlineRecord = {
    courseCode: key,
    fileName: fileName.slice(0, 160) || 'Course outline',
    source,
    text: text.slice(0, MAX_OUTLINE_TEXT),
    savedAt: new Date().toISOString(),
  };
  updateConfig((config) => ({
    ...config,
    outlines: [record, ...config.outlines.filter((item) => item.courseCode !== key)].slice(0, 24),
  }));
  return record;
}

/** Modules and topics for a course, used by both the scan and Study. */
export async function courseTopics(
  courseId: string,
): Promise<Array<{ title: string; type: string | null; url: string; folder: string | null }>> {
  const first = await loadCourseContent(courseId);
  if (!first) return [];

  const topics = first.topics.map((topic) => ({
    title: topic.title,
    type: topic.type,
    url: topic.url,
    folder: first.moduleTitle,
  }));
  const seen = new Set<string>([first.moduleId ?? '']);
  for (const module of first.modules.slice(0, 10)) {
    if (seen.has(module.id)) continue;
    seen.add(module.id);
    const content = await loadCourseContent(courseId, module.id).catch(() => null);
    if (!content) continue;
    topics.push(
      ...content.topics.map((topic) => ({
        title: topic.title,
        type: topic.type,
        url: topic.url,
        folder: module.name,
      })),
    );
  }

  const unique = new Map<string, (typeof topics)[number]>();
  for (const topic of topics) unique.set(topic.url, topic);
  return [...unique.values()];
}

export async function textFromBuffer(
  buffer: Buffer,
  mime: string,
  fileName: string,
): Promise<string | null> {
  const isPdf = /pdf/i.test(mime) || buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  if (isPdf) {
    try {
      const text = await pdfText(buffer);
      return text.trim() ? text : null;
    } catch {
      return null;
    }
  }
  if (/docx|pptx|wordprocessingml|presentationml|\.docx$|\.pptx$/i.test(`${mime} ${fileName}`)) {
    const text = officeText(buffer);
    if (text) return text;
  }
  if (/text\/|markdown|\.txt$|\.md$/i.test(`${mime} ${fileName}`)) {
    const text = buffer.toString('utf8');
    if (!/[\u0000-\u0008\u000e-\u001f]/.test(text.slice(0, 2000))) return text;
  }
  return null;
}

interface OutlineCandidate {
  fileName: string;
  source: OutlineRecord['source'];
  text: string;
  /** Present for files we can also parse with the table reader */
  buffer?: Buffer;
  mime?: string;
}

function looksLikeOutline(file: Pick<LibraryFile, 'title' | 'fileName' | 'folder'>): boolean {
  return OUTLINE_NAME.test(`${file.title} ${file.fileName} ${file.folder ?? ''}`);
}

function matchesCourse(code: string, courseName: string, otherCode: string | null, otherName: string): boolean {
  if (shortCourseCode(otherCode, otherName) === code) return true;
  return otherName.trim().toLowerCase() === courseName.trim().toLowerCase() && courseName.trim().length > 2;
}

async function fromD2l(course: Course): Promise<OutlineCandidate | null> {
  const topics = await courseTopics(course.id);
  const outlines = topics.filter((topic) => OUTLINE_NAME.test(`${topic.title} ${topic.type ?? ''}`));
  for (const topic of outlines.slice(0, 3)) {
    try {
      const fetched = await fetchTopicBuffer({ url: topic.url });
      const text = await textFromBuffer(fetched.buffer, fetched.mime, fetched.name ?? topic.title);
      if (text) {
        return {
          fileName: fetched.name ?? `${topic.title}.pdf`,
          source: 'd2l',
          text,
          buffer: fetched.buffer,
          mime: fetched.mime,
        };
      }
    } catch {
      // Try the next topic; one broken viewer must not end the course.
    }
  }
  return null;
}

async function fromLibraryAsync(course: Course, code: string): Promise<OutlineCandidate | null> {
  const files = readConfig()
    .contentFiles.filter((file) => looksLikeOutline(file))
    .filter((file) => matchesCourse(code, course.name, file.courseCode, file.courseName))
    .sort((a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime());

  for (const file of files.slice(0, 4)) {
    const found = readLibraryBuffer(file.id);
    if (!found) continue;
    const text = await textFromBuffer(found.buffer, found.file.mime, found.file.fileName);
    if (text) {
      return {
        fileName: found.file.fileName,
        source: 'library',
        text,
        buffer: found.buffer,
        mime: found.file.mime,
      };
    }
  }
  return null;
}

interface AiOutlineReply {
  assessments?: Array<{
    title?: unknown;
    date?: unknown;
    time?: unknown;
    kind?: unknown;
    detail?: unknown;
  }>;
  undated?: Array<{ title?: unknown; when?: unknown }>;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function timeToMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function aiDeadlines(reply: AiOutlineReply, today: Date): CourseFormDeadline[] {
  const found: CourseFormDeadline[] = [];
  const seen = new Set<string>();
  const kinds = new Set(['quiz', 'midterm', 'final', 'exam', 'assignment', 'test', 'project', 'other']);

  for (const item of Array.isArray(reply.assessments) ? reply.assessments : []) {
    const title = cleanText(item.title, 120);
    const date = cleanText(item.date, 10);
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const [year, month, day] = date.split('-').map(Number);
    if (year < today.getFullYear() - 1 || year > today.getFullYear() + 2) continue;
    const minutes = timeToMinutes(item.time) ?? 9 * 60;
    const startsAt = new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0, 0);
    if (Number.isNaN(startsAt.getTime())) continue;

    const kind = cleanText(item.kind, 20).toLowerCase();
    const detail = cleanText(item.detail, 160);
    const label = title.length >= 3 ? title : kind && kinds.has(kind) ? kind : 'Assessment';
    const key = `${startsAt.toISOString()}|${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    found.push({
      id: `form-ai-${Math.random().toString(36).slice(2, 10)}`,
      title: label,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
      raw: detail || `${label} · ${date}`,
    });
  }

  return found.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

function mergeDeadlines(primary: CourseFormDeadline[], extra: CourseFormDeadline[]): CourseFormDeadline[] {
  const seen = new Set(primary.map((deadline) => deadline.startsAt));
  const merged = [...primary];
  for (const deadline of extra) {
    if (seen.has(deadline.startsAt)) continue;
    seen.add(deadline.startsAt);
    merged.push(deadline);
  }
  return merged.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 120);
}

async function askForOutline(
  candidate: OutlineCandidate,
  course: Course,
  today: Date,
): Promise<{ deadlines: CourseFormDeadline[]; undated: Array<{ title: string; when: string }> }> {
  const prompt = `You are reading the course outline for ${course.name} (${course.code || course.name}).
Today is ${today.toISOString().slice(0, 10)}.

Extract every graded assessment that has a specific calendar due date: quizzes, tests, midterms, exams,
assignments, essays, projects, presentations, reports and submissions.

Rules:
- One entry per date. A date cell like "Oct 5, Nov 2 and Nov 30" becomes three entries with the same title.
- Prefer a date written inside the assessment cell. Ignore the week's Monday-Sunday range column
  (for example "Sept 15 – 21" is a teaching week, not a due date).
- Never invent a date. "TBD", "during the examination period", "week of" without a day, and
  "see D2L" belong in undated.
- Use a 24-hour HH:MM time. For a range like 6:30 – 8:30 pm use the start. If no time is given, null.
- Use the year the outline is for. If a date has no year, choose the year that keeps it in that term.
- Keep titles short and specific ("Midterm 1", "Lab Quiz 2"); leave weights, chapters and rooms in detail.

Return JSON only:
{"assessments":[{"title":"Midterm 1","date":"2026-10-09","time":"18:30","kind":"midterm","detail":"Chapters 1-4, 6"}],
 "undated":[{"title":"Final Exam","when":"December examination period, date TBD"}]}

Outline text:
${candidate.text.slice(0, MAX_PROMPT_TEXT)}`;

  const reply = await askAiJson<AiOutlineReply>(prompt, { maxTokens: 4096 });
  const undated = (Array.isArray(reply.undated) ? reply.undated : [])
    .map((item) => ({ title: cleanText(item.title, 120), when: cleanText(item.when, 120) }))
    .filter((item) => item.title)
    .slice(0, 20);
  return { deadlines: aiDeadlines(reply, today), undated };
}

/**
 * Go through every course, find its outline and ask the AI for the dates.
 * Nothing is added to the calendar here; the review dialog decides that.
 */
export async function scanCourseOutlines(): Promise<OutlineScanResult> {
  const status = aiStatus();
  if (!status.configured) {
    throw new Error('Add your own AI API key in Settings → AI to scan outlines.');
  }

  const dashboard = await loadDashboard();
  // Preview/sample courses are not real enrollments; only a live session's
  // courses (and shelves built from local files) are worth scanning.
  const courses = dashboard.connected
    ? dashboard.data.courses.filter((course) => describeCourse(course).kind === 'course')
    : [];

  // Uploaded files bring their own course shelf even when D2L is not connected.
  const known = new Set(courses.map((course) => course.id));
  for (const file of readConfig().contentFiles) {
    if (known.has(file.courseId) || file.courseId.startsWith('exam-bank')) continue;
    if (!looksLikeOutline(file)) continue;
    known.add(file.courseId);
    courses.push({
      id: file.courseId,
      name: file.courseName,
      code: file.courseCode ?? '',
      url: '',
      imageUrl: null,
    });
  }
  // Outlines read earlier can be scanned again even if the file is gone.
  for (const outline of readConfig().outlines) {
    const id = `outline-${outline.courseCode}`;
    if (known.has(id) || courses.some((course) => shortCourseCode(course.code, course.name) === outline.courseCode)) {
      continue;
    }
    known.add(id);
    courses.push({
      id,
      name: `${outline.courseCode} — saved outline`,
      code: outline.courseCode,
      url: '',
      imageUrl: null,
    });
  }

  const today = new Date();
  const results: OutlineScanResult['courses'] = [];

  for (const course of courses.slice(0, 10)) {
    const code = shortCourseCode(course.code, course.name);
    let candidate: OutlineCandidate | null = null;

    if (dashboard.connected) candidate = await fromD2l(course).catch(() => null);
    if (!candidate) candidate = await fromLibraryAsync(course, code);
    if (!candidate) {
      const saved = outlineFor(code);
      if (saved) {
        candidate = { fileName: saved.fileName, source: 'saved', text: saved.text };
      }
    }

    if (!candidate) {
      results.push({
        courseId: course.id,
        courseCode: code,
        courseName: course.name,
        outlineFileName: null,
        outlineSource: null,
        deadlines: [],
        undated: [],
        error: null,
      });
      continue;
    }

    let heuristic: CourseFormDeadline[] = [];
    if (candidate.buffer) {
      try {
        const parsed = await readCourseForm(candidate.buffer, candidate.mime ?? '');
        heuristic = parsed.deadlines;
      } catch {
        // AI can still read the text we already have.
      }
    } else if (candidate.source === 'saved') {
      // A saved outline has no layout left, so only strong dated lines are used,
      // and only as a fallback when the AI reply is unavailable.
      heuristic = [];
    }

    // Keep the text locally even if the provider is down: the dates can still
    // come from the table parser and Study can use the outline later.
    saveOutline(code, candidate.fileName, candidate.source, candidate.text);
    try {
      const ai = await askForOutline(candidate, course, today);
      results.push({
        courseId: course.id,
        courseCode: code,
        courseName: course.name,
        outlineFileName: candidate.fileName,
        outlineSource: candidate.source,
        deadlines: mergeDeadlines(ai.deadlines, heuristic),
        undated: ai.undated,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The AI could not read that outline.';
      results.push({
        courseId: course.id,
        courseCode: code,
        courseName: course.name,
        outlineFileName: candidate.fileName,
        outlineSource: candidate.source,
        deadlines: heuristic,
        undated: [],
        error: message,
      });
    }
  }

  return {
    provider: AI_PROVIDER_LABELS[status.provider],
    model: status.model,
    courses: results,
  };
}
