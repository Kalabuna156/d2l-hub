/**
 * The user's own AI provider. Keys live in config.json on this computer and are
 * never returned to the browser. Only the calls the user asks for are sent.
 */

import { readConfig, updateConfig } from './config';
import type { AiProvider, AiStatus } from '../shared/types';

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  custom: 'OpenAI-compatible endpoint',
};

export const AI_DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: 'gemini-3.8-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-5',
  custom: 'gpt-4o-mini',
};

const PROVIDERS = Object.keys(AI_PROVIDER_LABELS) as AiProvider[];

/** Gemini retired these IDs; a saved old model must not break every request. */
const RETIRED_GEMINI_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-latest',
  'gemini-2.5-flash-preview',
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash',
]);

function cleanModelId(value: string): string {
  return value.trim().replace(/^models\//i, '').slice(0, 80);
}

/** What a request should actually use, upgrading retired defaults invisibly. */
export function effectiveModel(provider: AiProvider, model: string | null): string {
  const cleaned = cleanModelId(model ?? '');
  if (!cleaned) return AI_DEFAULT_MODELS[provider];
  if (provider === 'gemini' && RETIRED_GEMINI_MODELS.has(cleaned.toLowerCase())) {
    return AI_DEFAULT_MODELS.gemini;
  }
  return cleaned;
}

export function aiStatus(): AiStatus {
  const ai = readConfig().ai;
  return {
    configured: Boolean(ai.apiKey),
    provider: ai.provider,
    model: effectiveModel(ai.provider, ai.model),
    customBaseUrl: ai.provider === 'custom' ? ai.customBaseUrl : null,
    allowCourseFiles: ai.allowCourseFiles,
    keyHint: ai.apiKey ? `••••${ai.apiKey.slice(-4)}` : null,
  };
}

export function providerLabel(provider: AiProvider): string {
  return AI_PROVIDER_LABELS[provider];
}

interface AiSettingsInput {
  provider?: unknown;
  apiKey?: unknown;
  model?: unknown;
  customBaseUrl?: unknown;
  allowCourseFiles?: unknown;
  clearKey?: unknown;
}

/** Save settings; an omitted or blank key keeps the one already stored. */
export function saveAiSettings(input: AiSettingsInput): AiStatus {
  const provider = PROVIDERS.includes(input.provider as AiProvider)
    ? (input.provider as AiProvider)
    : null;
  if (!provider) throw new Error('Choose an AI provider.');

  const key = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  if (key.length > 300) throw new Error('That API key is too long.');

  const modelInput = typeof input.model === 'string' ? input.model : '';
  const model = cleanModelId(modelInput);
  // Saving with the current default clears an unusable retired Gemini ID.
  const storedModel =
    provider === 'gemini' && RETIRED_GEMINI_MODELS.has(model.toLowerCase()) ? '' : model;
  const base = typeof input.customBaseUrl === 'string' ? input.customBaseUrl.trim().replace(/\/+$/, '') : '';
  if (provider === 'custom') {
    if (!base) throw new Error('Add the OpenAI-compatible endpoint URL, for example https://…/v1.');
    let url: URL;
    try {
      url = new URL(base);
    } catch {
      throw new Error('That endpoint is not a valid URL.');
    }
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (!/^https?:$/.test(url.protocol) || (url.protocol === 'http:' && !loopback)) {
      throw new Error('Use an https:// endpoint (http:// is allowed for localhost only).');
    }
  }

  updateConfig((config) => ({
    ...config,
    ai: {
      provider,
      apiKey: input.clearKey === true ? null : key || config.ai.apiKey,
      model: storedModel || null,
      customBaseUrl: provider === 'custom' ? base : null,
      allowCourseFiles: input.allowCourseFiles === true,
    },
  }));
  return aiStatus();
}

export function forgetAiKey(): AiStatus {
  updateConfig((config) => ({ ...config, ai: { ...config.ai, apiKey: null } }));
  return aiStatus();
}

interface AskOptions {
  system?: string;
  json?: boolean;
  maxTokens?: number;
}

interface ProviderReply {
  text: string;
}

function friendlyFailure(provider: AiProvider, status: number, detail: string): string {
  const label = AI_PROVIDER_LABELS[provider];
  // Gemini reports an invalid key as HTTP 400 INVALID_ARGUMENT, not 401.
  if (
    status === 401 ||
    status === 403 ||
    /api[_ ]?key (?:is )?not valid|api_key_invalid|invalid api key/i.test(detail)
  ) {
    return `${label} rejected that API key. Check it in Settings → AI.`;
  }
  if (status === 404) {
    const geminiHint =
      provider === 'gemini'
        ? ' Gemini retired older Flash models — leave Model blank to use gemini-3.8-flash.'
        : '';
    return `${label} did not recognise that model. Pick another model in Settings → AI.${geminiHint}`;
  }
  if (status === 429) {
    return `${label} is rate-limiting this key. Wait a minute and try again.`;
  }
  if (status === 503) {
    return `${label} is busy right now (high demand). It retried automatically — try again in a minute.`;
  }
  if (status >= 500) return `${label} had a server problem. Try again in a moment.`;
  const clipped = detail.replace(/\s+/g, ' ').trim().slice(0, 180);
  return clipped ? `${label} rejected the request: ${clipped}` : `${label} rejected the request (${status}).`;
}

/**
 * A busy 3.8 Flash is common enough to be worth retrying. If the known good
 * siblings are busy too, the app asks Google which other Gemini 3.x text
 * models this key can use instead of assuming one fixed model is free.
 * The fallback is internal: the user keeps their chosen model in Settings.
 */
const GEMINI_FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
];
const GEMINI_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const GEMINI_LIST_URL =
  'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200';
const GEMINI_DISCOVERY_TTL_MS = 10 * 60_000;
const GEMINI_NON_TEXT =
  /image|imagen|tts|transcri|audio|embedding|robotics|computer-use|deep-research|antigravity|veo|nano-banana|customtools/i;

/** The requested model first, then newer siblings this key can usually reach. */
export function geminiModelOrder(model: string): string[] {
  return [...new Set([model, ...GEMINI_FALLBACK_MODELS])];
}

interface GeminiListedModel {
  name?: string;
  supportedGenerationMethods?: string[];
}

/**
 * Text Gemini 3.x models from ListModels, best first. Image, speech, audio,
 * embedding and research-only models cannot answer a study request.
 */
export function geminiTextModels(models: GeminiListedModel[]): string[] {
  const tier = (name: string) =>
    /pro/i.test(name) ? 2 : /flash-lite/i.test(name) ? 1 : /flash/i.test(name) ? 0 : 3;
  const version = (name: string) => {
    const match = /^gemini-3(?:\.(\d+))?/i.exec(name);
    return match?.[1] ? Number(match[1]) : 0;
  };
  const preview = (name: string) => (/preview/i.test(name) ? 1 : 0);

  return [
    ...new Set(
      models
        .filter((model) => (model.supportedGenerationMethods ?? []).includes('generateContent'))
        .map((model) => cleanModelId(model.name ?? ''))
        .filter((name) => /^gemini-3(?:[.-]|$)/i.test(name))
        .filter((name) => !GEMINI_NON_TEXT.test(name)),
    ),
  ].sort(
    (a, b) =>
      tier(a) - tier(b) ||
      version(b) - version(a) ||
      preview(a) - preview(b) ||
      a.localeCompare(b),
  );
}

let geminiDiscovery: { at: number; models: string[] } | null = null;

/** Ask Google for the current model catalogue; failure just means no extra tries. */
async function discoverGeminiModels(key: string): Promise<string[]> {
  if (geminiDiscovery && Date.now() - geminiDiscovery.at < GEMINI_DISCOVERY_TTL_MS) {
    return geminiDiscovery.models;
  }
  try {
    const response = await fetch(GEMINI_LIST_URL, {
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { models?: GeminiListedModel[] };
    const models = geminiTextModels(body.models ?? []);
    if (models.length > 0) geminiDiscovery = { at: Date.now(), models };
    return models;
  } catch {
    return [];
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(
  key: string,
  model: string,
  prompt: string,
  options: AskOptions,
): Promise<ProviderReply> {
  let lastStatus = 0;
  let lastDetail = '';
  const tried = new Set<string>();

  const attempt = async (candidate: string, attempts: number): Promise<string | null> => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidate)}:generateContent`;

    for (let index = 0; index < attempts; index += 1) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: options.maxTokens ?? 4096,
            ...(options.json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (response.ok) {
        const body = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
        };
        const text = (body.candidates?.[0]?.content?.parts ?? [])
          .filter((part) => part.thought !== true)
          .map((part) => part.text ?? '')
          .join('')
          .trim();
        if (!text) throw new Error('Gemini sent back an empty reply. Try again.');
        return text;
      }

      lastStatus = response.status;
      lastDetail = await response.text();

      // A rejected key or malformed request will fail the same way on every
      // model, so surface it immediately. A retired model (404) falls through
      // to the fallback instead.
      if (!GEMINI_RETRY_STATUSES.has(response.status) && response.status !== 404) {
        throw new Error(friendlyFailure('gemini', response.status, lastDetail));
      }
      if (index === 0) await wait(1_200);
    }
    return null;
  };

  // Known good siblings get two chances because a 503 spike is often brief.
  for (const candidate of geminiModelOrder(model)) {
    tried.add(candidate);
    const text = await attempt(candidate, 2);
    if (text) return { text };
  }

  // Still busy? Let Google's catalogue supply every other text Gemini 3.x
  // model this key can reach. One attempt each keeps the fallback quick.
  const discovered = await discoverGeminiModels(key);
  for (const candidate of discovered) {
    if (tried.has(candidate)) continue;
    tried.add(candidate);
    const text = await attempt(candidate, 1);
    if (text) return { text };
  }

  throw new Error(friendlyFailure('gemini', lastStatus, lastDetail));
}

function openAiBase(provider: AiProvider, customBase: string | null): string {
  const base = provider === 'custom' ? customBase ?? '' : 'https://api.openai.com/v1';
  return /\/chat\/completions$/i.test(base) ? base : `${base.replace(/\/+$/, '')}/chat/completions`;
}

async function callOpenAi(
  provider: 'openai' | 'custom',
  key: string,
  model: string,
  prompt: string,
  options: AskOptions,
  baseUrl: string | null,
): Promise<ProviderReply> {
  const response = await fetch(openAiBase(provider, baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        ...(options.system ? [{ role: 'system', content: options.system }] : []),
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: options.maxTokens ?? 4096,
      ...(options.json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(friendlyFailure(provider, response.status, await response.text()));
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  const text = (typeof content === 'string' ? content : (content ?? []).map((part) => part.text ?? '').join('')).trim();
  if (!text) throw new Error(`${AI_PROVIDER_LABELS[provider]} sent back an empty reply. Try again.`);
  return { text };
}

async function callAnthropic(
  key: string,
  model: string,
  prompt: string,
  options: AskOptions,
): Promise<ProviderReply> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: 0.2,
      ...(options.system ? { system: options.system } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(friendlyFailure('anthropic', response.status, await response.text()));
  }
  const body = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = (body.content ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  if (!text) throw new Error('Claude sent back an empty reply. Try again.');
  return { text };
}

/** One text request to whichever provider the user configured. */
export async function askAi(prompt: string, options: AskOptions = {}): Promise<string> {
  const ai = readConfig().ai;
  if (!ai.apiKey) throw new Error('Add your own AI API key in Settings → AI first.');
  const provider = ai.provider;
  const model = effectiveModel(provider, ai.model);

  let reply: ProviderReply;
  try {
    if (provider === 'gemini') reply = await callGemini(ai.apiKey, model, prompt, options);
    else if (provider === 'anthropic') reply = await callAnthropic(ai.apiKey, model, prompt, options);
    else reply = await callOpenAi(provider, ai.apiKey, model, prompt, options, ai.customBaseUrl);
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(`${AI_PROVIDER_LABELS[provider]} took too long to answer. Try again.`);
    }
    if (error instanceof TypeError) {
      throw new Error(`Could not reach ${AI_PROVIDER_LABELS[provider]}. Check your internet connection.`);
    }
    throw error;
  }
  return reply.text;
}

/** AI replies often arrive wrapped in a code fence or a short sentence. */
export function extractJson<T>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = Math.min(
    ...[trimmed.indexOf('{'), trimmed.indexOf('[')].filter((index) => index >= 0),
  );
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (!Number.isFinite(start) || end <= start) {
    throw new Error('The AI reply was not valid JSON. Try again.');
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch {
    throw new Error('The AI reply was not valid JSON. Try again.');
  }
}

export async function askAiJson<T>(prompt: string, options: AskOptions = {}): Promise<T> {
  const text = await askAi(prompt, { ...options, json: true });
  return extractJson<T>(text);
}

/** A tiny round trip, so Settings can say the key works. */
export async function testAi(): Promise<{ provider: string; model: string }> {
  const status = aiStatus();
  if (!status.configured) throw new Error('Save an API key first.');
  // Gemini 3.x spends part of this budget on internal reasoning before the
  // JSON, so a tiny budget can come back empty even when the key is fine.
  const reply = await askAi('Reply with exactly the JSON object {"ok":true} and nothing else.', {
    json: true,
    maxTokens: 1_000,
  });
  const parsed = extractJson<{ ok?: boolean }>(reply);
  if (parsed.ok !== true) throw new Error('The provider answered, but not with the expected reply.');
  return { provider: providerLabel(status.provider), model: status.model };
}
