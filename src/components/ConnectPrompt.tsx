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
    <div className="panel relative grid place-items-center overflow-hidden px-6 py-14 text-center">
      {/* A pool of light behind the icon, so the empty state has a centre. */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-40 w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-violet-500) 16%, transparent)' }}
      />
      <span className="plate relative h-11 w-11">
        <Icon className="h-[19px] w-[19px]" strokeWidth={1.9} />
      </span>
      <p className="relative mt-4 font-display text-[15px] font-semibold tracking-[-0.02em] text-ink-1">{title}</p>
      <p className="relative mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-ink-3">{body}</p>
      <button type="button" onClick={onAction} className="btn btn-primary focus-ring relative mt-5">
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
      {note && <p className="relative mt-3 max-w-sm text-[11px] leading-relaxed text-ink-4">{note}</p>}
    </div>
  );
}
