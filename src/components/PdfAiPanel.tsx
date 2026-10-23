import { useEffect, useRef, type ReactNode } from 'react';
import { Loader2, Send, Settings2, Sparkles, X } from 'lucide-react';
import type { AiStatus } from '../../shared/types';

export interface PdfAiMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface PdfAiPanelProps {
  page: number;
  pageCount: number;
  ai: AiStatus | null;
  messages: PdfAiMessage[];
  question: string;
  busy: boolean;
  error: string | null;
  onQuestion: (value: string) => void;
  onSend: (prompt?: string) => void;
  onClose: () => void;
  onOpenSettings: () => void;
}

const SUGGESTIONS = [
  'Summarize this page',
  'Explain the key idea simply',
  'Make 5 practice questions',
  'What does my handwriting say?',
];

/** Small markdown subset (bold, code, headings, lists) in plain React nodes. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g).map((part, index) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*\n]+\*$/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code key={index} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[10.5px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function AnswerText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 select-text break-words">
      {text.split('\n').map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed || /^[-*_]{3,}$/.test(trimmed)) return null;
        const heading = /^#{1,6}\s+(.*)$/.exec(trimmed);
        if (heading) {
          return (
            <p key={index} className="pt-1 font-semibold text-slate-100">
              {inline(heading[1])}
            </p>
          );
        }
        const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
        if (bullet) {
          return (
            <p key={index} className="flex gap-1.5">
              <span className="text-violet-300/80">•</span>
              <span className="min-w-0 flex-1">{inline(bullet[1])}</span>
            </p>
          );
        }
        const numbered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);
        if (numbered) {
          return (
            <p key={index} className="flex gap-1.5">
              <span className="shrink-0 text-violet-300/80">{numbered[1]}.</span>
              <span className="min-w-0 flex-1">{inline(numbered[2])}</span>
            </p>
          );
        }
        return <p key={index}>{inline(trimmed)}</p>;
      })}
    </div>
  );
}

function providerName(ai: AiStatus | null): string {
  if (!ai) return 'your AI provider';
  switch (ai.provider) {
    case 'gemini':
      return 'Google Gemini';
    case 'openai':
      return 'OpenAI';
    case 'anthropic':
      return 'Anthropic Claude';
    default:
      return 'your AI endpoint';
  }
}

export function PdfAiPanel({
  page,
  pageCount,
  ai,
  messages,
  question,
  busy,
  error,
  onQuestion,
  onSend,
  onClose,
  onOpenSettings,
}: PdfAiPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, busy, error]);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, []);

  const configured = Boolean(ai?.configured);

  return (
    <aside
      aria-label="Ask AI about this page"
      className="absolute inset-y-0 right-0 z-30 flex w-[min(360px,92vw)] flex-col overflow-hidden border-l border-white/[0.09] bg-[#0d0f15] shadow-[-18px_0_40px_rgba(0,0,0,0.35)] lg:static lg:z-auto lg:w-[360px] lg:shrink-0 lg:shadow-none"
    >
      <div className="flex items-start gap-2.5 border-b border-white/[0.07] px-3.5 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-200">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-slate-100">Ask AI about this page</p>
          <p className="truncate text-[10.5px] text-slate-500">
            Page {page}
            {pageCount ? ` of ${pageCount}` : ''} · reads text, scans and your ink
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI panel"
          className="focus-ring grid h-7 w-7 place-items-center rounded-md text-slate-500 transition hover:bg-white/[0.08] hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {!configured ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-500/10 text-violet-300 ring-1 ring-inset ring-violet-400/20">
            <Sparkles className="h-5 w-5" />
          </span>
          <p className="mt-4 text-[12.5px] font-medium text-slate-200">
            {ai ? 'Add your AI key to start' : 'Checking AI settings…'}
          </p>
          <p className="mt-1.5 max-w-[250px] text-[11px] leading-5 text-slate-500">
            Ask questions about the page, get explanations and practice questions, or read your
            handwritten notes. Only the page you are on is sent.
          </p>
          {ai && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="focus-ring mt-4 inline-flex items-center gap-1.5 rounded-lg border border-violet-400/30 bg-violet-500/[0.14] px-3 py-1.5 text-[11px] font-semibold text-violet-100 transition hover:bg-violet-500/20"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Open AI settings
            </button>
          )}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5">
            {messages.length === 0 && !busy && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3.5">
                <p className="text-[11.5px] font-medium text-slate-200">
                  What do you want to know?
                </p>
                <p className="mt-1 text-[10.5px] leading-5 text-slate-500">
                  The assistant can see this page, including anything you drew on it.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => onSend(suggestion)}
                      disabled={busy}
                      className="focus-ring rounded-full border border-violet-400/20 bg-violet-500/[0.08] px-2.5 py-1 text-[10px] text-violet-100/90 transition hover:bg-violet-500/[0.16] disabled:opacity-40"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) =>
              message.role === 'user' ? (
                <div key={index} className="flex justify-end">
                  <div className="max-w-[88%] rounded-2xl rounded-br-md bg-violet-500/[0.22] px-3 py-2 text-[11.5px] leading-5 text-violet-50 ring-1 ring-inset ring-violet-400/20">
                    <p className="select-text whitespace-pre-wrap break-words">{message.text}</p>
                  </div>
                </div>
              ) : (
                <div key={index} className="flex justify-start">
                  <div className="max-w-[94%] rounded-2xl rounded-bl-md border border-white/[0.07] bg-white/[0.035] px-3 py-2 text-[11.5px] leading-5 text-slate-200">
                    <AnswerText text={message.text} />
                  </div>
                </div>
              ),
            )}

            {busy && (
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300" />
                Reading page {page}…
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2.5 text-[10.5px] leading-5 text-rose-100">
                {error}
              </div>
            )}
          </div>

          <div className="border-t border-white/[0.07] px-3 py-2.5">
            <div className="flex items-end gap-2 rounded-xl border border-white/[0.09] bg-white/[0.035] px-2.5 py-2 focus-within:border-violet-400/40">
              <textarea
                ref={inputRef}
                value={question}
                onChange={(event) => onQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    onSend();
                  }
                }}
                rows={2}
                disabled={busy}
                placeholder="Ask about this page…"
                aria-label="Ask AI about this page"
                className="max-h-28 min-h-[34px] w-full resize-none bg-transparent text-[11.5px] leading-5 text-slate-100 outline-none placeholder:text-slate-600 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => onSend()}
                disabled={busy || !question.trim()}
                aria-label="Send question"
                className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-500 text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="mt-1.5 px-0.5 text-[9.5px] leading-4 text-slate-600">
              Only this page is sent to {providerName(ai)}. Answers can be wrong — check the source.
            </p>
          </div>
        </>
      )}
    </aside>
  );
}
