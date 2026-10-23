import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';
import { DATA_DIR, DEMO_MODE, cookieHeader, hasSessionCookie, readConfig, updateConfig } from './config';
import type { LibraryFile } from '../shared/types';

const CONTENT_DIR = path.join(DATA_DIR, 'content');
const MAX_BYTES = 150 * 1024 * 1024;
const TIMEOUT_MS = 60_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'application/rtf': 'rtf',
};

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
  txt: 'text/plain',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  rtf: 'application/rtf',
};

export interface TopicDownloadInput {
  courseId?: unknown;
  courseCode?: unknown;
  courseName?: unknown;
  title?: unknown;
  url?: unknown;
  folder?: unknown;
}

function text(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function safeName(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 110);
  return cleaned || 'file';
}

function extensionFrom(value: string): string | null {
  const match = /\.([a-z0-9]{2,5})(?:$|[?#])/i.exec(value.trim());
  return match ? match[1].toLowerCase() : null;
}

function extensionFor(mime: string, url: string, name: string): string {
  const fromMime = MIME_EXT[mime.split(';')[0].trim().toLowerCase()];
  if (fromMime) return fromMime;
  return extensionFrom(url) ?? extensionFrom(name) ?? 'bin';
}

function mimeFor(ext: string, declared: string): string {
  const clean = declared.split(';')[0].trim().toLowerCase();
  if (clean && clean !== 'application/octet-stream') return clean;
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

function dispositionName(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      /* fall through to the plain filename */
    }
  }
  return /filename="?([^";]+)"?/i.exec(header)?.[1] ?? null;
}

/** Content Space lives next to the session; the bytes never leave this machine. */
export function ensureContentDir(): string {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  return CONTENT_DIR;
}

export function listLibrary(): LibraryFile[] {
  return [...readConfig().contentFiles].sort(
    (a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime(),
  );
}

/**
 * New downloads live in content/<id>/<readable name>; older ones were saved
 * flat as content/<id>.<ext>. Those are moved on first access, so a folder
 * opened from Content Space always shows a name worth dragging into a chat.
 */
function storedPathFor(file: LibraryFile): string | null {
  const folder = path.join(CONTENT_DIR, file.id);
  const named = path.join(folder, safeName(file.fileName));
  if (fs.existsSync(named)) return named;

  try {
    const legacyName = fs
      .readdirSync(ensureContentDir())
      .find((entry) => entry.startsWith(`${file.id}.`));
    if (!legacyName) return null;

    const legacyPath = path.join(CONTENT_DIR, legacyName);
    try {
      fs.mkdirSync(folder, { recursive: true });
      fs.renameSync(legacyPath, named);
      return named;
    } catch {
      // A reader may be holding the old file open; serve it where it is.
      return legacyPath;
    }
  } catch {
    return null;
  }
}

/** Delete a file's bytes, plus the per-file folder it now lives in. */
function discardStored(file: LibraryFile): void {
  const stored = storedPathFor(file);
  if (!stored) return;
  fs.rmSync(stored, { force: true });
  const folder = path.dirname(stored);
  if (folder !== CONTENT_DIR) fs.rmSync(folder, { recursive: true, force: true });
}

export function libraryFilePath(id: unknown): { file: LibraryFile; filePath: string } | null {
  const key = typeof id === 'string' ? id : '';
  if (!/^lib-[a-z0-9-]{4,80}$/i.test(key)) return null;
  const file = readConfig().contentFiles.find((entry) => entry.id === key);
  if (!file) return null;
  const filePath = storedPathFor(file);
  return filePath ? { file, filePath } : null;
}

export function removeLibraryFile(id: unknown): boolean {
  const key = typeof id === 'string' ? id : '';
  const file = readConfig().contentFiles.find((entry) => entry.id === key);
  if (!file) return false;

  discardStored(file);
  // Ink notes and OCR text belong to this file; do not leave them orphaned.
  if (/^lib-[a-z0-9-]{4,80}$/i.test(key)) {
    for (const folder of ['annotations', 'ocr']) {
      fs.rmSync(path.join(DATA_DIR, folder, `${key}.json`), { force: true });
    }
  }
  updateConfig((config) => ({
    ...config,
    contentFiles: config.contentFiles.filter((entry) => entry.id !== key),
  }));
  return true;
}

/** Show a saved file in the OS file manager, ready to drag or copy elsewhere. */
export async function revealLibraryFile(id: unknown): Promise<boolean> {
  const found = libraryFilePath(id);
  if (!found) return false;

  const run = (command: string, args: string[]) =>
    new Promise<void>((resolve) => {
      execFile(command, args, () => resolve());
    });

  if (process.platform === 'win32') {
    await run('explorer.exe', ['/select,', found.filePath]);
  } else if (process.platform === 'darwin') {
    await run('open', ['-R', found.filePath]);
  } else {
    await run('xdg-open', [path.dirname(found.filePath)]);
  }
  return true;
}

interface StoredFileInput {
  courseId: string;
  courseCode: string | null;
  courseName: string;
  title: string;
  folder: string | null;
  /** The user picked this folder, so grouping should honour it. */
  folderPinned?: boolean;
  source: 'd2l' | 'drive' | 'local';
  sourceUrl: string | null;
  displayName: string;
  mime: string;
  buffer: Buffer;
}

function storeFile(input: StoredFileInput): LibraryFile {
  if (input.buffer.byteLength === 0) throw new Error('That file came back empty.');
  if (input.buffer.byteLength > MAX_BYTES) throw new Error('That file is too large to save (150 MB limit).');

  ensureContentDir();
  const id = `lib-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const extension = extensionFor(input.mime, input.displayName, input.title);
  const fileName = /\.([a-z0-9]{2,5})$/i.test(input.displayName)
    ? safeName(input.displayName)
    : safeName(`${input.displayName}.${extension}`);

  const folder = path.join(CONTENT_DIR, id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, fileName), input.buffer);

  const file: LibraryFile = {
    id,
    courseId: input.courseId,
    courseCode: input.courseCode,
    courseName: input.courseName,
    title: input.title,
    fileName,
    mime: mimeFor(extension, input.mime),
    size: input.buffer.byteLength,
    source: input.source,
    sourceUrl: input.sourceUrl,
    folder: input.folder,
    ...(input.folderPinned && input.folder ? { folderPinned: true } : {}),
    downloadedAt: new Date().toISOString(),
  };

  // Downloading the same handout again replaces the old copy instead of piling
  // up; the same goes for re-uploading a file under the same name.
  updateConfig((config) => {
    const replaced = config.contentFiles.filter((entry) => {
      if (input.source === 'local') {
        return (
          entry.source === 'local' &&
          entry.courseId === input.courseId &&
          entry.fileName.toLowerCase() === fileName.toLowerCase()
        );
      }
      return Boolean(input.sourceUrl) && entry.source === input.source && entry.sourceUrl === input.sourceUrl;
    });
    for (const old of replaced) discardStored(old);
    const kept = config.contentFiles.filter(
      (entry) => !replaced.some((old) => old.id === entry.id),
    );
    return { ...config, contentFiles: [file, ...kept] };
  });

  return file;
}

/** A valid one-page PDF with the topic name, used by preview mode. */
export function samplePdf(title: string, subtitle: string): Buffer {
  const lines = [
    title.replace(/[^\x20-\x7e]/g, '-'),
    '',
    subtitle.replace(/[^\x20-\x7e]/g, '-'),
    '',
    'Preview mode: this file was generated locally because no D2L session is connected.',
  ];
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = lines
    .map((line, index) => {
      const size = index === 0 ? 22 : 12;
      return `BT /F1 ${size} Tf 56 ${780 - index * 30} Td (${escape(line)}) Tj ET`;
    })
    .join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

function d2lHeaders(config: ReturnType<typeof readConfig>): Record<string, string> {
  return {
    cookie: cookieHeader(config.cookies),
    'user-agent': USER_AGENT,
    'accept-language': 'en-CA,en;q=0.9',
  };
}

function allowedD2lUrl(input: string, baseUrl: string): URL {
  let url: URL;
  let base: URL;
  try {
    url = new URL(input);
    base = new URL(baseUrl);
  } catch {
    throw new Error('That topic link is not valid.');
  }
  if (!/^https?:$/.test(url.protocol) || url.origin !== base.origin) {
    throw new Error('That link does not point at your D2L site.');
  }
  if (!/\/d2l\//i.test(url.pathname)) {
    throw new Error('That link is not a D2L content page.');
  }
  return url;
}

/**
 * A topic viewer (`/viewContent/<topic>/View`) is a JavaScript shell with no
 * file link in its HTML, so scrape attempts only ever find the page itself.
 * This is the route D2L's own Download button uses for the same topic.
 */
export function directTopicDownloadUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const match = /\/d2l\/le\/content\/(\d+)\/viewContent\/(\d+)(?:\/|$)/i.exec(url.pathname);
  if (!match) return null;
  return `${url.origin}/d2l/le/content/${match[1]}/topics/files/download/${match[2]}/DirectFileTopicDownload`;
}

/** D2L often wraps a file in an HTML viewer; find the real file behind it. */
function findFileLink(html: string, baseUrl: string): string | null {
  const $ = load(html);
  const candidates: string[] = [];
  $('iframe[src], embed[src], object[data]').each((_index, element) => {
    const node = $(element);
    candidates.push(node.attr('src') ?? node.attr('data') ?? '');
  });
  $('a[href]').each((_index, element) => {
    const href = $(element).attr('href') ?? '';
    if (!href || href.startsWith('#')) return;
    candidates.push(href);
  });

  const fileish = /\.(pdf|docx?|pptx?|xlsx?|zip|txt|csv|rtf|png|jpe?g|gif|mp4|mp3)(?:$|[?#])/i;
  const downloadish = /\/(content\/enforced|topics\/files|download)\//i;

  for (const raw of candidates) {
    let url: URL;
    try {
      url = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    if (!fileish.test(url.pathname) && !downloadish.test(url.pathname)) continue;
    return url.href;
  }
  return null;
}

async function fetchFile(
  url: string,
  config: ReturnType<typeof readConfig>,
): Promise<{ buffer: Buffer; mime: string; url: string; name: string | null }> {
  const cookie = cookieHeader(config.cookies);
  let response = await fetch(url, {
    headers: {
      ...(cookie ? { cookie } : {}),
      'user-agent': USER_AGENT,
      accept: '*/*',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`D2L returned ${response.status} for that file.`);

  let mime = response.headers.get('content-type') ?? '';
  let name = dispositionName(response.headers.get('content-disposition'));

  if (/text\/html/i.test(mime)) {
    const html = await response.text();
    const next = findFileLink(html, response.url);
    if (!next) throw new Error('This item is a web page, not a file D2L Hub can download.');
    response = await fetch(next, {
      headers: {
        ...(cookie ? { cookie } : {}),
        'user-agent': USER_AGENT,
        accept: '*/*',
        referer: response.url,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`D2L returned ${response.status} for that file.`);
    mime = response.headers.get('content-type') ?? '';
    name = dispositionName(response.headers.get('content-disposition')) ?? name;
    if (/text\/html/i.test(mime)) {
      throw new Error('This item is a web page, not a file D2L Hub can download.');
    }
  }

  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) throw new Error('That file is too large to save (150 MB limit).');

  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mime, url: response.url, name };
}

/** Read a D2L topic without saving it, for an outline scan or study plan. */
export async function fetchTopicBuffer(input: { url?: unknown }): Promise<{
  buffer: Buffer;
  mime: string;
  name: string | null;
}> {
  const rawUrl = text(input.url, 2000);
  if (DEMO_MODE) {
    return { buffer: samplePdf('Course file', 'Preview mode'), mime: 'application/pdf', name: 'preview.pdf' };
  }
  const config = readConfig();
  if (!hasSessionCookie(config.cookies)) {
    throw new Error('Connect your D2L account before reading course files.');
  }
  const url = allowedD2lUrl(rawUrl, config.baseUrl);
  const direct = directTopicDownloadUrl(url.href);
  const fetched = direct
    ? await fetchFile(direct, config).catch(() => fetchFile(url.href, config))
    : await fetchFile(url.href, config);
  return { buffer: fetched.buffer, mime: fetched.mime, name: fetched.name };
}

/** Bytes of a Content Space file, read from this computer. */
export function readLibraryBuffer(id: unknown): { file: LibraryFile; buffer: Buffer } | null {
  const found = libraryFilePath(id);
  if (!found) return null;
  try {
    if (fs.statSync(found.filePath).size > MAX_BYTES) return null;
    return { file: found.file, buffer: fs.readFileSync(found.filePath) };
  } catch {
    return null;
  }
}

/** Download one D2L content topic into the local library. */
export async function downloadTopic(input: TopicDownloadInput): Promise<LibraryFile> {
  const config = readConfig();
  const courseId = text(input.courseId, 40);
  const courseCode = text(input.courseCode, 40) || null;
  const courseName = text(input.courseName, 160) || courseCode || 'D2L course';
  const title = text(input.title, 160) || 'Untitled file';
  const folder = text(input.folder, 160) || null;
  const rawUrl = text(input.url, 2000);

  if (!/^\d+$/.test(courseId)) throw new Error('That course could not be found.');

  // Preview mode has no session, so it produces a local sample PDF instead.
  if (DEMO_MODE) {
    return storeFile({
      courseId,
      courseCode,
      courseName,
      title,
      folder,
      source: 'd2l',
      sourceUrl: rawUrl || null,
      displayName: title,
      mime: 'application/pdf',
      buffer: samplePdf(title, `${courseName}${folder ? ` · ${folder}` : ''}`),
    });
  }

  if (!hasSessionCookie(config.cookies)) {
    throw new Error('Connect your D2L account before downloading course files.');
  }
  const url = allowedD2lUrl(rawUrl, config.baseUrl);

  // Topic viewer pages render the file with JavaScript, so try D2L's download
  // route for the topic first and keep the viewer scrape as a fallback.
  const direct = directTopicDownloadUrl(url.href);
  const fetched = direct
    ? await fetchFile(direct, config).catch(() => fetchFile(url.href, config))
    : await fetchFile(url.href, config);

  return storeFile({
    courseId,
    courseCode,
    courseName,
    title,
    folder,
    source: 'd2l',
    sourceUrl: url.href,
    displayName: fetched.name ?? title,
    mime: fetched.mime,
    buffer: fetched.buffer,
  });
}

export interface UploadInput {
  courseId?: unknown;
  courseCode?: unknown;
  courseName?: unknown;
  title?: unknown;
  folder?: unknown;
  fileName?: unknown;
  mime?: unknown;
  buffer: Buffer;
}

/** Save a file the user picked from their own computer into a course shelf. */
export function uploadLibraryFile(input: UploadInput): LibraryFile {
  const courseId = text(input.courseId, 80);
  if (!/^[A-Za-z0-9:_-]{1,80}$/.test(courseId)) {
    throw new Error('Choose which course that file belongs to.');
  }

  const original = safeName(text(input.fileName, 160) || 'file');
  const declared = text(input.mime, 120);
  const mime = /^[\w.+-]+\/[\w.+-]+$/.test(declared) ? declared : '';
  const title = text(input.title, 160) || original.replace(/\.[a-z0-9]{2,5}$/i, '');

  return storeFile({
    courseId,
    courseCode: text(input.courseCode, 40) || null,
    courseName: text(input.courseName, 160) || 'My course',
    title: title || 'Untitled file',
    folder: text(input.folder, 160) || null,
    folderPinned: true,
    source: 'local',
    sourceUrl: null,
    displayName: original,
    mime,
    buffer: input.buffer,
  });
}

interface DriveDownloadInput {
  fileId?: unknown;
  name?: unknown;
  folder?: unknown;
  /** Which exam bank the file came from, so each bank keeps its own shelf. */
  bankId?: unknown;
  bankName?: unknown;
}

/** Public exam-bank files come straight from Google; large ones get a confirm token. */
export async function downloadDriveFile(input: DriveDownloadInput): Promise<LibraryFile> {
  const fileId = text(input.fileId, 100);
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(fileId)) {
    throw new Error('That exam-bank file could not be found.');
  }
  const name = text(input.name, 160) || 'Exam bank file';
  const folder = text(input.folder, 200) || null;

  const fetchDrive = async (url: string) => {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Google Drive returned ${response.status}.`);
    return response;
  };

  let response = await fetchDrive(
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
  );
  let mime = response.headers.get('content-type') ?? '';
  let display = dispositionName(response.headers.get('content-disposition'));

  if (/text\/html/i.test(mime)) {
    const html = await response.text();
    const $ = load(html);
    const form = $('form#download-form').first();
    const action = form.attr('action') || 'https://drive.usercontent.google.com/download';
    const params = new URLSearchParams();
    form.find('input[name]').each((_index, element) => {
      const field = $(element);
      const fieldName = field.attr('name');
      if (fieldName) params.set(fieldName, field.attr('value') ?? '');
    });
    if (params.get('id')) {
      response = await fetchDrive(`${action}?${params.toString()}`);
      mime = response.headers.get('content-type') ?? '';
      display = dispositionName(response.headers.get('content-disposition')) ?? display;
    }
    if (/text\/html/i.test(mime)) {
      throw new Error('Google did not return that file. It may be a folder or a Google Doc.');
    }
  }

  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) throw new Error('That file is too large to save (150 MB limit).');
  const buffer = Buffer.from(await response.arrayBuffer());

  const bankId = text(input.bankId, 60) || 'exam-bank';
  const builtin = bankId === 'exam-bank' || bankId === 'mues';

  return storeFile({
    courseId: builtin ? 'exam-bank' : `exam-bank-${bankId.replace(/[^a-z0-9]/gi, '')}`,
    courseCode: builtin ? 'MUES' : 'EXAM',
    courseName: text(input.bankName, 120) || 'MUES Exam Bank',
    title: name.replace(/\.[a-z0-9]{2,5}$/i, ''),
    folder,
    source: 'drive',
    sourceUrl: `https://drive.google.com/file/d/${fileId}/view`,
    displayName: display ?? name,
    mime,
    buffer,
  });
}
