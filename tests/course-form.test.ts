import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  findClock,
  findDates,
  parseAssessmentTable,
  parseAssessmentTables,
  parseCourseForm,
  parseDeadlinesFromText,
  textItemsToLines,
} from '../server/course-form';
import type * as Integrations from '../server/integrations';

/** Build a real, openable PDF with one line of Helvetica per text line. */
function makePdf(lines: string[]): Buffer {
  const content = ['BT', '/F1 11 Tf', '14 TL', '72 720 Td'];
  for (const line of lines) {
    const safe = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    content.push(`(${safe}) Tj`, 'T*');
  }
  content.push('ET');
  const stream = content.join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

const today = new Date('2026-09-01T10:00:00');

describe('findDates', () => {
  it('does not read a week number as a day', () => {
    const dates = findDates('Week 2 Sep 15 Quiz 1');
    expect(dates).toHaveLength(1);
    expect(dates[0]).toMatchObject({ month: 8, day: 15, year: null });
  });

  it('reads day-first, ISO and slash dates', () => {
    expect(findDates('15 September 2026')[0]).toMatchObject({ month: 8, day: 15, year: 2026 });
    expect(findDates('due 2026-10-30')[0]).toMatchObject({ month: 9, day: 30, year: 2026 });
    expect(findDates('due 11/08/2026')[0]).toMatchObject({ month: 10, day: 8, year: 2026 });
    expect(findDates('due 25/10')[0]).toMatchObject({ month: 9, day: 25, year: null });
  });
});

describe('findClock', () => {
  it('reads 12-hour and 24-hour times', () => {
    expect(findClock('due at 11:59 p.m.')?.minutes).toBe(23 * 60 + 59);
    expect(findClock('due 9:05 am')?.minutes).toBe(9 * 60 + 5);
    expect(findClock('due 23:59')?.minutes).toBe(23 * 60 + 59);
    expect(findClock('no time here')).toBeNull();
  });

  it('takes the start of a range and borrows the trailing PM', () => {
    expect(findClock('Friday, October 16, 2026, 6:30 – 8:30 PM')?.minutes).toBe(18 * 60 + 30);
    expect(findClock('9:00 AM to 11:00')?.minutes).toBe(9 * 60);
    expect(findClock('6:30 – 8:30 AM')?.minutes).toBe(6 * 60 + 30);
  });
});

/** A text run at a PDF position, as pdf.js reports it. */
function run(str: string, x: number, y: number, width = str.length * 5) {
  return { str, transform: [1, 0, 0, 1, x, y], width };
}

const ASSESSMENT_TABLE = [
  run('Assessment', 51, 654, 54),
  run('Tentative Date / Time', 180, 654, 102),
  run('Format / Notes', 310, 654, 70),
  run('Weight', 440, 654, 34),

  // Lab quizzes: the date list wraps over four lines in its own column.
  run('Lab Quizzes (x5)', 51, 631, 76),
  run('In your lab during the', 180, 631, 105),
  run('week of Sep 21, Oct 5,', 180, 618, 103),
  run('Nov 2, Nov 16, and Nov', 180, 606, 110),
  run('30', 180, 593, 11),
  run('1 Long-answer question', 310, 631, 106),
  run('20%', 440, 631, 20),

  // Midterm: the start time continues on the next line of the date cell.
  run('Midterm Test', 51, 570, 60),
  run('Friday, October 16, 2026,', 180, 570, 120),
  run('6:30', 180, 557, 20),
  run('–', 203, 557, 6),
  run('8:30 PM', 212, 557, 40),
  run('Multiple-choice/long-', 310, 570, 97),
  run('answer questions', 310, 557, 76),
  run('35%', 440, 570, 20),

  // Final exam names only an examination period, so it has no date to place.
  run('Final Exam', 51, 534, 51),
  run('During Examination', 180, 534, 97),
  run('Period in Dec', 180, 521, 64),
  run('Multiple-choice/Long', 310, 534, 97),
  run('45%', 440, 534, 20),

  run('Grades will be posted electronically on D2L.', 47, 488, 493),
];

describe('parseAssessmentTable', () => {
  it('keeps wrapped cells together and lists every date in a series', () => {
    const deadlines = parseAssessmentTable(ASSESSMENT_TABLE, { today });

    expect(deadlines.map((deadline) => deadline.title)).toEqual([
      'Lab Quizzes',
      'Lab Quizzes',
      'Midterm Test',
      'Lab Quizzes',
      'Lab Quizzes',
      'Lab Quizzes',
    ]);
    expect(deadlines.map((deadline) => new Date(deadline.startsAt).getMonth())).toEqual([
      8, 9, 9, 10, 10, 10,
    ]);
    expect(deadlines.map((deadline) => new Date(deadline.startsAt).getDate())).toEqual([
      21, 5, 16, 2, 16, 30,
    ]);

    const midterm = deadlines.find((deadline) => deadline.title === 'Midterm Test');
    expect(new Date(midterm!.startsAt).getHours()).toBe(18);
    expect(new Date(midterm!.startsAt).getMinutes()).toBe(30);

    const labQuiz = deadlines[0];
    expect(new Date(labQuiz.startsAt).getHours()).toBe(9);
    expect(labQuiz.raw).toContain('week of Sep 21, Oct 5, Nov 2, Nov 16, and Nov 30');
  });

  it('returns nothing when the header is missing or undated', () => {
    expect(parseAssessmentTable([run('No table here', 51, 700)])).toEqual([]);
    expect(
      parseAssessmentTable([
        run('Assessment', 51, 654),
        run('Date', 180, 654),
        run('Final Exam', 51, 631),
        run('During Examination Period in Dec', 180, 631),
      ]),
    ).toEqual([]);
  });
});

describe('parseAssessmentTables', () => {
  // A CHY-style schedule: week and chapter columns, plus an assessments column
  // whose dates start on one page and finish on the next. The header is
  // indented differently from the body cells it labels.
  const schedulePage = [
    run('*Week', 79, 174, 30),
    run('Dates', 162, 174, 26),
    run('**Chapters Covered', 250, 174, 100),
    run('***Assessments', 423, 174, 70),
    run('5', 77, 143, 7),
    run('Oct 6', 127, 143, 28),
    run('– 12', 165, 143, 20),
    run('Chapter 5: Gases', 240, 143, 95),
    run('Midterm 1', 417, 143, 50),
    run('(Chapters 1 – 4,', 477, 143, 90),
    run('6)', 417, 129, 12),
    run('October 9', 417, 115, 48),
    run('6:30 – 8:30 pm', 477, 115, 80),
    run('Midterm 2', 417, 24, 50),
    run('(Chapters 5, 11', 477, 24, 85),
    run('Page 6 of 21', 280, 50, 52),
  ];
  const continuationPage = [
    run('November 13', 417, 667, 65),
    run('6:30 – 8:30', 417, 653, 70),
    run('pm', 499, 653, 12),
    run('– 14)', 477, 641, 40),
    run('10', 83, 600, 10),
    run('Nov 10', 127, 600, 30),
    run('– 16', 175, 600, 20),
    run('Chapter 15: Acids and Bases', 240, 600, 130),
    run('Page 7 of 21', 280, 50, 52),
    run('* Due to the first classes starting', 65, 342, 185),
    run('on September 8', 65, 330, 80),
  ];

  it('keeps a midterm together across pages and ignores week ranges', () => {
    const deadlines = parseAssessmentTables([schedulePage, continuationPage], { today });

    expect(deadlines.map((deadline) => deadline.title)).toEqual([
      expect.stringMatching(/^Midterm 1\b/),
      expect.stringMatching(/^Midterm 2\b/),
    ]);
    expect(deadlines.map((deadline) => deadline.startsAt.slice(0, 10))).toEqual([
      '2026-10-09',
      '2026-11-13',
    ]);
    expect(new Date(deadlines[0].startsAt).getHours()).toBe(18);
    expect(new Date(deadlines[0].startsAt).getMinutes()).toBe(30);
    expect(deadlines[0].title).toContain('Chapters 1 – 4, 6');
  });
});

describe('parseDeadlinesFromText', () => {
  it('keeps the due date, not the class date', () => {
    const [deadline] = parseDeadlinesFromText('Week 3   Sep 22   Assignment 1 due Sep 25 at 11:59 p.m.', {
      today,
    });
    expect(deadline.title).toBe('Assignment 1');
    expect(new Date(deadline.startsAt).getDate()).toBe(25);
    expect(new Date(deadline.startsAt).getHours()).toBe(23);
    expect(new Date(deadline.startsAt).getMinutes()).toBe(59);
  });

  it('drops lecture topics, breaks and undated rows', () => {
    const text = [
      'Week 1   Sep 8    Course introduction and vectors',
      'Week 4   Sep 29   No classes - study week',
      'Week 5   Oct 6    Midterm exam Oct 8, 2026 at 6:00 p.m.',
      'Quiz period: see announcements',
    ].join('\n');
    const deadlines = parseDeadlinesFromText(text, { today });
    expect(deadlines.map((deadline) => deadline.title)).toEqual(['Midterm exam']);
    expect(new Date(deadlines[0].startsAt).getHours()).toBe(18);
  });

  it('defaults to 9:00 and the next year for a Winter date', () => {
    const [deadline] = parseDeadlinesFromText('Lab report due Jan 12', { today });
    expect(new Date(deadline.startsAt).getFullYear()).toBe(2027);
    expect(new Date(deadline.startsAt).getHours()).toBe(9);
  });

  it('ignores dates with no assessment word and de-duplicates rows', () => {
    const text = ['Assignment 2 due Oct 16', 'Assignment 2 due Oct 16', 'Reading: chapter 4 (Oct 18)'].join(
      '\n',
    );
    const deadlines = parseDeadlinesFromText(text, { today });
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0].title).toBe('Assignment 2');
  });
});

describe('textItemsToLines', () => {
  it('joins runs sharing a baseline, left to right', () => {
    const lines = textItemsToLines([
      { str: 'Quiz 1', transform: [1, 0, 0, 1, 200, 700] },
      { str: 'Week 2', transform: [1, 0, 0, 1, 40, 700] },
      { str: 'Sep 15', transform: [1, 0, 0, 1, 100, 700] },
      { str: 'Week 3', transform: [1, 0, 0, 1, 40, 680] },
    ]);
    expect(lines).toEqual(['Week 2 Sep 15 Quiz 1', 'Week 3']);
  });
});

describe('parseCourseForm', () => {
  it('reads the schedule table out of a text-based PDF', async () => {
    const buffer = makePdf([
      'MTH 141 - Linear Algebra - Fall 2026',
      'Week 2   Sep 15   Quiz 1 - Vectors',
      'Week 3   Sep 22   Assignment 1 due Sep 25 at 11:59 p.m.',
      'Week 4   Sep 29   No classes - study week',
    ]);

    const deadlines = await parseCourseForm(buffer, 'application/pdf');
    expect(deadlines.map((deadline) => deadline.title)).toEqual(['Quiz 1 - Vectors', 'Assignment 1']);
    expect(deadlines[1].raw).toContain('Assignment 1 due Sep 25');
  });

  it('reads a plain-text outline too', async () => {
    const deadlines = await parseCourseForm(
      Buffer.from('Final project proposal due 2026-10-30\n'),
      'text/plain',
    );
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0].startsAt.startsWith('2026-10-30')).toBe(true);
  });

  it('rejects empty files', async () => {
    await expect(parseCourseForm(Buffer.alloc(0), 'application/pdf')).rejects.toThrow(/empty/i);
  });
});

describe('importFormDeadlines', () => {
  let integrations: typeof Integrations;

  beforeAll(async () => {
    process.env.D2L_HUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'd2l-hub-form-'));
    integrations = await import('../server/integrations');
  });

  it('adds dates once, tagging the course and skipping a re-upload', () => {
    const first = integrations.importFormDeadlines('MTH141', [
      { title: 'Assignment 1', startsAt: '2026-09-25T03:59:00.000Z', endsAt: '2026-09-25T04:29:00.000Z' },
      { title: 'Quiz 1', startsAt: '2026-09-15T13:00:00.000Z', endsAt: '2026-09-15T13:30:00.000Z' },
      { title: '', startsAt: 'nope', endsAt: 'nope' },
    ]);

    expect(first.added).toBe(2);
    expect(first.skipped).toBe(1);
    const stored = integrations.listLocalEvents();
    expect(stored).toHaveLength(2);
    expect(stored.every((event) => event.source === 'form' && event.courseCode === 'MTH141')).toBe(true);

    const again = integrations.importFormDeadlines('MTH141', [
      { title: 'Assignment 1', startsAt: '2026-09-25T03:59:00.000Z', endsAt: '2026-09-25T04:29:00.000Z' },
    ]);
    expect(again.added).toBe(0);
    expect(again.skipped).toBe(1);
    expect(integrations.listLocalEvents()).toHaveLength(2);
  });
});
