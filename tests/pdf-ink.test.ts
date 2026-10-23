import { describe, expect, it } from 'vitest';
import type { PdfInkStroke } from '../shared/types';
import { brushWidthInPdf, eraseStrokesAt, screenToPdf, toScreen } from '../src/lib/pdf-ink';

const viewport = {
  scale: 2,
  convertToViewportPoint: (x: number, y: number) => [x * 2, y * 2],
  convertToPdfPoint: (x: number, y: number) => [x / 2, y / 2],
};

function ink(overrides: Partial<PdfInkStroke> = {}): PdfInkStroke {
  return {
    id: 'stroke-1',
    page: 1,
    tool: 'pen',
    color: '#ef4444',
    width: 2,
    opacity: 1,
    points: [
      { x: 10, y: 10, pressure: 0.5 },
      { x: 30, y: 10, pressure: 0.5 },
    ],
    ...overrides,
  };
}

describe('pdf ink coordinates', () => {
  it('converts both ways and scales the brush with zoom', () => {
    expect(toScreen(viewport, { x: 5, y: 7, pressure: 0.5 })).toEqual({ x: 10, y: 14 });
    expect(screenToPdf(viewport, 10, 14)).toEqual({ x: 5, y: 7 });
    expect(brushWidthInPdf(viewport, 4)).toBe(2);
    expect(brushWidthInPdf({ scale: 0.1 }, 1)).toBe(10);
  });
});

describe('eraseStrokesAt', () => {
  it('hits a stroke under the eraser circle', () => {
    expect(eraseStrokesAt([ink()], 1, { x: 20, y: 10.5 }, 1)).toEqual(['stroke-1']);
  });

  it('accounts for the stroke width and ignores other pages', () => {
    expect(eraseStrokesAt([ink()], 1, { x: 20, y: 12 }, 0.5)).toEqual([]);
    expect(eraseStrokesAt([ink()], 2, { x: 20, y: 10 }, 2)).toEqual([]);
  });

  it('hits a lone point and misses far away', () => {
    const dot = ink({ points: [{ x: 4, y: 4, pressure: 0.5 }] });
    expect(eraseStrokesAt([dot], 1, { x: 4.5, y: 4.5 }, 1)).toEqual(['stroke-1']);
    expect(eraseStrokesAt([dot], 1, { x: 20, y: 20 }, 1)).toEqual([]);
  });
});
