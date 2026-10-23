import { ArrowRight, ArrowUpRight, CalendarDays, ClipboardList, Clock3 } from 'lucide-react';
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

interface DueSoonProps {
  events: CalendarEvent[];
  /** When nothing is connected the empty state says what to connect. */
  connected?: boolean;
  onViewCalendar: () => void;
  limit?: number;
}

/**
 * The work queue: everything with a deadline, nearest first.
 *
 * Weekly class blocks are deliberately excluded — they live in Today and the
 * Calendar — so this list answers one question: what do I owe, and when.
 */
export function DueSoon({ events, connected = true, onViewCalendar, limit = 6 }: DueSoonProps) {
  const now = Date.now();
  const work = sortEvents(
    events.filter(
      (event) =>
        event.startsAt &&
        !event.hidden &&
        !isClassEvent(event) &&
        new Date(event.startsAt).getTime() >= now,
    ),
  );
  const shown = work.slice(0, limit);

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
        <span className="plate h-7 w-7">
          <ClipboardList className="h-3.5 w-3.5" strokeWidth={1.9} />
        </span>
        <h2 className="font-display text-[13.5px] font-semibold tracking-[-0.015em] text-ink-1">Due soon</h2>
        <span className="chip font-mono tabular-nums">{work.length}</span>
        <button
          type="button"
          onClick={onViewCalendar}
          className="focus-ring ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-ink-3 transition-colors duration-150 hover:text-ink-1"
        >
          Calendar
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="px-4 py-9 text-center">
          <p className="text-[12.5px] text-ink-2">{connected ? 'Nothing due right now.' : 'Nothing due yet.'}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-4">
            {connected
              ? 'Deadlines from D2L land here as soon as they are posted.'
              : 'Connect D2L or a calendar to fill this in.'}
          </p>
          <button
            type="button"
            onClick={onViewCalendar}
            className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink-1"
          >
            <CalendarDays className="h-3 w-3" />
            Open calendar
          </button>
        </div>
      ) : (
        // Two short columns instead of one long list: six deadlines still fit
        // above the course grid.
        <div className="grid gap-2 p-2.5 sm:grid-cols-2">
          {shown.map((event) => {
            const date = shortDateParts(event.startsAt);
            const course = courseShortCode(event.courseCode);
            const time = timeLabel(event.startsAt);
            const source = sourceLabel(event);
            const tone = urgencyStyles(urgencyFor(event.startsAt));
            return (
              <a
                key={event.id}
                href={event.url ?? undefined}
                target={event.url ? '_blank' : undefined}
                rel={event.url ? 'noreferrer' : undefined}
                className="focus-ring group flex items-center gap-2.5 rounded-[11px] border border-line bg-white/[0.02] px-2.5 py-2 transition-[background-color,border-color] duration-150 hover:border-line-strong hover:bg-white/[0.045]"
              >
                <div className="grid w-9 shrink-0 place-items-center rounded-[9px] border border-line bg-white/[0.03] py-1 leading-none transition-colors duration-150 group-hover:border-line-strong">
                  <span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-ink-4">
                    {date.month}
                  </span>
                  <span className="mt-0.5 font-display text-[14px] font-semibold tabular-nums text-ink-1">
                    {date.day}
                  </span>
                  <span className={`mt-[3px] h-[3px] w-[3px] rounded-full ${tone.dot}`} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[12.5px] font-medium leading-snug ${tone.title}`} title={event.title}>
                    {event.title}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-3">
                    {course && (
                      <span className="truncate font-mono uppercase tracking-[0.05em] text-ink-2">{course}</span>
                    )}
                    {course && time && <span className="text-ink-4">·</span>}
                    {time && (
                      <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                        <Clock3 className="h-2.5 w-2.5" />
                        {time}
                      </span>
                    )}
                    {source && (
                      <span className="shrink-0 rounded bg-white/[0.06] px-1 py-px text-[9px] font-medium uppercase tracking-wide text-ink-3">
                        {source}
                      </span>
                    )}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium tabular-nums ${tone.chip}`}
                >
                  {relativeLabel(event.startsAt)}
                </span>
                <ArrowUpRight className="hidden h-3 w-3 shrink-0 text-ink-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 sm:block" />
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
