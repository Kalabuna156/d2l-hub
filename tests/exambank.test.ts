import { describe, expect, it } from 'vitest';
import { MUES_BANK, MUES_FOLDER_ID, examBankLinks, parseDriveFolderId } from '../shared/exambank';

describe('parseDriveFolderId', () => {
  it('accepts every shape of a Drive folder link', () => {
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${MUES_FOLDER_ID}`)).toBe(MUES_FOLDER_ID);
    expect(
      parseDriveFolderId(`https://drive.google.com/drive/u/1/folders/${MUES_FOLDER_ID}?usp=sharing`),
    ).toBe(MUES_FOLDER_ID);
    expect(parseDriveFolderId(`drive.google.com/drive/folders/${MUES_FOLDER_ID}`)).toBe(MUES_FOLDER_ID);
    expect(parseDriveFolderId(`https://drive.google.com/open?id=${MUES_FOLDER_ID}`)).toBe(MUES_FOLDER_ID);
  });

  it('accepts a bare folder id', () => {
    expect(parseDriveFolderId(`  ${MUES_FOLDER_ID}  `)).toBe(MUES_FOLDER_ID);
  });

  it('rejects links that are not Drive folders', () => {
    expect(parseDriveFolderId('')).toBeNull();
    expect(parseDriveFolderId('https://example.com/folders/abc')).toBeNull();
    expect(parseDriveFolderId('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view')).toBeNull();
    expect(parseDriveFolderId('https://drive.google.com/drive/my-drive')).toBeNull();
    expect(parseDriveFolderId('not a link')).toBeNull();
  });
});

describe('examBankLinks', () => {
  it('always starts with the MUES archive', () => {
    expect(examBankLinks([])).toEqual([MUES_BANK]);
  });

  it('adds custom folders with their own folder ids', () => {
    const links = examBankLinks([
      { id: 'bank-1', name: 'ECE past papers', url: `https://drive.google.com/drive/folders/${MUES_FOLDER_ID}x` },
      { id: 'bank-2', name: '', url: '1AbCdEfGhIjKlMnOpQrStUvWxYz' },
      { id: 'bank-3', name: 'Broken', url: 'https://example.com/not-a-folder' },
    ]);

    expect(links.map((link) => link.name)).toEqual(['MUES Exam Bank', 'ECE past papers', 'Exam bank']);
    expect(links[1].folderId).toBe(`${MUES_FOLDER_ID}x`);
    expect(links[2].folderId).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz');
    expect(links.every((link) => link.id === 'mues' || link.builtin === false)).toBe(true);
  });

  it('never lists the same folder twice', () => {
    const links = examBankLinks([
      { id: 'bank-1', name: 'Mine', url: MUES_FOLDER_ID },
      { id: 'bank-2', name: 'Same again', url: `https://drive.google.com/drive/folders/${MUES_FOLDER_ID}` },
    ]);

    expect(links).toHaveLength(1);
  });
});
