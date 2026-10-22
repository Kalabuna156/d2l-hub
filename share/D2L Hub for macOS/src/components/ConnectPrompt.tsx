import { ArrowRight, BookOpen } from 'lucide-react';

interface ConnectPromptProps {
  icon?: typeof BookOpen;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  note?: string;
}

/**
 * The empty state for a feature that needs an account: no invented data, just
 * one clear button that opens the dialog or settings section that connects it.
 */
export function ConnectPrompt({
  icon: Icon = BookOpen,
  title,
  body,
  actionLabel,
  onAction,
  note,
}: ConnectPromptProps) {
  return (
    <div className="panel grid place-items-center px-6 py-14 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-500/[0.12] text-violet-300 ring-1 ring-inset ring-violet-400/20">
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <p className="mt-4 font-display text-[15px] font-semibold text-white">{title}</p>
      <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-slate-500">{body}</p>
      <button
        type="button"
        onClick={onAction}
        className="focus-ring mt-5 inline-flex h-9 items-center gap-1.5 rounded-xl border border-violet-400/30 bg-violet-500/[0.12] px-3.5 text-[12.5px] font-medium text-violet-100 transition hover:border-violet-400/50 hover:bg-violet-500/[0.2] hover:text-white"
      >
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
      {note && <p className="mt-3 max-w-sm text-[11px] leading-relaxed text-slate-600">{note}</p>}
    </div>
  );
}
