import { describe, expect, it } from 'vitest';
import { parsePageImage } from '../server/page-ai';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const webp = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([4, 0, 0, 0]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.from([1, 2, 3, 4]),
]);

describe('parsePageImage', () => {
  it('keeps the full media type providers require', () => {
    expect(parsePageImage(`data:image/png;base64,${png.toString('base64')}`)).toEqual({
      mimeType: 'image/png',
      data: png.toString('base64'),
    });
    expect(parsePageImage(`data:image/jpg;base64,${jpeg.toString('base64')}`).mimeType).toBe(
      'image/jpeg',
    );
    expect(parsePageImage(`data:image/webp;base64,${webp.toString('base64')}`).mimeType).toBe(
      'image/webp',
    );
  });

  it('rejects payloads whose bytes do not match the declared type', () => {
    expect(() => parsePageImage(`data:image/png;base64,${jpeg.toString('base64')}`)).toThrow(
      /did not match its file type/i,
    );
  });

  it('rejects anything that is not a screenshot data URL', () => {
    expect(() => parsePageImage('/tmp/page.png')).toThrow(/missing/i);
    expect(() => parsePageImage('data:image/svg+xml;base64,PHN2Zz4=')).toThrow(/PNG, JPEG or WebP/i);
    expect(() => parsePageImage(42)).toThrow(/missing/i);
  });
});
