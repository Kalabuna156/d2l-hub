import { describe, expect, it } from 'vitest';
import { splitDisplayMath, splitInlineMath } from '../src/lib/math-text';

describe('splitDisplayMath', () => {
  it('lifts a standalone $$ equation out of the answer', () => {
    const parts = splitDisplayMath('So:\n$$\nc^2 - 2c - 3 = 0\n$$\nTherefore c = 3.');
    expect(parts).toEqual([
      { type: 'text', value: 'So:\n' },
      { type: 'math', value: 'c^2 - 2c - 3 = 0', display: true },
      { type: 'text', value: '\nTherefore c = 3.' },
    ]);
  });

  it('accepts the \\[ … \\] spelling and leaves inline math alone', () => {
    const parts = splitDisplayMath('The limit \\[ \\lim_{x \\to 0} \\frac{f(x)}{x} \\] holds for $x > 0$.');
    expect(parts[1]).toEqual({ type: 'math', value: '\\lim_{x \\to 0} \\frac{f(x)}{x}', display: true });
    expect(parts[2]).toEqual({ type: 'text', value: ' holds for $x > 0$.' });
  });

  it('returns the text untouched when there is no display math', () => {
    expect(splitDisplayMath('Everything is continuous.')).toEqual([
      { type: 'text', value: 'Everything is continuous.' },
    ]);
  });
});

describe('splitInlineMath', () => {
  it('keeps the prose around each formula', () => {
    const parts = splitInlineMath('Only $c = 3$ is correct, not $c = -1$.');
    expect(parts).toEqual([
      { type: 'text', value: 'Only ' },
      { type: 'math', value: 'c = 3', display: false },
      { type: 'text', value: ' is correct, not ' },
      { type: 'math', value: 'c = -1', display: false },
      { type: 'text', value: '.' },
    ]);
  });

  it('reads \\( … \\) as inline math', () => {
    expect(splitInlineMath('where \\(x \\ne 1\\) applies')).toEqual([
      { type: 'text', value: 'where ' },
      { type: 'math', value: 'x \\ne 1', display: false },
      { type: 'text', value: ' applies' },
    ]);
  });

  it('does not treat prices or a lone dollar sign as a formula', () => {
    expect(splitInlineMath('It costs $5 and $6 extra.')).toEqual([
      { type: 'text', value: 'It costs $5 and $6 extra.' },
    ]);
    expect(splitInlineMath('Budget of $100 total')).toEqual([
      { type: 'text', value: 'Budget of $100 total' },
    ]);
  });

  it('never spans lines, so an unclosed $ cannot eat the answer', () => {
    const text = 'A stray $ sign\nand then more text $x$ here';
    expect(splitInlineMath(text)).toEqual([
      { type: 'text', value: 'A stray $ sign\nand then more text ' },
      { type: 'math', value: 'x', display: false },
      { type: 'text', value: ' here' },
    ]);
  });
});
