import { describe, expect, it } from 'vitest';
import { sanitizePdfInk } from '../server/annotations';

const stroke = {
  id: 'ink-abc123',
  page: 2,
  tool: 'pen',
  color: '#EF4444',
  width: 2.4,
  opacity: 1,
  points: [
    { x: 10, y: 20, pressure: 0.4 },
    { x: 11.234, y: 21.987, pressure: 0.9 },
  ],
};

describe('sanitizePdfInk', () => {
  it('keeps a well-formed stroke and normalises its values', () => {
    const result = sanitizePdfInk({ version: 1, strokes: [stroke] });
    expect(result.strokes).toHaveLength(1);
    expect(result.strokes[0]).toMatchObject({
      id: 'ink-abc123',
      page: 2,
      tool: 'pen',
      color: '#ef4444',
      width: 2.4,
      opacity: 1,
    });
    expect(result.strokes[0].points[1]).toEqual({ x: 11.23, y: 21.99, pressure: 0.9 });
  });

  it('clamps width, opacity and pressure instead of rejecting the stroke', () => {
    const result = sanitizePdfInk({
      strokes: [
        {
          ...stroke,
          width: 900,
          opacity: -4,
          points: [
            { x: 0, y: 0, pressure: 4 },
            { x: 5, y: 5, pressure: -1 },
          ],
        },
      ],
    });
    expect(result.strokes[0].width).toBe(80);
    expect(result.strokes[0].opacity).toBe(0.05);
    expect(result.strokes[0].points[0].pressure).toBe(1);
    expect(result.strokes[0].points[1].pressure).toBe(0);
  });

  it('drops strokes with unknown tools, bad colours, pages or too few points', () => {
    const result = sanitizePdfInk({
      strokes: [
        { ...stroke, tool: 'brush' },
        { ...stroke, color: 'red' },
        { ...stroke, page: 0 },
        { ...stroke, points: [{ x: 1, y: 1, pressure: 0.5 }] },
        { ...stroke, points: [{ x: 'a', y: 2, pressure: 0.5 }, { x: 3, y: 4, pressure: 0.5 }] },
      ],
    });
    // The last stroke keeps only its one valid point, so it is dropped too.
    expect(result.strokes).toHaveLength(0);
  });

  it('replaces unusable ids and survives malformed payloads', () => {
    const result = sanitizePdfInk({ strokes: [{ ...stroke, id: '../bad path' }] });
    expect(result.strokes[0].id).toMatch(/^srv-/);
    expect(sanitizePdfInk(null)).toEqual({ version: 1, strokes: [] });
    expect(sanitizePdfInk({ strokes: 'nope' })).toEqual({ version: 1, strokes: [] });
  });
});
