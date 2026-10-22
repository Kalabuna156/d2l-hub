import { describe, expect, it } from 'vitest';
import { dragRange } from '../src/lib/schedule';

describe('dragRange', () => {
  it('covers the same span whether the pointer goes down or up', () => {
    expect(dragRange(600, 690, 1440)).toEqual({ startMin: 600, endMin: 690 });
    expect(dragRange(690, 600, 1440)).toEqual({ startMin: 600, endMin: 690 });
  });

  it('keeps a half hour for a tiny drag', () => {
    expect(dragRange(600, 605, 1440)).toEqual({ startMin: 600, endMin: 630 });
  });

  it('stops at the end of the grid', () => {
    expect(dragRange(1380, 1500, 1440)).toEqual({ startMin: 1380, endMin: 1440 });
    expect(dragRange(1430, 1445, 1440)).toEqual({ startMin: 1410, endMin: 1440 });
  });
});
