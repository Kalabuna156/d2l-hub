import { CalendarDays, Pencil } from 'lucide-react';
import type { CalendarEvent } from '../../shared/types';
import { hourLabel, isSameDay, timeRangeLabel } from '../lib/schedule';

interface TodayScheduleProps {
  events: CalendarEvent[];
  /** Takes the user to the Calendar tab, where the same events can be edited */
  onEdit: () => void;
}

const HOUR_HEIGHT = 34;

/**
 * Today at a glance for the overview rail. Read-only on purpose: the pencil
 * opens the Calendar tab, which owns the editing dialogs.
 */
export function TodaySchedule({ events, onEdit }: TodayScheduleProps) {
  const today = new Date();
  const todays = events
    .filter(
      (event) =>
        !event.hidden &&
        event.startsAt &&
        event.endsAt &&
        isSameDay(new Date(event.startsAt), today),
    )
    .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));

  const minutes = (iso: string) => {
    const date = new Date(iso);
    return date.getHours() * 60 + date.getMinutes();
  };

  const starts = todays.map((event) => minutes(event.startsAt!));
  const ends = todays.map((event) => minutes(event.endsAt!));
  const startMin = starts.length
    ? Math.max(0, Math.min(8 * 60, Math.floor(Math.min(...starts) / 60) * 60))
    : 8 * 60;
  const endMin = ends.length
    ? Math.min(24 * 60, Math.max(18 * 60, Math.ceil(Math.max(...ends) / 60) * 60))
    : 18 * 60;
  const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
  const hours = Array.from(
    { length: endMin / 60 - startMin / 60 + 1 },
    (_, index) => startMin / 60 + index,
  );

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNow = nowMinutes >= startMin && nowMinutes <= endMin;

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-400/20">
          <CalendarDays className="h-3.5 w-3.5" />
        </span>
        <h2 className="font-display text-[13px] font-semibold text-slate-100">Today</h2>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-slate-400">
          {todays.length}
        </span>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit today's events in Calendar"
          title="Edit in Calendar"
          className="focus-ring ml-auto flex items-center gap-1 rounded-md border border-white/[0.07] px-1.5 py-1 text-[10.5px] font-medium text-slate-400 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-slate-100"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </div>

      <div className="px-3 py-3">
        <p className="px-1 text-[11px] text-slate-500">
          {today.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })}
        </p>

        {todays.length === 0 ? (
          <div className="mt-2 grid place-items-center rounded-lg border border-dashed border-white/[0.08] px-3 py-8 text-center">
            <p className="text-[12px] text-slate-500">Nothing scheduled today.</p>
            <button
              type="button"
              onClick={onEdit}
              className="focus-ring mt-1 rounded text-[11px] text-violet-300 transition hover:text-violet-200"
            >
              Add an event in Calendar
            </button>
          </div>
        ) : (
          <div className="mt-2 max-h-[360px] overflow-y-auto">
            <div className="flex pt-1.5">
              <div className="relative w-9 shrink-0" style={{ height }}>
                {hours.map((hour) => (
                  <span
                    key={hour}
                    className="absolute right-1.5 -translate-y-1/2 text-[8.5px] tabular-nums text-slate-600"
                    style={{ top: ((hour * 60 - startMin) / 60) * HOUR_HEIGHT }}
                  >
                    {hourLabel(hour)}
                  </span>
                ))}
              </div>

              <div className="relative flex-1 border-l border-white/[0.06]" style={{ height }}>
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="pointer-events-none absolute inset-x-0 border-t border-white/[0.045]"
                    style={{ top: ((hour * 60 - startMin) / 60) * HOUR_HEIGHT }}
                  />
                ))}

                {todays.map((event) => {
                  const start = minutes(event.startsAt!);
                  const end = minutes(event.endsAt!);
                  const top = ((start - startMin) / 60) * HOUR_HEIGHT;
                  const blockHeight = Math.max(22, ((end - start) / 60) * HOUR_HEIGHT - 2);
                  const local = event.source === 'local';
                  return (
                    <div
                      key={event.id}
                      className={`pointer-events-none absolute inset-x-1 overflow-hidden rounded px-1.5 py-1 shadow-sm shadow-black/20 ${
                        local ? 'bg-violet-400 text-[#0b0f1a]' : 'bg-[#8ab4f8] text-[#0b1220]'
                      }`}
                      style={{ top, height: blockHeight }}
                      title={`${event.title} · ${timeRangeLabel(event.startsAt!, event.endsAt)}`}
                    >
                      <p className="truncate text-[10px] font-semibold leading-tight">{event.title}</p>
                      {blockHeight > 30 && (
                        <p className="truncate text-[9px] opacity-75">
                          {timeRangeLabel(event.startsAt!, event.endsAt)}
                          {event.location ? ` · ${event.location}` : ''}
                        </p>
                      )}
                    </div>
                  );
                })}

                {showNow && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10"
                    style={{ top: ((nowMinutes - startMin) / 60) * HOUR_HEIGHT }}
                  >
                    <div className="relative h-px bg-rose-400/80">
                      <span className="absolute -left-1 -top-[3px] h-1.5 w-1.5 rounded-full bg-rose-400" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
