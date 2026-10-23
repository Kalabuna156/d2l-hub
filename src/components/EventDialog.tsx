import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CalendarPlus, ExternalLink, EyeOff, Loader2, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import type { CalendarEvent, EventOverride } from '../../shared/types';
import { googleCalendarUrl } from '../lib/google-calendar';
import {
  createLocalEvent,
  deleteLocalEvent,
  resetEventOverride,
  saveEventOverride,
  updateLocalEvent,
} from '../lib/api';

export type EventDialogTarget =
  | { kind: 'create'; startsAt: string; endsAt: string }
  | { kind: 'event'; event: CalendarEvent };

interface EventDialogProps {
  target: EventDialogTarget | null;
  onClose: () => void;
  onSaved: () => void;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** ISO timestamp → the value a datetime-local input expects (local time). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const inputClass =
  'focus-ring h-9 w-full rounded-lg border border-line bg-surface-1 px-2.5 text-[12.5px] text-ink-1 placeholder:text-ink-4 transition focus:border-violet-400/40 disabled:opacity-60';

export function EventDialog({ target, onClose, onSaved }: EventDialogProps) {
  const [title, setTitle] = useState('');
  const [room, setRoom] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const event = target?.kind === 'event' ? target.event : null;
  const creating = target?.kind === 'create';
  const local = event?.source === 'local' || event?.source === 'form';
  const editableGoogle = Boolean(event && event.source === 'google');

  useEffect(() => {
    if (!target) return;
    setBusy(false);
    setError(null);
    if (target.kind === 'create') {
      setTitle('');
      setRoom('');
      setStart(toLocalInput(target.startsAt));
      setEnd(toLocalInput(target.endsAt));
      return;
    }
    setTitle(target.event.title);
    setRoom(target.event.location ?? '');
    setStart(toLocalInput(target.event.startsAt));
    setEnd(toLocalInput(target.event.endsAt));
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const handler = (keyboard: KeyboardEvent) => {
      if (keyboard.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [target, onClose]);

  if (!target) return null;

  const heading = creating ? 'New event' : event?.hidden ? 'Hidden event' : 'Edit event';
  const subtitle = creating
    ? 'Added in this app — copy it to Google whenever you like.'
    : local
      ? event?.source === 'form'
        ? 'Imported from your course outline, stored on this computer.'
        : 'Created in this app, on this computer.'
      : event?.hidden
        ? 'Hidden from the week grid.'
        : 'Only for this date, only on this computer.';

  type FormResult =
    | { error: string }
    | {
        value: { title: string; location: string | null; startsAt: string; endsAt: string };
      };

  const readForm = (): FormResult => {
    if (!title.trim()) return { error: 'Give the event a name.' };
    const startsAt = fromLocalInput(start);
    const endsAt = fromLocalInput(end);
    if (!startsAt) return { error: 'Pick a start time.' };
    if (!endsAt) return { error: 'Pick an end time.' };
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      return { error: 'The event has to end after it starts.' };
    }
    return {
      value: {
        title: title.trim(),
        location: room.trim() || null,
        startsAt,
        endsAt,
      },
    };
  };

  const submit = async () => {
    const form = readForm();
    if (!('value' in form)) {
      setError(form.error);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (creating) {
        await createLocalEvent(form.value);
      } else if (local && event) {
        await updateLocalEvent(event.id, form.value);
      } else if (editableGoogle && event) {
        const patch: EventOverride = {};
        if (form.value.title !== event.title) patch.title = form.value.title;
        if (form.value.location !== (event.location ?? null)) patch.location = form.value.location;
        if (form.value.startsAt !== event.startsAt) patch.startsAt = form.value.startsAt;
        if (form.value.endsAt !== event.endsAt) patch.endsAt = form.value.endsAt;
        if (event.hidden) patch.hidden = false;
        if (Object.keys(patch).length === 0) {
          onClose();
          return;
        }
        await saveEventOverride(event.id, patch);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that event.');
      setBusy(false);
    }
  };

  /**
   * Save the event here, then open Google's prefilled page. Google still needs
   * the final Save, so this is a hand-off rather than a silent remote write.
   */
  const handoff = async () => {
    const form = readForm();
    if (!('value' in form)) {
      setError(form.error);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (creating) {
        await createLocalEvent(form.value);
      } else if (local && event) {
        await updateLocalEvent(event.id, form.value);
      }
      window.open(googleCalendarUrl(form.value), '_blank', 'noopener,noreferrer');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that event.');
      setBusy(false);
    }
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that change.');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-[6px]"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      onMouseDown={(mouse) => {
        if (mouse.target === mouse.currentTarget && !busy) onClose();
      }}
    >
      <div className="pane-float animate-pop w-full max-w-[460px] overflow-hidden">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl shadow-lg ${
              creating
                ? 'bg-gradient-to-br from-violet-500 to-indigo-700 shadow-violet-950/60'
                : local
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-700 shadow-emerald-950/60'
                  : 'bg-gradient-to-br from-sky-500 to-indigo-700 shadow-sky-950/60'
            }`}
          >
            {creating ? (
              <CalendarPlus className="h-4 w-4 text-white" />
            ) : local ? (
              <Pencil className="h-4 w-4 text-white" />
            ) : (
              <CalendarClock className="h-4 w-4 text-white" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-ink-1">{heading}</h2>
            <p className="mt-0.5 text-[12px] text-ink-3">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-ink-3 transition hover:bg-white/10 hover:text-ink-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3">Event name</span>
            <input
              value={title}
              onChange={(change) => setTitle(change.target.value)}
              disabled={busy}
              autoFocus={creating}
              placeholder={creating ? 'Study group' : undefined}
              className={`mt-1.5 ${inputClass}`}
            />
          </label>

          <label className="mt-3 block">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3">Room or place</span>
            <input
              value={room}
              onChange={(change) => setRoom(change.target.value)}
              disabled={busy}
              placeholder="KHE231A"
              spellCheck={false}
              className={`mt-1.5 ${inputClass}`}
            />
          </label>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3">Starts</span>
              <input
                type="datetime-local"
                value={start}
                onChange={(change) => setStart(change.target.value)}
                disabled={busy}
                className={`mt-1.5 ${inputClass}`}
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3">Ends</span>
              <input
                type="datetime-local"
                value={end}
                onChange={(change) => setEnd(change.target.value)}
                disabled={busy}
                className={`mt-1.5 ${inputClass}`}
              />
            </label>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-ink-4">
            {local || creating
              ? 'Events added here are stored in this app. Add to Google Calendar opens a prefilled Google page where you press Save — nothing is sent automatically.'
              : 'Changes are stored in this app and applied after every sync — Google Calendar itself is not modified, so a feed refresh will not undo them.'}
          </p>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2.5 text-[12px] text-rose-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="focus-ring flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-violet-400)_78%,#0b0d16),color-mix(in_srgb,var(--color-violet-600)_92%,#0b0d16))] px-3.5 text-[12px] font-semibold text-white shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-violet-300)_34%,transparent),0_12px_28px_-14px_color-mix(in_srgb,var(--color-violet-500)_95%,transparent),inset_0_1px_0_rgba(255,255,255,0.22)] transition hover:brightness-[1.12] disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {creating ? 'Add event' : event?.hidden ? 'Show this class again' : 'Save changes'}
          </button>

          {(local || creating) && (
            <button
              type="button"
              onClick={() => void handoff()}
              disabled={busy}
              className="focus-ring flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[11.5px] text-ink-2 transition hover:border-sky-400/30 hover:bg-sky-500/[0.08] hover:text-sky-100 disabled:opacity-60"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Add to Google Calendar
            </button>
          )}

          {local && event ? (
            <button
              type="button"
              onClick={() => void run(() => deleteLocalEvent(event.id))}
              disabled={busy}
              className="focus-ring flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[11.5px] text-ink-2 transition hover:border-rose-400/30 hover:bg-rose-500/[0.08] hover:text-rose-200 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete event
            </button>
          ) : editableGoogle && event ? (
            event.hidden ? (
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="focus-ring h-9 rounded-lg border border-white/10 px-3 text-[11.5px] text-ink-2 transition hover:border-white/20 hover:bg-surface-2 disabled:opacity-60"
              >
                Keep hidden
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void run(() => saveEventOverride(event.id, { hidden: true }))}
                disabled={busy}
                className="focus-ring flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[11.5px] text-ink-2 transition hover:border-rose-400/30 hover:bg-rose-500/[0.08] hover:text-rose-200 disabled:opacity-60"
              >
                <EyeOff className="h-3.5 w-3.5" />
                Hide class
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="focus-ring h-9 rounded-lg border border-white/10 px-3 text-[11.5px] text-ink-2 transition hover:border-white/20 hover:bg-surface-2 disabled:opacity-60"
            >
              Cancel
            </button>
          )}

          {editableGoogle && event?.edited && (
            <button
              type="button"
              onClick={() => void run(() => resetEventOverride(event.id))}
              disabled={busy}
              className="focus-ring ml-auto flex h-9 items-center gap-1.5 rounded-lg px-2 text-[11px] text-ink-3 transition hover:text-ink-1 disabled:opacity-60"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to Google&apos;s version
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
