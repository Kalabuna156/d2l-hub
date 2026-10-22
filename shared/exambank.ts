import type { ExamBankLink, ExamBankSource } from './types';

/** The public MUES exam bank folder. No Google account is needed to read it. */
export const MUES_FOLDER_ID = '1hF1JzgFmI4vS9mgDZilNSuVwN52VuZl3';

export const MUES_BANK: ExamBankLink = {
  id: 'mues',
  name: 'MUES Exam Bank',
  folderId: MUES_FOLDER_ID,
  builtin: true,
  url: `https://drive.google.com/drive/folders/${MUES_FOLDER_ID}`,
};

const FOLDER_ID = /^[A-Za-z0-9_-]{10,100}$/;

/**
 * Everything people paste is a variation on the same folder link:
 * `drive.google.com/drive/folders/<id>`, `/drive/u/1/folders/<id>?usp=sharing`,
 * `open?id=<id>`, or just the bare id. Anything else is not a Drive folder.
 */
export function parseDriveFolderId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (FOLDER_ID.test(value)) return value;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!/(^|\.)(drive|docs)\.google\.com$/i.test(url.hostname)) return null;

  const fromPath = /\/folders\/([A-Za-z0-9_-]{10,100})/.exec(url.pathname);
  if (fromPath) return fromPath[1];

  const fromQuery = url.searchParams.get('id');
  if (fromQuery && FOLDER_ID.test(fromQuery)) return fromQuery;
  return null;
}

/** The built-in archive first, then every custom folder that still resolves. */
export function examBankLinks(sources: ExamBankSource[]): ExamBankLink[] {
  const links: ExamBankLink[] = [{ ...MUES_BANK }];
  const seen = new Set([MUES_BANK.folderId]);

  for (const source of sources) {
    const folderId = parseDriveFolderId(source.url);
    if (!folderId || seen.has(folderId)) continue;
    seen.add(folderId);
    links.push({
      id: source.id,
      name: source.name || 'Exam bank',
      folderId,
      builtin: false,
      url: `https://drive.google.com/drive/folders/${folderId}`,
    });
  }

  return links;
}
