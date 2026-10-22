import { describe, expect, it } from 'vitest';
import { extractJson } from '../server/ai';

describe('extractJson', () => {
  it('reads bare JSON', () => {
    expect(extractJson<{ ok: boolean }>('{"ok":true}')).toEqual({ ok: true });
  });

  it('unwraps a fenced reply with a sentence around it', () => {
    const reply = 'Here is the plan:\n```json\n{"overview":"Read chapters 5-6","focus":[]}\n```\nGood luck!';
    expect(extractJson<{ overview: string }>(reply).overview).toBe('Read chapters 5-6');
  });

  it('reads an array reply', () => {
    expect(extractJson<Array<{ title: string }>>('[{"title":"Midterm 1"}]')).toEqual([
      { title: 'Midterm 1' },
    ]);
  });

  it('rejects prose without JSON', () => {
    expect(() => extractJson('I cannot help with that.')).toThrow(/not valid JSON/i);
    expect(() => extractJson('{"broken":')).toThrow(/not valid JSON/i);
  });
});
