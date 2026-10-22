/**
 * Course management forms (syllabi, outlines) are PDFs with a schedule table:
 * week numbers, class dates, topics and assessment dates. This module pulls the
 * dated assessment lines out so the Calendar can import them without the user
 * retyping every deadline.
 */

import type { CourseFormDeadline } from '../shared/types';

/** ISO times, ready to become calendar events. */
export type ParsedDeadline = CourseFormDeadline;

interface RawDate {
  index: number;
  length: number;
  day: number;
  month: number;
  year: number | null;
  /** "month first" wins when two readings overlap, e.g. "11 November 13". */
  style: 'month' | 'day' | 'iso' | 'slash';
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const MONTH_PATTERN =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const MONTH_FIRST = new RegExp(`\\b${MONTH_PATTERN}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'gi');
const DAY_FIRST = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_PATTERN}(?:\\s+(\\d{4}))?`, 'gi');
const ISO_DATE = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
const SLASH_DATE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;

/** Words that mark a line as an assessment rather than a lecture topic. */
const ASSESSMENT =
  /\b(quiz|quizzes|test|midterm|final|exam|assignment|homework|project|proposal|paper|essay|report|presentation|deliverable|submission|due|deadline|submit)\b/i;

const IGNORE = /\b(no classes|study week|reading week|fall break|winter break|holiday)\b/i;

function monthIndex(name: string): number {
  const key = name.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((month) => month.startsWith(key));
}

function twoDigitYear(value: number): number {
  return value < 100 ? 2000 + value : value;
}

function plausible(month: number, day: number): boolean {
  return month >= 0 && month <= 11 && day >= 1 && day <= 31;
}

/** Every date written in the line, longest match first, overlaps dropped. */
export function findDates(line: string): RawDate[] {
  const found: RawDate[] = [];

  for (const match of line.matchAll(ISO_DATE)) {
    found.push({
      index: match.index ?? 0,
      length: match[0].length,
      year: Number(match[1]),
      month: Number(match[2]) - 1,
      day: Number(match[3]),
      style: 'iso',
    });
  }

  for (const match of line.matchAll(SLASH_DATE)) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    // 11/08 means November 8; 25/10 can only be 25 October.
    const month = first > 12 && second <= 12 ? second - 1 : first - 1;
    const day = first > 12 && second <= 12 ? first : second;
    found.push({
      index: match.index ?? 0,
      length: match[0].length,
      year: match[3] ? twoDigitYear(Number(match[3])) : null,
      month,
      day,
      style: 'slash',
    });
  }

  for (const match of line.matchAll(MONTH_FIRST)) {
    found.push({
      index: match.index ?? 0,
      length: match[0].length,
      year: match[3] ? Number(match[3]) : null,
      month: monthIndex(match[1]),
      day: Number(match[2]),
      style: 'month',
    });
  }

  for (const match of line.matchAll(DAY_FIRST)) {
    found.push({
      index: match.index ?? 0,
      length: match[0].length,
      year: match[3] ? Number(match[3]) : null,
      month: monthIndex(match[2]),
      day: Number(match[1]),
      style: 'day',
    });
  }

  const valid = found.filter((date) => plausible(date.month, date.day));

  // "Week 2 Sep 15" also looks like "2 Sep": longest match first keeps the
  // real date and drops the week number pretending to be a day.
  const accepted: RawDate[] = [];
  for (const date of [...valid].sort(
    (a, b) =>
      b.length - a.length ||
      (a.style === 'month' ? -1 : 0) - (b.style === 'month' ? -1 : 0) ||
      a.index - b.index,
  )) {
    const overlaps = accepted.some(
      (kept) => date.index < kept.index + kept.length && kept.index < date.index + date.length,
    );
    if (!overlaps) accepted.push(date);
  }
  return accepted.sort((a, b) => a.index - b.index);
}

const AMPM_CLOCK = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\.?\b/i;
const HOUR_CLOCK = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;

/**
 * "11:59 p.m." → 23:59. Also reads the start of a range like
 * "6:30 – 8:30 PM", where the meridiem belongs to both times.
 */
export function findClock(line: string): { minutes: number; index: number; length: number } | null {
  const ampm = AMPM_CLOCK.exec(line);
  const plain = HOUR_CLOCK.exec(line);
  if (!ampm && !plain) return null;

  if (ampm && (!plain || ampm.index <= plain.index)) {
    const hour = Math.min(12, Math.max(1, Number(ampm[1])));
    const minutes = Number(ampm[2] ?? '0');
    const pm = ampm[3].toLowerCase() === 'p';
    return {
      minutes: ((hour % 12) + (pm ? 12 : 0)) * 60 + minutes,
      index: ampm.index,
      length: ampm[0].length,
    };
  }

  // A bare "6:30" in "6:30 – 8:30 PM" borrows the PM from the end of the range.
  let hours = Number(plain![1]);
  const minutes = Number(plain![2]);
  let length = plain![0].length;
  const after = line.slice(plain!.index + length);
  const marker = /^\s*(?:(?:[–—-]|to)\s*\d{1,2}(?::\d{2})?\s*)?([ap])\.?\s?m\.?\b/i.exec(after);
  if (hours <= 12 && marker) {
    const pm = marker[1].toLowerCase() === 'p';
    hours = (hours % 12) + (pm ? 12 : 0);
    length += marker[0].length;
  }

  return { minutes: hours * 60 + minutes, index: plain!.index, length };
}

function resolveYear(month: number, day: number, explicit: number | null, today: Date): number {
  if (explicit) return explicit;
  const year = today.getFullYear();
  const candidate = new Date(year, month, day);
  // A Winter form uploaded in September names January; that is next year.
  if (today.getTime() - candidate.getTime() > 180 * 86_400_000) return year + 1;
  return year;
}

function cleanTitle(line: string, dates: RawDate[], clock: { index: number; length: number } | null): string {
  let title = line;
  const cuts = [
    ...dates.map((date) => ({ index: date.index, length: date.length })),
    ...(clock ? [{ index: clock.index, length: clock.length }] : []),
  ].sort((a, b) => b.index - a.index);

  for (const cut of cuts) {
    title = `${title.slice(0, cut.index)} ${title.slice(cut.index + cut.length)}`;
  }

  // Tidy punctuation first: the clock cut leaves a full stop ("p.m.") behind.
  title = title
    .replace(/[|•·]/g, ' ')
    .replace(/\s*[,;:]\s*(?=[,;:]|$)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—,;:.]+|[\s\-–—,;:.]+$/g, '')
    .replace(/^(?:week\s*\d+|w\d{1,2})\b\s*[|:.\-–—]?\s*/i, '')
    .replace(/^\s*\d{1,2}\s*[|:.\-–—]?\s*/, '')
    .replace(/(?:\b(?:due|deadline|by|at|on|in class)\b[\s.,;:]*)+$/i, '')
    .trim();

  return title;
}

function hashId(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

/**
 * Turn schedule text into deadline candidates. Lines without an assessment word
 * (plain lecture topics, "no classes") are skipped; the rest keep the last date
 * on the line, which is where the assessment column sits in these forms.
 */
export function parseDeadlinesFromText(text: string, options: { today?: Date } = {}): ParsedDeadline[] {
  const today = options.today ?? new Date();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const found: ParsedDeadline[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (!ASSESSMENT.test(line) || IGNORE.test(line)) continue;

    const dates = findDates(line);
    if (dates.length === 0) continue;

    const date = dates[dates.length - 1];
    const clock = findClock(line);
    const minutes = clock?.minutes ?? 9 * 60;
    const year = resolveYear(date.month, date.day, date.year, today);

    const startsAt = new Date(year, date.month, date.day, Math.floor(minutes / 60), minutes % 60, 0, 0);
    if (Number.isNaN(startsAt.getTime())) continue;

    const title = cleanTitle(line, dates, clock);
    if (title.length < 3 || !/[a-z]/i.test(title)) continue;

    const key = `${startsAt.toISOString()}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    found.push({
      id: `form-${hashId(key)}`,
      title: title.slice(0, 140),
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
      raw: line.slice(0, 200),
    });
  }

  return found.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 120);
}

interface PositionedItem {
  x: number;
  width: number;
  str: string;
}

interface TextRow {
  y: number;
  items: PositionedItem[];
}

/** PDF text runs on the same baseline become one visual line, left to right. */
function groupRows(items: Array<{ str?: string; transform?: number[]; width?: number }>): TextRow[] {
  const rows: TextRow[] = [];

  for (const item of items) {
    const str = typeof item.str === 'string' ? item.str : '';
    if (!str.trim() || !item.transform) continue;
    const y = item.transform[5];
    const positioned = { x: item.transform[4], width: item.width ?? 0, str };
    const row = rows.find((candidate) => Math.abs(candidate.y - y) < 3);
    if (row) row.items.push(positioned);
    else rows.push({ y, items: [positioned] });
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => ({ y: row.y, items: row.items.sort((a, b) => a.x - b.x) }));
}

/**
 * Rebuild visual lines from PDF text runs: same baseline → same line, sorted by
 * x. Tables come out row by row.
 */
export function textItemsToLines(
  items: Array<{ str?: string; transform?: number[] }>,
): string[] {
  return groupRows(items)
    .map((row) =>
      row.items
        .map((part) => part.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

interface TableColumn {
  x: number;
  right: number;
  text: string;
}

function headerCells(items: PositionedItem[]): TableColumn[] {
  const cells: TableColumn[] = [];
  for (const item of items) {
    const last = cells[cells.length - 1];
    if (last && item.x - last.right <= 14) {
      last.text = `${last.text} ${item.str}`.trim();
      last.right = Math.max(last.right, item.x + item.width);
    } else {
      cells.push({ x: item.x, right: item.x + item.width, text: item.str.trim() });
    }
  }
  return cells;
}

function datesInSeries(text: string, dates: RawDate[]): RawDate[] {
  for (let index = 1; index < dates.length; index += 1) {
    const between = text.slice(dates[index - 1].index + dates[index - 1].length, dates[index].index);
    // Only "Sep 21, Oct 5, ... and Nov 30" counts as one list of dates; text
    // between two dates (like "Assignment 1 due") means they are different columns.
    if (!/^[\s,;/&+–—-]*(?:and\b)?[\s,;/&+–—-]*$/i.test(between)) return [dates[dates.length - 1]];
  }
  return dates;
}

function tableTitle(raw: string): string {
  return raw
    .replace(/\(\s*x\s*\d+\s*\)/gi, ' ')
    // Superscript ordinal suffixes come through as separate runs: "13 th".
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi, '$1')
    .replace(/\s+(?:st|nd|rd|th)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—,;:.]+|[\s\-–—,;:.]+$/g, '')
    .trim();
}

function pageRows(items: Array<{ str?: string; transform?: number[]; width?: number }>): TextRow[] {
  return groupRows(items);
}

/** Body text sits in columns; nearby x positions are the same column. */
function columnAnchors(items: PositionedItem[]): number[] {
  const xs = [...new Set(items.map((item) => Math.round(item.x)))].sort((a, b) => a - b);
  const anchors: number[] = [];
  for (const x of xs) {
    const last = anchors[anchors.length - 1];
    if (last === undefined || x - last > 26) anchors.push(x);
  }
  return anchors;
}

function nearest(value: number, options: number[]): number {
  let best = options[0] ?? value;
  for (const option of options) {
    if (Math.abs(option - value) < Math.abs(best - value)) best = option;
  }
  return best;
}

interface TableRecord {
  title: string[];
  dateCell: string[];
}

/**
 * A row that begins an assessment cell, rather than continuing the previous
 * one ("(Chapters 1 – 4,", "6)", "October 9", a bold week number).
 */
function looksLikeAssessmentStart(text: string): boolean {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || !/[a-z]{2}/i.test(clean)) return false;
  if (/^[([\d.,;:–—•·\-]/.test(clean)) return false;
  if (/^[a-z]/.test(clean)) return false;
  // "October 9" and "6:30 – 8:30 pm" are the date under the assessment name.
  if (findDates(clean).length > 0 && !ASSESSMENT.test(clean)) return false;
  if (/^\d/.test(clean)) return false;
  return true;
}

function isPageFooter(row: TextRow): boolean {
  return /^page \d+(?: of \d+)?$/i.test(row.items.map((item) => item.str).join(' ').trim());
}

function isTableEnd(row: TextRow): boolean {
  const first = row.items[0];
  if (!first) return false;
  const text = row.items.map((item) => item.str).join(' ').trim();
  if (first.x < 90 && /^\*{1,4}\s*\S/.test(text)) return true;
  return (
    first.x < 76 &&
    /^(evaluation|grading scheme|notes?\b|polic(?:y|ies)\b|academic\b|missed\b|important dates\b)/i.test(text)
  );
}

/**
 * Assessment tables put the dates in their own column, and wrap both the
 * assessment name and the date list over several lines — sometimes over
 * several pages. Columns are located from the body text (headers are often
 * indented differently), and a record continues until the next name starts.
 */
export function parseAssessmentTables(
  pages: Array<Array<{ str?: string; transform?: number[]; width?: number }>>,
  options: { today?: Date } = {},
): ParsedDeadline[] {
  const today = options.today ?? new Date();
  const pageContent = pages.map(pageRows);

  let headerPage = -1;
  let headerIndex = -1;
  for (let page = 0; page < pageContent.length && headerPage < 0; page += 1) {
    const index = pageContent[page].findIndex((row) => {
      const text = row.items.map((item) => item.str).join(' ');
      return /assessment|evaluation/i.test(text) && /date|due|time/i.test(text);
    });
    if (index >= 0) {
      headerPage = page;
      headerIndex = index;
    }
  }
  if (headerPage < 0) return [];

  const headers = headerCells(pageContent[headerPage][headerIndex].items);
  const assessmentHeader = headers.find((column) => /assessment|evaluation/i.test(column.text));
  const dateHeader = headers.find((column) => /date|due|time/i.test(column.text));
  if (!assessmentHeader) return [];

  // Header x positions are often a little indented from the body cells they
  // label, so map each header to the nearest column actually used in the table.
  const bodyItems = pageContent
    .slice(headerPage)
    .flatMap((rows) => rows.flatMap((row) => row.items))
    .filter((item) => item.str.trim() && !/^page \d+/i.test(item.str.trim()));
  const discovered = columnAnchors(bodyItems);
  if (discovered.length === 0) return [];

  const assessmentX = nearest(assessmentHeader.x, discovered);
  const dateX = dateHeader ? nearest(dateHeader.x, discovered) : null;
  const anchors = [...new Set([assessmentX, ...(dateX === null ? [] : [dateX])])].sort((a, b) => a - b);
  const assignment = (x: number) => nearest(x, anchors);

  const records: TableRecord[] = [];
  let current: TableRecord | null = null;
  let stopped = false;

  const collect = (row: TextRow) => {
    if (stopped || isPageFooter(row)) return;
    if (isTableEnd(row)) {
      stopped = true;
      current = null;
      return;
    }

    const inAssessment = row.items.filter((item) => assignment(item.x) === assessmentX);
    const start = inAssessment.find((item) => looksLikeAssessmentStart(item.str));
    if (start) {
      current = { title: [], dateCell: [] };
      records.push(current);
    }
    if (current) {
      for (const item of inAssessment) current.title.push(item.str);
      if (dateX !== null) {
        for (const item of row.items) {
          if (assignment(item.x) === dateX) current.dateCell.push(item.str);
        }
      }
    }
  };

  for (let page = headerPage; page < pageContent.length; page += 1) {
    const rows = page === headerPage ? pageContent[page].slice(headerIndex + 1) : pageContent[page];
    for (const row of rows) {
      const text = row.items.map((item) => item.str).join(' ');
      // A repeated header on a later page is furniture, not a record.
      if (/assessment|evaluation/i.test(text) && /date|due|time/i.test(text) && row.items.length >= 2) {
        const widths = headerCells(row.items);
        if (widths.some((cell) => /assessment|evaluation/i.test(cell.text))) continue;
      }
      collect(row);
    }
  }

  const dateSamples = records.map((record) => record.dateCell.join(' ')).filter((text) => text.trim());
  const ranges = dateSamples.filter((text) => /\d\s*[–—-]\s*\d/.test(text)).length;
  const dated = dateSamples.filter((text) => findDates(text).length > 0).length;
  const dueColumn =
    (dateHeader ? /due|deadline|tentative/i.test(dateHeader.text) : false) ||
    (dated > 0 && ranges === 0);

  const found: ParsedDeadline[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    const rawTitle = record.title.join(' ').replace(/\s+/g, ' ').trim();
    if (!rawTitle) continue;
    if (/^no\s+assessment/i.test(rawTitle)) continue;

    const dateText = record.dateCell.join(' ').replace(/\s+/g, ' ').trim();
    const titleDates = findDates(rawTitle);
    const dates = titleDates.length > 0 ? titleDates : dueColumn ? findDates(dateText) : [];
    if (dates.length === 0) continue;

    const clock =
      findClock(rawTitle) ?? (dueColumn ? findClock(dateText) : null);
    const minutes = clock?.minutes ?? 9 * 60;
    const title = tableTitle(
      titleDates.length > 0 ? cleanTitle(rawTitle, titleDates, clock) : cleanTitle(rawTitle, [], null),
    );
    if (title.length < 3 || !/[a-z]/i.test(title)) continue;

    // `dates` indexes whichever string they came from, so keep that string when
    // checking whether they are one series ("Oct 5, Nov 2 and Nov 30").
    const seriesText = titleDates.length > 0 ? rawTitle : dateText;

    for (const date of datesInSeries(seriesText, dates)) {
      const year = resolveYear(date.month, date.day, date.year, today);
      const startsAt = new Date(year, date.month, date.day, Math.floor(minutes / 60), minutes % 60, 0, 0);
      if (Number.isNaN(startsAt.getTime())) continue;

      const key = `${startsAt.toISOString()}|${title.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      found.push({
        id: `form-${hashId(key)}`,
        title: title.slice(0, 140),
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
        raw: tableTitle(titleDates.length > 0 ? rawTitle : `${title} · ${dateText}`).slice(0, 200),
      });
    }
  }

  return found.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 120);
}

/** One page of a PDF, for callers that only have a single page of items. */
export function parseAssessmentTable(
  items: Array<{ str?: string; transform?: number[]; width?: number }>,
  options: { today?: Date } = {},
): ParsedDeadline[] {
  return parseAssessmentTables([items], options);
}

const MAX_BYTES = 15 * 1024 * 1024;

interface PdfContent {
  pages: Array<Array<{ str?: string; transform?: number[]; width?: number }>>;
  lines: string[];
}

async function readPdf(buffer: Buffer): Promise<PdfContent> {
  let pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs');
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    throw new Error('The PDF reader could not start. Reinstall the app and try again.');
  }

  const data = new Uint8Array(buffer);
  const document = await pdfjs
    .getDocument({ data, useSystemFonts: true, disableFontFace: true })
    .promise;

  const pages: PdfContent['pages'] = [];
  const lines: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items as Array<{ str?: string; transform?: number[]; width?: number }>;
      pages.push(items.filter((item) => typeof item.str === 'string' && item.str.trim() && item.transform));
      lines.push(...textItemsToLines(items));
      page.cleanup();
    }
  } finally {
    await document.destroy().catch(() => undefined);
  }

  return { pages, lines };
}

function isPdfBuffer(buffer: Buffer, mime: string): boolean {
  return /pdf/i.test(mime) || buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

/** Plain text of a PDF, used when the AI reads lecture slides or an outline. */
export async function pdfText(buffer: Buffer): Promise<string> {
  const content = await readPdf(buffer);
  return content.lines.join('\n');
}

/** Dates plus the readable text, so the same upload can feed the AI later. */
export async function readCourseForm(
  buffer: Buffer,
  mime: string,
): Promise<{ deadlines: ParsedDeadline[]; text: string }> {
  if (buffer.byteLength === 0) throw new Error('That file is empty.');
  if (buffer.byteLength > MAX_BYTES) throw new Error('That form is too large (15 MB limit).');

  if (!isPdfBuffer(buffer, mime)) {
    const text = buffer.toString('utf8');
    if (/[\u0000-\u0008\u000e-\u001f]/.test(text.slice(0, 4000))) {
      throw new Error('That file type is not supported. Upload the form as PDF or plain text.');
    }
    return { deadlines: parseDeadlinesFromText(text), text };
  }

  const content = await readPdf(buffer);
  if (content.lines.length === 0) {
    throw new Error('That PDF has no selectable text — it may be a scan. Upload a text-based PDF instead.');
  }

  const tables = parseAssessmentTables(content.pages);
  const text = content.lines.join('\n');

  // A form's assessment table is authoritative: it is the same data, but with
  // the dates in their own column instead of at the end of a schedule line.
  if (tables.length > 0) {
    const unique = new Map<string, ParsedDeadline>();
    for (const deadline of tables) {
      unique.set(`${deadline.startsAt}|${deadline.title.toLowerCase()}`, deadline);
    }
    return {
      deadlines: [...unique.values()].sort(
        (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
      ),
      text,
    };
  }

  return { deadlines: parseDeadlinesFromText(text), text };
}

/** PDF (text layer) or a plain-text outline; scans are rejected with a hint. */
export async function parseCourseForm(buffer: Buffer, mime: string): Promise<ParsedDeadline[]> {
  return (await readCourseForm(buffer, mime)).deadlines;
}
