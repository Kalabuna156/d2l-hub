import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DATA_DIR } from './config';
import { libraryFilePath } from './library';

/**
 * OCR uses the PdfCraft engine already installed on this computer. Text is
 * saved in a small sidecar so scanned pages stay searchable next time; the PDF
 * itself is never rewritten.
 */
const OCR_DIR = path.join(DATA_DIR, 'ocr');
const MAX_TEXT = 200_000;
const MAX_PAGES = 5000;
const CLI_TIMEOUT_MS = 180_000;

export interface OcrPageResult {
  page: number;
  text: string;
  words: number;
  /** Set when PdfCraft left the page alone, e.g. it already has a text layer. */
  skipped: string | null;
}

export class OcrUnavailableError extends Error {}

let cachedCli: string | null | undefined;

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function isDir(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * PdfCraft ships a standalone CLI. Look where its installers put it, then in
 * the app's own resources (if a copy was bundled), then on PATH.
 */
export function findPdfCraftCli(): string | null {
  if (cachedCli && isFile(cachedCli)) return cachedCli;
  cachedCli = undefined;
  const exe = process.platform === 'win32' ? 'pdfcraft-cli.exe' : 'pdfcraft-cli';
  const candidates: Array<string | null | undefined> = [
    process.env.PDFCRAFT_CLI,
    process.env.D2L_HUB_PDFCRAFT_CLI,
  ];

  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    candidates.push(
      path.join(programFiles, 'PdfCraft', exe),
      path.join(programFilesX86, 'PdfCraft', exe),
      process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'Programs', 'PdfCraft', exe)
        : null,
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/PdfCraft.app/Contents/MacOS/pdfcraft-cli',
      '/Applications/PdfCraft.app/Contents/MacOS/pdfcraft',
      '/Applications/PdfCraft.app/Contents/Resources/pdfcraft-cli',
    );
  } else {
    candidates.push('/usr/bin/pdfcraft-cli', '/usr/local/bin/pdfcraft-cli', '/opt/pdfcraft/pdfcraft-cli');
  }

  const execDir = path.dirname(process.execPath);
  candidates.push(
    path.join(execDir, 'resources', 'pdfcraft', exe),
    path.join(execDir, '..', 'Resources', 'pdfcraft', exe),
    path.join(process.cwd(), 'resources', 'pdfcraft', exe),
  );

  const pathDirs = (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.replace(/^"|"$/g, '').trim())
    .filter(Boolean);
  for (const dir of pathDirs) {
    candidates.push(path.join(dir, exe));
    if (process.platform !== 'win32') candidates.push(path.join(dir, 'pdfcraft-cli.exe'));
  }

  for (const candidate of candidates) {
    if (candidate && isFile(candidate)) {
      cachedCli = candidate;
      return candidate;
    }
  }
  return null;
}

function modelsFor(cli: string): string | null {
  const candidates = [
    path.join(path.dirname(cli), 'models'),
    path.join(path.dirname(path.dirname(cli)), 'Resources', 'models'),
    path.join(path.dirname(process.execPath), 'resources', 'pdfcraft', 'models'),
  ];
  return (
    candidates.find(
      (dir) =>
        isDir(dir) &&
        fs.existsSync(path.join(dir, 'text-recognition.rten')) &&
        fs.existsSync(path.join(dir, 'text-detection.rten')),
    ) ?? null
  );
}

function runCli(cli: string, args: string[]): Promise<string> {
  const models = modelsFor(cli);
  return new Promise((resolve, reject) => {
    execFile(
      cli,
      args,
      {
        timeout: CLI_TIMEOUT_MS,
        maxBuffer: 24 * 1024 * 1024,
        windowsHide: true,
        env: {
          ...process.env,
          ...(models && !process.env.PDFCRAFT_MODELS ? { PDFCRAFT_MODELS: models } : null),
        },
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }
        if (error.killed) {
          reject(new Error('OCR took too long. Try one page at a time.'));
          return;
        }
        const detail = `${stderr || ''}\n${stdout || ''}`
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(-3)
          .join(' ');
        reject(new Error(detail || error.message || 'PdfCraft OCR failed.'));
      },
    );
  });
}

/** The CLI prints one pretty JSON object per script step; pull them apart. */
function jsonObjects(output: string): unknown[] {
  const found: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < output.length; index += 1) {
    const char = output[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          found.push(JSON.parse(output.slice(start, index + 1)) as unknown);
        } catch {
          /* a log line that looked like JSON */
        }
        start = -1;
      }
    }
  }
  return found;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim().slice(0, MAX_TEXT);
}

function isPdf(name: string, mime: string): boolean {
  return /^application\/pdf\b/i.test(mime) || /\.pdf$/i.test(name);
}

function textPath(id: unknown): string | null {
  const found = libraryFilePath(id);
  if (!found || !isPdf(found.file.fileName, found.file.mime)) return null;
  return path.join(OCR_DIR, `${found.file.id}.json`);
}

export function readOcrText(id: unknown): Record<string, string> {
  const file = textPath(id);
  if (!file) throw new Error('That PDF is no longer in Content Space.');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!isRecord(raw) || !isRecord(raw.pages)) return {};
    const pages: Record<string, string> = {};
    for (const [page, value] of Object.entries(raw.pages).slice(0, MAX_PAGES)) {
      const number = Number(page);
      if (!Number.isInteger(number) || number < 1 || number > 20_000) continue;
      const text = cleanText(value);
      if (text) pages[String(number)] = text;
    }
    return pages;
  } catch {
    return {};
  }
}

/**
 * Add AI-read handwriting to a page's searchable text without throwing away
 * printed OCR text that was already saved for the same page.
 */
export function appendOcrText(id: unknown, page: number, text: string): string {
  const pageNumber = Math.round(Number(page));
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 20_000) {
    throw new Error('Choose a valid page to save.');
  }
  const handwriting = cleanText(text);
  const existing = readOcrText(id)[String(pageNumber)] ?? '';
  if (!handwriting) return existing;
  const combined =
    existing && !existing.includes(handwriting)
      ? `${existing}\n\nHandwriting:\n${handwriting}`.slice(0, MAX_TEXT)
      : existing || handwriting;
  writeOcrText(id, pageNumber, combined);
  return combined;
}

function writeOcrText(id: unknown, page: number, text: string): void {
  const file = textPath(id);
  if (!file) return;
  const pages = { ...readOcrText(id), [String(page)]: text.slice(0, MAX_TEXT) };
  const body = JSON.stringify({ version: 1, pages });
  if (body.length > 12 * 1024 * 1024) return;
  fs.mkdirSync(OCR_DIR, { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, body, { mode: 0o600 });
  fs.renameSync(temp, file);
}

/**
 * Recognize one page with PdfCraft's engine. Changes stay in memory and are
 * discarded, so only the sidecar text is kept.
 */
export async function recognizePdfPage(id: unknown, rawPage: unknown): Promise<OcrPageResult> {
  const page = Math.round(Number(rawPage));
  if (!Number.isInteger(page) || page < 1 || page > 20_000) {
    throw new Error('Choose a valid page to scan.');
  }
  const found = libraryFilePath(id);
  if (!found || !isPdf(found.file.fileName, found.file.mime)) {
    throw new Error('That PDF is no longer in Content Space.');
  }
  const cli = findPdfCraftCli();
  if (!cli) {
    throw new OcrUnavailableError(
      'PdfCraft was not found. Install it, or set PDFCRAFT_CLI to its pdfcraft-cli path, to use OCR.',
    );
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2l-hub-ocr-'));
  const scriptPath = path.join(tempDir, 'ocr.json');
  try {
    fs.writeFileSync(
      scriptPath,
      JSON.stringify(
        [
          { tool: 'doc_open', args: { path: found.filePath } },
          {
            tool: 'ocr_recognize',
            args: { doc: 1, pages: [page], language: 'en', dpi: 300 },
          },
          { tool: 'doc_close', args: { doc: 1, discard_changes: true } },
        ],
        null,
        2,
      ),
    );
    const output = await runCli(cli, ['run', '--script', scriptPath]);
    const steps = jsonObjects(output);
    const result = steps.find((step) => isRecord(step) && Array.isArray(step.pages) && 'words' in step);
    if (!isRecord(result) || !Array.isArray(result.pages)) {
      throw new Error('PdfCraft did not return any text for this page.');
    }
    const pageResult =
      result.pages.find((entry) => isRecord(entry) && entry.page === page) ??
      result.pages.find(isRecord);
    if (!isRecord(pageResult)) {
      throw new Error('PdfCraft did not return any text for this page.');
    }
    const text = cleanText(pageResult.text);
    const skipped =
      typeof pageResult.skipped === 'string' && pageResult.skipped.trim()
        ? pageResult.skipped.trim()
        : null;
    const words =
      typeof result.words === 'number' && Number.isFinite(result.words)
        ? Math.max(0, Math.round(result.words))
        : text
          ? text.split(/\s+/).filter(Boolean).length
          : 0;
    if (text) {
      try {
        writeOcrText(found.file.id, page, text);
      } catch {
        // The text is still useful in this session even if the sidecar cannot be written.
      }
    }
    return { page, text, words, skipped };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
