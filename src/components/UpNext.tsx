import { ArrowRight, CalendarDays, Clock3 } from 'lucide-react';
import type { CalendarEvent } from '../../shared/types';
import {
  courseShortCode,
  isClassEvent,
  relativeLabel,
  shortDateParts,
  sortEvents,
  sourceLabel,
  timeLabel,
  urgencyFor,
  urgencyStyles,
} from '../lib/format';

interface UpNextProps {
  events: CalendarEvent[];
  /** When nothing is connected the empty state says what to connect. */
  connected?: boolean;
  onViewCalendar: () => void;
  limit?: number;
}

export function UpNext({ events, connected = true, onViewCalendar, limit = 4 }: UpNextProps) {
  const now = Date.now();
  const upcoming = sortEvents(
    events.filter((event) => event.startsAt && !event.hidden && new Date(event.startsAt).getTime() >= now),
  ).slice(0, limit);

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-400/20">
          <CalendarDays className="h-3.5 w-3.5" />
        </span>
        <h2 className="font-display text-[13px] font-semibold text-slate-100">Up next</h2>
        <button
          type="button"
          onClick={onViewCalendar}
          className="focus-ring ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition hover:text-slate-200"
        >
          Calendar
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {upcoming.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-[13px] text-slate-400">
            {connected ? 'Nothing due right now.' : 'Nothing due yet.'}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
            {connected
              ? 'Events from D2L will show up here.'
              : 'Connect D2L or a calendar to fill this in.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {upcoming.map((event) => {
            const date = shortDateParts(event.startsAt);
            const course = courseShortCode(event.courseCode);
            const time = timeLabel(event.startsAt);
            const source = sourceLabel(event);
            // Classes are on a timetable, not due, so they stay neutral.
            const tone = urgencyStyles(isClassEvent(event) ? null : urgencyFor(event.startsAt));
            return (
              <li key={event.id}>
                <a
                  href={event.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring group flex gap-3 px-4 py-3 transition hover:bg-white/[0.03]"
                >
                  <div className="grid w-10 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.04] py-1 leading-none">
                    <span className="text-[9px] font-semibold tracking-[0.1em] text-slate-500">{date.month}</span>
                    <span className="mt-0.5 font-display text-[15px] font-semibold text-slate-100">{date.day}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`line-clamp-2 text-[12.5px] font-medium leading-snug transition group-hover:text-white ${tone.title}`}
                    >
                      {event.title}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-slate-500">
                      {time && (
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3 w-3" />
                          {time}
                        </span>
                      )}
                      {time && course && <span className="text-slate-700">·</span>}
                      {course && <span className="font-mono uppercase tracking-wide">{course}</span>}
                      {source && (
                        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-slate-400">
                          {source}
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`mt-0.5 shrink-0 self-start rounded-full px-2 py-0.5 text-[10px] font-medium ${tone.chip}`}
                  >
                    {relativeLabel(event.startsAt)}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
