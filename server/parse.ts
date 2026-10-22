import { load, type Cheerio, type CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { findCourseCode } from '../shared/categorize';
import type {
  Announcement,
  Assignment,
  CalendarEvent,
  ContentModule,
  ContentTopic,
  Course,
  GradeItem,
} from '../shared/types';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function normalize(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function absoluteUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, `${baseUrl.replace(/\/+$/, '')}/`);
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Find the card container around a link without grabbing the whole page.
 * Climbing stops as soon as an ancestor holds more than one link of the same
 * kind, so tiles never inherit their neighbours' titles or codes.
 */
function cardRoot(
  $: CheerioAPI,
  element: Element,
  linkSelector: string,
  maxTextLength = 900,
): Cheerio<Element> {
  let node: Cheerio<Element> = $(element);
  let root: Cheerio<Element> = node;
  for (let depth = 0; depth < 4; depth += 1) {
    const parent = node.parent();
    if (!parent.length || parent.is('body, html')) break;
    if (normalize(parent.text()).length > maxTextLength) break;
    if (parent.find(linkSelector).length > 1) break;
    root = parent;
    node = parent;
    if (root.find('h1, h2, h3, h4, h5, [class*="title"], [class*="name"]').length > 0) break;
  }
  return root;
}

function cleanCourseName(raw: string, code: string | null): string {
  let name = normalize(raw);
  if (code) name = name.replace(code, ' ');
  name = name.replace(/\s*[-–|]\s*$/, '').replace(/^[\s\-–|]+/, '');
  return normalize(name);
}

/**
 * Read the enrolled courses out of a Brightspace home / course-list page.
 * Tiles link to `/d2l/home/<orgUnitId>`, so the org unit id is the stable key.
 */
export function parseCourses(html: string, baseUrl: string): Course[] {
  const $ = load(html);
  const found = new Map<string, Course>();

  $('a[href*="/d2l/home/"]').each((_index, element) => {
    const rawHref = $(element).attr('href') ?? '';
    const resolved = absoluteUrl(rawHref, baseUrl);
    if (!resolved) return;
    const match = /\/d2l\/home\/(\d+)/.exec(resolved);
    if (!match) return;
    const id = match[1];

    const root = cardRoot($, element, 'a[href*="/d2l/home/"]');
    const cardText = normalize(root.text());
    const code = findCourseCode(cardText) ?? findCourseCode(rawHref);

    const nameCandidates = [
      $(element).attr('aria-label'),
      root.find('h2, h3, h4, h5').first().text(),
      root.find('[class*="title"], [class*="name"]').first().text(),
      $(element).text(),
      $(element).attr('title'),
    ];

    let name = '';
    for (const candidate of nameCandidates) {
      const cleaned = cleanCourseName(candidate ?? '', code);
      if (cleaned.length >= 3 && !/^view all/i.test(cleaned) && !/^open$/i.test(cleaned)) {
        name = cleaned;
        break;
      }
    }
    if (!name) name = code ?? '';
    if (!name) return;
    if (/^(my courses|course home|home)$/i.test(name)) return;

    const imageSrc = root.find('img').first().attr('src') ?? null;
    const imageUrl =
      imageSrc && !imageSrc.startsWith('data:') ? absoluteUrl(imageSrc, baseUrl) : null;

    const existing = found.get(id);
    if (!existing || (existing.name === existing.code && name !== code)) {
      found.set(id, {
        id,
        name,
        code: code ?? '',
        url: resolved,
        imageUrl,
      });
    }
  });

  return [...found.values()];
}

function parseWhen(containerText: string, datetime: string | null, href: string | null): string | null {
  if (datetime) {
    const parsed = new Date(datetime);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const urlDate = href ? /[?&]d=(\d{4}-\d{2}-\d{2})/.exec(href)?.[1] : undefined;
  const monthMatch = new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})(?:,?\\s*(\\d{4}))?`, 'i').exec(
    containerText,
  );
  if (!monthMatch) return null;

  const month = MONTHS.indexOf(monthMatch[1].toLowerCase().slice(0, 3));
  const day = Number(monthMatch[2]);
  const year = monthMatch[3] ? Number(monthMatch[3]) : new Date().getFullYear();

  const timeMatch = /(\d{1,2}):(\d{2})\s*([AP])\.?M\.?/i.exec(containerText);
  let hours = 0;
  let minutes = 0;
  if (timeMatch) {
    hours = Number(timeMatch[1]) % 12;
    if (timeMatch[3].toUpperCase() === 'P') hours += 12;
    minutes = Number(timeMatch[2]);
  } else if (urlDate) {
    return new Date(`${urlDate}T00:00:00`).toISOString();
  }

  const date = new Date(year, month, day, hours, minutes);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Read the "Upcoming events" / calendar widget from a Brightspace page. */
export function parseEvents(html: string, baseUrl: string): CalendarEvent[] {
  const $ = load(html);
  const found = new Map<string, CalendarEvent>();

  $('a[href*="/d2l/le/calendar"]').each((_index, element) => {
    const rawHref = $(element).attr('href') ?? '';
    if (/\/d2l\/le\/calendar\/?$/i.test(rawHref)) return;
    const href = absoluteUrl(rawHref, baseUrl);
    const anchorText = normalize($(element).text() || $(element).attr('aria-label') || '');
    if (anchorText.length < 3 || /^(calendar|upcoming events|view all)$/i.test(anchorText)) return;
    if (/^\d+$/.test(anchorText)) return;

    const root = cardRoot($, element, 'a[href*="/d2l/le/calendar"]', 600);
    const containerText = normalize(root.text());
    const datetime = root.find('time[datetime]').first().attr('datetime') ?? $(element).find('time').first().attr('datetime') ?? null;
    const startsAt = parseWhen(containerText, datetime ?? null, rawHref);
    const courseCode = findCourseCode(containerText);
    const whenLabel = startsAt ? null : normalize(containerText.replace(anchorText, ' ')).slice(0, 80) || null;

    const key = `${href}|${anchorText}`;
    if (found.has(key)) return;
    found.set(key, {
      id: key,
      title: anchorText,
      courseCode,
      startsAt,
      whenLabel: whenLabel || null,
      url: href,
    });
  });

  return [...found.values()];
}

/** Turn a Brightspace course name from the API into plain display text. */
export function parseCourseName(raw: string): string {
  return normalize(raw.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"'));
}

/** Words that follow a name in the page text and must not become part of it. */
const NAME_STOP_WORDS = new Set([
  'my',
  'courses',
  'course',
  'calendar',
  'homepage',
  'home',
  'tools',
  'resources',
  'news',
  'announcements',
  'view',
  'all',
  'help',
]);

const MONTH_NAMES = [
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

function clockTime(text: string): { hours: number; minutes: number } | null {
  const match = /(\d{1,2}):(\d{2})\s*([AP])\.?\s*M\.?/i.exec(text);
  if (!match) return null;
  let hours = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'P') hours += 12;
  return { hours, minutes: Number(match[2]) };
}

/** "Oct 2, 2026 11:59 PM" from a Brightspace fuzzy date. */
function parseFuzzyDate(text: string): Date | null {
  const match = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(text);
  if (!match) return null;
  const key = match[1].toLowerCase().slice(0, 3);
  const index = MONTH_NAMES.findIndex((name) => name.startsWith(key));
  if (index < 0) return null;
  const time = clockTime(text);
  const date = new Date(Number(match[3]), index, Number(match[2]), time?.hours ?? 0, time?.minutes ?? 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Strip the trailing course name and the "Due / Ends / Starts" marker that
 * Brightspace puts in calendar event titles.
 */
function cleanEventTitle(raw: string, courses: Course[]): { title: string; courseCode: string | null } {
  let text = normalize(raw);
  let courseCode: string | null = null;

  for (const course of [...courses].sort((a, b) => b.name.length - a.name.length)) {
    if (course.name && text.endsWith(course.name)) {
      text = normalize(text.slice(0, text.length - course.name.length)).replace(/[\s\-–|]+$/, '');
      courseCode = course.code || null;
      break;
    }
  }

  text = text.replace(/\s*[-–|]\s*(due|ends|starts|event)\s*$/i, '').trim();
  return { title: text || normalize(raw), courseCode: courseCode ?? findCourseCode(raw) };
}

/**
 * Read the month grid on /d2l/le/calendar/<orgUnitId>. Each event anchor carries
 * the title and time; the surrounding cell supplies the day of the month.
 */
export function parseCalendarMonth(html: string, calendarUrl: string, courses: Course[]): CalendarEvent[] {
  const $ = load(html);
  const found = new Map<string, CalendarEvent>();

  // "Previous: September 2026" / "Next: November 2026" bracket the shown month.
  let month = -1;
  let year = 0;
  const next = /aria-label="Next: ([A-Za-z]+) (\d{4})"/.exec(html);
  const previous = /aria-label="Previous: ([A-Za-z]+) (\d{4})"/.exec(html);
  const shifted = next ?? previous;
  if (shifted) {
    const index = MONTH_NAMES.findIndex((name) => name.startsWith(shifted[1].toLowerCase().slice(0, 3)));
    if (index >= 0) {
      const delta = next ? -1 : 1;
      year = Number(shifted[2]);
      month = index + delta;
      if (month < 0) {
        month = 11;
        year -= 1;
      } else if (month > 11) {
        month = 0;
        year += 1;
      }
    }
  }

  $('a.d2l-le-calendar-event').each((_index, element) => {
    const node = $(element);
    const rawTitle = normalize(node.attr('title') ?? node.find('.d2l-le-calendar-event-title').text());
    if (rawTitle.length < 3) return;

    const cell = node.closest('td');
    if (cell.hasClass('d2l-le-calendar-month-other')) return;

    const dayCell = node.closest('.d2l-le-calendar-month-day');
    const dayNode = (dayCell.length > 0 ? dayCell : cell).clone();
    dayNode.find('a, .d2l-floating-container, .d2l-le-calendar-event-time').remove();
    const day = Number(/(\d{1,2})/.exec(normalize(dayNode.text()))?.[1] ?? 0);

    const time = clockTime(normalize(node.find('.d2l-le-calendar-event-time').text()));
    const fuzzy = parseFuzzyDate(
      normalize(cell.find('.d2l-le-calendar-event-overlay abbr.d2l-fuzzydate').first().attr('title') ?? ''),
    );

    let startsAt: string | null = null;
    if (month >= 0 && day > 0) {
      startsAt = new Date(year, month, day, time?.hours ?? 0, time?.minutes ?? 0).toISOString();
    } else if (fuzzy) {
      startsAt = fuzzy.toISOString();
    }

    const { title, courseCode } = cleanEventTitle(rawTitle, courses);
    const key = `${title}|${startsAt ?? ''}`;
    if (found.has(key)) return;

    found.set(key, {
      id: key,
      title,
      courseCode,
      startsAt,
      whenLabel: startsAt ? null : normalize(cell.text()).slice(0, 80) || null,
      url: calendarUrl,
    });
  });

  return [...found.values()];
}

/**
 * Announcement bodies come from course staff, so they are cleaned before they
 * reach the renderer: no scripts, event handlers or javascript: URLs, and
 * relative links are resolved against the D2L host.
 */
function sanitizeBody(raw: string, baseUrl: string): string {
  const $ = load(`<div id="body-root">${raw}</div>`);
  const root = $('#body-root');
  root.find('script, style, iframe, object, embed, link, meta, form, input, button').remove();

  root.find('*').each((_index, element) => {
    const node = element as Element;
    const attribs = node.attribs;
    if (!attribs) return;

    for (const name of Object.keys(attribs)) {
      if (/^on/i.test(name)) delete attribs[name];
      if ((name === 'href' || name === 'src') && /^\s*(javascript|data):/i.test(attribs[name])) {
        delete attribs[name];
      }
    }

    if (node.name === 'a') {
      const resolved = attribs.href ? absoluteUrl(attribs.href, baseUrl) : null;
      if (resolved) attribs.href = resolved;
      attribs.target = '_blank';
      attribs.rel = 'noreferrer noopener';
    }
    if (node.name === 'img' && attribs.src) {
      attribs.src = absoluteUrl(attribs.src, baseUrl) ?? attribs.src;
      attribs.loading = 'lazy';
    }
  });

  return root.html() ?? '';
}

/**
 * Read the course announcements page (`/d2l/lms/news/main.d2l?ou=<id>`).
 * Each announcement is a table row whose body sits in the details row below it.
 */
export function parseAnnouncements(html: string, baseUrl: string): Announcement[] {
  const $ = load(html);
  const found = new Map<string, Announcement>();

  $('a[href*="/d2l/le/news/"]').each((_index, element) => {
    const rawHref = $(element).attr('href') ?? '';
    if (!/\/view(?:\?|$)/.test(rawHref)) return;

    const url = absoluteUrl(rawHref, baseUrl);
    if (!url) return;
    const id = /\/news\/\d+\/(\d+)\//.exec(rawHref)?.[1] ?? url;

    const title = normalize($(element).text()) || normalize($(element).attr('title') ?? '');
    if (title.length < 3) return;

    const row = $(element).closest('tr');
    const dateText = normalize(row.find('td label').last().text());
    const published = parseFuzzyDate(dateText);

    const bodyNode = row.next('tr.d_detailsRow').find('d2l-html-block').first();
    const rawBody = bodyNode.attr('html') ?? bodyNode.html() ?? '';
    const bodyHtml = sanitizeBody(rawBody, baseUrl);

    if (found.has(id)) return;
    found.set(id, {
      id,
      title,
      publishedAt: published ? published.toISOString() : null,
      bodyHtml,
      bodyText: normalize(load(`<div>${bodyHtml}</div>`)('div').text()).slice(0, 600),
      url,
    });
  });

  return [...found.values()];
}

/** Read the assignments page (`/d2l/lms/dropbox/user/folders_list.d2l?ou=<id>`). */
export function parseAssignments(html: string, baseUrl: string): Assignment[] {
  const $ = load(html);
  const found = new Map<string, Assignment>();

  $('.d2l-foldername a[href*="folder_submit"]').each((_index, element) => {
    const node = $(element);
    const href = absoluteUrl(node.attr('href') ?? '', baseUrl);
    if (!href) return;

    const name = normalize(node.text()) || normalize(node.attr('title') ?? '');
    if (name.length < 2) return;

    const row = node.closest('tr');
    const dueLabel = normalize(row.find('.d2l-dates-text').first().text()).replace(/^due\s*(on)?\s*/i, '');
    const due = dueLabel ? parseFuzzyDate(dueLabel) : null;
    // D2L renders hidden numerator / slash / denominator labels, so the score
    // cell can read like "/ - 100 %" before the visible value.
    const rawScore = normalize(row.find('.d2l-grades-score').first().text()).replace(/^[\s/–—-]+/, '');
    const score = rawScore || null;
    // The first status column is the submission state; the last is feedback.
    const statusCell = row.find('td.d_gt').first();
    const status = normalize(statusCell.text()).replace(/\s*Feedback:\s*/i, '').trim() || null;
    const category =
      normalize(row.prevAll('tr.d_ggl2').first().text()).replace(/^no category$/i, '') || null;

    if (found.has(href)) return;
    found.set(href, {
      id: /db=(\d+)/.exec(href)?.[1] ?? href,
      name,
      category,
      dueAt: due ? due.toISOString() : null,
      dueLabel: due || !dueLabel ? null : dueLabel,
      score,
      status,
      url: href,
    });
  });

  return [...found.values()];
}

/**
 * Read the module tree from a content home page. Modules are the only tree items
 * with a `ModuleCO-` data key, so bookmarks and the table of contents are skipped.
 */
export function parseContentModules(html: string): ContentModule[] {
  const $ = load(html);
  const modules: ContentModule[] = [];
  const seen = new Set<string>();

  $('li[data-key*="ModuleCO-"]').each((_index, element) => {
    const node = $(element);
    const key = node.attr('data-key') ?? '';
    const id = /ModuleCO-(\d+)/.exec(key)?.[1];
    if (!id || seen.has(id)) return;

    const name = normalize(node.find('.d2l-textblock').not('.d2l-offscreen').first().text());
    if (!name) return;

    const badge = node.find('d2l-count-badge').first().attr('title') ?? '';
    const counts = /(\d+)\s+out of\s+(\d+)/i.exec(badge);

    seen.add(id);
    modules.push({
      id,
      name,
      depth: node.parents('li').length,
      remaining: counts ? Number(counts[1]) : null,
      total: counts ? Number(counts[2]) : null,
    });
  });

  return modules;
}

/** The module D2L selected when the page was rendered, e.g. "Tutorials F26". */
export function parseContentModuleTitle(html: string): string | null {
  const match = /List of Topics and Sub-Modules for ([^<]+)</i.exec(html);
  return match ? normalize(match[1]) : null;
}

/** Topics rendered for the selected module. */
export function parseContentTopics(html: string, baseUrl: string): ContentTopic[] {
  const $ = load(html);
  const topics = new Map<string, ContentTopic>();

  $('a[href*="/viewContent/"]').each((_index, element) => {
    const node = $(element);
    const url = absoluteUrl(node.attr('href') ?? '', baseUrl);
    if (!url) return;
    const id = /viewContent\/(\d+)/.exec(url)?.[1] ?? url;
    if (topics.has(id)) return;

    const title = normalize(node.text()) || normalize(node.attr('title') ?? '');
    if (title.length < 2) return;

    const typeNode = normalize(
      node.closest('.d2l-topic-view').find('.d2l-container-icon .d2l-textblock').first().text(),
    );
    const titleType = /[-–]\s*([^-–]+)$/.exec(node.attr('title') ?? '')?.[1];

    topics.set(id, {
      id,
      title,
      type: typeNode || normalize(titleType ?? '') || null,
      url,
    });
  });

  return [...topics.values()];
}

/** Read the gradebook table from `/d2l/lms/grades/my_grades/main.d2l?ou=<id>`. */
export function parseGrades(html: string, baseUrl: string): GradeItem[] {
  const $ = load(html);
  const table = $('table[summary*="grade items" i]').first();
  if (!table.length) return [];

  const items: GradeItem[] = [];

  table.find('tr').each((_index, element) => {
    const row = $(element);
    if (row.hasClass('d_gh')) return;

    const nameCell = row.children('th').first();
    const name = normalize(nameCell.text());
    if (!name) return;

    // Indented rows start with a tree-node cell; deeper nesting repeats it.
    const depth = row.children('td.d_g_treeNodeImage').length;
    const cells = row.children('td').not('.d_g_treeNodeImage');
    const last = cells.last();
    const link = last.find('a[href]').first();
    const href = link.attr('href') ?? '';

    const text = (index: number) => {
      const value = normalize(cells.eq(index).text()).replace(/^[\s/–—-]+$/, '').trim();
      return value || null;
    };

    items.push({
      id: `${depth}-${name}-${items.length}`,
      name,
      depth,
      kind: 'item',
      points: text(0),
      achieved: text(1),
      grade: text(2),
      comment: normalize(last.text()).replace(/\s*View Quiz Attempts\s*/i, '').trim() || null,
      url: href && !/^javascript:/i.test(href) ? absoluteUrl(href, baseUrl) : null,
    });
  });

  // A top-level row is a category when the row beneath it is indented.
  for (let index = 0; index < items.length - 1; index += 1) {
    if (items[index].depth === 0 && items[index + 1].depth > 0) items[index].kind = 'group';
  }

  return items;
}

/** Grab the signed-in student's first name / display name from the home page. */
export function parseUserName(html: string): string | null {
  const $ = load(html);
  const bodyText = normalize($('body').text() || html);

  // Only real name words: uppercase followed by lowercase letters, so the next
  // heading or a course code ("MTH140") is not swallowed into the name.
  const welcome = /[Ww]elcome [Bb]ack,?\s+([A-Z][\p{Ll}'’.-]+(?:\s+[A-Z][\p{Ll}'’.-]+){0,2})/u.exec(bodyText);
  if (welcome) {
    const words = normalize(welcome[1]).split(' ');
    const name: string[] = [];
    for (const word of words) {
      if (NAME_STOP_WORDS.has(word.toLowerCase())) break;
      name.push(word);
    }
    if (name.length > 0) return name.join(' ');
  }

  const profile = $('[class*="user-name"], [class*="user-profile"] [class*="name"], [aria-label*="profile" i]').first();
  const profileText = normalize(profile.text());
  if (profileText && profileText.length < 40) return profileText;

  return null;
}
