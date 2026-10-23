/**
 * Splits assistant text into prose and LaTeX so the answer can be typeset.
 * Models answer in markdown with `$x^2$` inline and `$$…$$` on its own line;
 * both spellings and the `\(…\)` / `\[…\]` pair are accepted.
 */

export interface ProseSegment {
  type: 'text';
  value: string;
}

export interface FormulaSegment {
  type: 'math';
  value: string;
  display: boolean;
}

export type RichSegment = ProseSegment | FormulaSegment;

const MATH_SYNTAX = /[\\^_=<>+\-*/(){}\[\]|]/;

/** `$5 and $6` is money; `$x$` and `$c = 3$` are formulas. */
function looksLikeFormula(tex: string): boolean {
  const body = tex.trim();
  if (!body) return false;
  if (MATH_SYNTAX.test(body)) return true;
  // Without any operator, only short tokens ($x$, $x, y$) count; English words
  // such as "and" or "total" mean the dollars are prices.
  return body
    .split(/[\s,]+/)
    .filter(Boolean)
    .every((token) => token.length <= 2 || /[A-Z]/.test(token));
}

function collect(source: string, pattern: RegExp, display: boolean): RichSegment[] {
  const parts: RichSegment[] = [];
  let end = 0;
  pattern.lastIndex = 0;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const value = (match[1] ?? match[2] ?? '').trim();
    const start = match.index;
    const stop = start + match[0].length;
    if (!value || (!display && !looksLikeFormula(value))) continue;
    if (start > end) parts.push({ type: 'text', value: source.slice(end, start) });
    parts.push({ type: 'math', value, display });
    end = stop;
  }
  if (end < source.length) parts.push({ type: 'text', value: source.slice(end) });
  return parts;
}

const DISPLAY = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;
// Inline math stays on one line so a stray `$` cannot swallow the rest of
// the answer.
const INLINE = /\$([^$\n]+?)\$|\\\(((?:\\[^)]|[^\\\n])+?)\\\)/g;

/** Cuts out standalone equations, which must render as their own block. */
export function splitDisplayMath(text: string): RichSegment[] {
  return collect(text, DISPLAY, true);
}

/** Cuts out inline math, leaving the surrounding prose as segments. */
export function splitInlineMath(text: string): RichSegment[] {
  return collect(text, INLINE, false);
}
