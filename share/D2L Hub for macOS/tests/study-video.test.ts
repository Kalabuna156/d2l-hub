import { describe, expect, it } from 'vitest';
import { effectiveModel, geminiModelOrder, geminiTextModels } from '../server/ai';
import { channelSearchUrl, fallbackVideoQuery } from '../server/study-video';

describe('effectiveModel', () => {
  it('uses Gemini 3.8 Flash instead of a retired saved model', () => {
    expect(effectiveModel('gemini', 'gemini-2.5-flash')).toBe('gemini-3.8-flash');
    expect(effectiveModel('gemini', 'gemini-2.0-flash')).toBe('gemini-3.8-flash');
  });

  it('keeps a current model and accepts a pasted models/ prefix', () => {
    expect(effectiveModel('gemini', 'models/gemini-3.8-flash')).toBe('gemini-3.8-flash');
    expect(effectiveModel('openai', 'gpt-4o-mini')).toBe('gpt-4o-mini');
  });

  it('falls back to the default when no model is chosen', () => {
    expect(effectiveModel('gemini', null)).toBe('gemini-3.8-flash');
  });

  it('tries newer siblings when the chosen Flash model is at capacity', () => {
    expect(geminiModelOrder('gemini-3.8-flash')).toEqual([
      'gemini-3.8-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
    ]);
  });

  it('finds other text Gemini 3.x models but skips image, speech and old ones', () => {
    const models = [
      { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-pro-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.1-pro-preview', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-transcribe', supportedGenerationMethods: ['generateContent'] },
    ];

    expect(geminiTextModels(models)).toEqual([
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-3.1-pro-preview',
    ]);
  });
});

describe('study video links', () => {
  it('drops file extensions and generic labels from a fallback search', () => {
    expect(fallbackVideoQuery('Unit 3.2 Handout.pdf', 'CPS101')).toBe('Unit 3.2');
    expect(fallbackVideoQuery('Lecture 5 Notes.pptx', 'BIO120')).toBe('BIO120');
  });

  it('builds a channel-scoped YouTube search with the query escaped', () => {
    const url = channelSearchUrl('abc123', 'eigenvectors & eigenvalues');
    expect(url).toBe(
      'https://www.youtube.com/channel/abc123/search?query=eigenvectors%20%26%20eigenvalues',
    );
  });
});
