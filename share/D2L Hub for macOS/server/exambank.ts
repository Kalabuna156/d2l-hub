import { load } from 'cheerio';
import { MUES_FOLDER_ID, examBankLinks, parseDriveFolderId } from '../shared/exambank';
import type { DriveEntry, ExamBankFolder, ExamBankLink } from '../shared/types';
import { MAX_EXAM_BANKS, readConfig, updateConfig } from './config';

/** The public MUES exam bank folder. No Google account is needed to read it. */
export const EXAM_BANK_ROOT = MUES_FOLDER_ID;

const CACHE_MS = 5 * 60 * 1000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

const cache = new Map<string, { at: number; folder: ExamBankFolder }>();

/**
 * Google publishes a server-rendered folder listing for embedding. It is the
 * one Drive view that works without an account, so it is read here and drawn
 * with the app's own UI instead of an iframe.
 */
export async function loadExamBank(folderId?: unknown): Promise<ExamBankFolder> {
  const id =
    typeof folderId === 'string' && /^[A-Za-z0-9_-]{10,100}$/.test(folderId)
      ? folderId
      : EXAM_BANK_ROOT;

  const cached = cache.get(id);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.folder;

  let response: Response;
  try {
    response = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}#list`, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error('Could not reach Google Drive. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? 'That exam-bank folder is no longer shared.'
        : `Google Drive returned ${response.status}.`,
    );
  }

  const html = await response.text();
  const $ = load(html);
  const name = $('title').first().text().trim() || null;
  const entries: DriveEntry[] = [];

  $('.flip-entry').each((_index, element) => {
    const node = $(element);
    const entryId = (node.attr('id') ?? '').replace(/^entry-/, '');
    const title = node.find('.flip-entry-title').first().text().replace(/\s+/g, ' ').trim();
    if (!entryId || !title) return;

    const href = node.find('a[href]').first().attr('href') ?? '';
    const kind = /\/drive\/folders\//.test(href) ? 'folder' : 'file';
    const label =
      node.find('.flip-entry-icon div[aria-label]').first().attr('aria-label')?.trim() ||
      (kind === 'folder' ? 'Folder' : 'File');

    entries.push({
      id: entryId,
      name: title,
      kind,
      type: label,
      modifiedAt: node.find('.flip-entry-last-modified').text().trim() || null,
      size: null,
    });
  });

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  const folder: ExamBankFolder = {
    id,
    name,
    entries,
    fetchedAt: new Date().toISOString(),
  };
  cache.set(id, { at: Date.now(), folder });
  return folder;
}

/** Built-in MUES first, then every folder the user added in Settings. */
export function listExamBanks(): ExamBankLink[] {
  return examBankLinks(readConfig().examBankSources);
}

function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
}

/**
 * Save one custom Drive folder. The folder's own Drive title is used when no
 * name is given, and re-adding the same folder just renames it.
 */
export async function addExamBankSource(input: {
  name?: unknown;
  url?: unknown;
}): Promise<ExamBankLink[]> {
  const raw = typeof input.url === 'string' ? input.url : '';
  if (!raw.trim()) throw new Error('Paste the Google Drive folder link first.');

  const folderId = parseDriveFolderId(raw);
  if (!folderId) {
    throw new Error('That is not a Google Drive folder link. Copy it from the folder’s address bar.');
  }
  if (folderId === MUES_FOLDER_ID) {
    throw new Error('That is the MUES exam bank, which is already built in.');
  }

  const config = readConfig();
  const existing = config.examBankSources.find(
    (source) => parseDriveFolderId(source.url) === folderId,
  );
  if (!existing && config.examBankSources.length >= MAX_EXAM_BANKS) {
    throw new Error(`You can add up to ${MAX_EXAM_BANKS} exam banks.`);
  }

  let name = cleanName(input.name);
  if (!name) {
    name = await loadExamBank(folderId)
      .then((folder) => cleanName(folder.name))
      .catch(() => '');
  }
  if (!name) name = 'Exam bank';

  const id = existing?.id ?? `bank-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  updateConfig((current) => {
    const others = current.examBankSources.filter((source) => source.id !== id);
    return { ...current, examBankSources: [...others, { id, name, url: raw.trim().slice(0, 500) }] };
  });

  return listExamBanks();
}

export function removeExamBankSource(id: unknown): ExamBankLink[] {
  const key = typeof id === 'string' ? id : '';
  updateConfig((current) => ({
    ...current,
    examBankSources: current.examBankSources.filter((source) => source.id !== key),
  }));
  return listExamBanks();
}
