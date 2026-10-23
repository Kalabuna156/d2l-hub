import { CalendarDays, MapPin, Pencil } from 'lucide-react';
import type { CalendarEvent } from '../../shared/types';
import { isSameDay, timeRangeLabel } from '../lib/schedule';
import { timeLabel } from '../lib/format';

interface TodayScheduleProps {
  events: CalendarEvent[];
  /** Takes the user to the Calendar tab, where the same events can be edited */
  onEdit: () => void;
}

/**
 * Today at a glance: a short agenda, not a full timeline. The overview has to
 * keep room for courses and deadlines, so this lists today's blocks compactly
 * and hands the minute-by-minute grid to the Calendar tab.
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

  const now = Date.now();

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3.5">
        <span className="plate h-7 w-7">
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.9} />
        </span>
        <h2 className="font-display text-[13.5px] font-semibold tracking-[-0.015em] text-ink-1">Today</h2>
        <span className="chip font-mono tabular-nums">{todays.length}</span>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit today's events in Calendar"
          title="Edit in Calendar"
          className="focus-ring ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-ink-3 transition-colors duration-150 hover:text-ink-1"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </div>

      <div className="px-4 pb-2 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
          {today.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })}
        </p>

        {todays.length === 0 ? (
          <div className="mt-2 rounded-[10px] border border-dashed border-line px-3 py-7 text-center">
            <p className="text-[12px] text-ink-3">Nothing scheduled today.</p>
            <button
              type="button"
              onClick={onEdit}
              className="focus-ring mt-1.5 rounded text-[11px] font-medium text-violet-300 transition-colors duration-150 hover:text-violet-200"
            >
              Add an event in Calendar
            </button>
          </div>
        ) : (
          <ul className="mt-1.5 max-h-[292px] divide-y divide-line overflow-y-auto">
            {todays.map((event) => {
              const start = event.startsAt!;
              const end = event.endsAt!;
              const live = new Date(start).getTime() <= now && new Date(end).getTime() >= now;
              const local = event.source !== 'd2l';
              return (
                <li key={event.id} className="flex gap-3 py-2.5">
                  <div className="w-[62px] shrink-0 pt-px text-right leading-tight">
                    <p className="text-[11.5px] font-medium tabular-nums text-ink-2">{timeLabel(start)}</p>
                    <p className="text-[9.5px] tabular-nums text-ink-4">{timeLabel(end)}</p>
                  </div>
                  <div
                    className={`min-w-0 flex-1 border-l pl-2.5 ${
                      local ? 'border-violet-400/70' : 'border-sky-400/60'
                    }`}
                  >
                    <p className="truncate text-[12.5px] font-medium leading-snug text-ink-1" title={event.title}>
                      {event.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-3">
                      {live && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.06em] text-emerald-300">
                          <span className="h-1 w-1 rounded-full bg-emerald-400" />
                          Now
                        </span>
                      )}
                      {event.location ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{event.location}</span>
                        </span>
                      ) : (
                        <span className="truncate">{timeRangeLabel(start, end)}</span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
