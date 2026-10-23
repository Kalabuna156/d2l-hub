import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AiStatus } from '../shared/types';
import { PdfAiPanel } from '../src/components/PdfAiPanel';

const ai: AiStatus = {
  configured: true,
  provider: 'gemini',
  model: 'gemini-3-pro',
  customBaseUrl: null,
  allowCourseFiles: false,
  keyHint: 'ab12',
};

function render(text: string): string {
  return renderToStaticMarkup(
    <PdfAiPanel
      page={2}
      pageCount={7}
      ai={ai}
      messages={[{ role: 'assistant', text }]}
      question=""
      busy={false}
      error={null}
      onQuestion={() => {}}
      onSend={() => {}}
      onClose={() => {}}
      onOpenSettings={() => {}}
    />,
  );
}

describe('PdfAiPanel math rendering', () => {
  it('typesets inline and display LaTeX instead of printing the source', () => {
    const html = render(
      'Only $c = 3$ is correct.\n\n$$\\frac{6 - 2e^{-2}}{-2} = e^{-2} - 3$$',
    );
    expect(html).toContain('katex');
    expect(html).toContain('katex-display');
    // The source survives only in KaTeX's hidden MathML annotation, never as
    // visible text with its dollar delimiters.
    expect(html).toContain('annotation encoding="application/x-tex"');
    expect(html).not.toContain('$c = 3$');
    expect(html).not.toContain('$$');
  });

  it('keeps bold, lists and money intact', () => {
    const html = render('**Left-hand limit:** $2c$\n- costs $5 and $6');
    expect(html).toContain('<strong>Left-hand limit:</strong>');
    expect(html).toContain('costs $5 and $6');
    expect(html).toContain('katex');
  });

  it('shows unparseable LaTeX as code rather than losing it', () => {
    const html = render('broken $\\notacommand{x}$ here');
    expect(html).toContain('<code');
    expect(html).toContain('\\notacommand{x}');
  });
});
