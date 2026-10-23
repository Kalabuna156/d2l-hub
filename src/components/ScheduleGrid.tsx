import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, RefreshCw, School } from 'lucide-react';
import type { CalendarEvent } from '../../shared/types';
import { saveEventOverride, updateLocalEvent } from '../lib/api';
import { syncTime } from '../lib/format';
import {
  addDays,
  dragRange,
  HOUR_HEIGHT,
  hourLabel,
  isSameDay,
  layoutWeek,
  startOfWeek,
  timeRangeLabel,
  weekDays,
  weekLabel,
  type ScheduleBlock,
} from '../lib/schedule';

interface ScheduleGridProps {
  events: CalendarEvent[];
  fetchedAt: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onEdit: (event: CalendarEvent) => void;
  onCreate: (startsAt: string, endsAt: string) => void;
  /** Called after a dragged block was saved, so the page can reload. */
  onMoved?: () => void;
  /** Week to show when the Calendar tab owns the range controls. */
  weekStart?: Date;
  /** Hides the grid's own title and navigation, for the Calendar tab toolbar. */
  embedded?: boolean;
}

/** Shown on the empty space under the pointer, before the click lands. */
interface HoverSlot {
  day: string;
  minutes: number;
}

/** A click-and-drag in progress on one day column. */
interface DragSession {
  day: string;
  anchor: number;
  current: number;
  moved: boolean;
}

/** Dragging an existing block: move it, or pull one of its edges. */
interface BlockDrag {
  kind: 'move' | 'resize-start' | 'resize-end';
  id: string;
  dayIndex: number;
  /** Original minutes within the day, kept so every move starts from here. */
  startMin: number;
  endMin: number;
  previewDay: number;
  previewStart: number;
  previewEnd: number;
  anchorX: number;
  anchorY: number;
  columnWidth: number;
  moved: boolean;
}

/** Only events this app can write to are draggable. */
function canMove(event: CalendarEvent): boolean {
  return event.source === 'local' || event.source === 'form' || event.source === 'google';
}

export function ScheduleGrid({
  events,
  fetchedAt,
  refreshing,
  onRefresh,
  onEdit,
  onCreate,
  onMoved,
  weekStart: weekStartProp,
  embedded = false,
}: ScheduleGridProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  // The Calendar tab drives the week; without it the grid keeps its own state.
  const viewedWeek = weekStartProp ?? weekStart;
  const [hover, setHover] = useState<HoverSlot | null>(null);
  const [drag, setDrag] = useState<DragSession | null>(null);
  const [blockDrag, setBlockDrag] = useState<BlockDrag | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  // A saved drag shows at its new spot until the reload lands, then the server wins.
  const [pending, setPending] = useState<Record<string, { startsAt: string; endsAt: string }>>({});
  // The window listeners need the live column and session without re-binding.
  const dragRef = useRef<DragSession | null>(null);
  const columnRef = useRef<HTMLDivElement | null>(null);
  const blockDragRef = useRef<BlockDrag | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    setPending({});
  }, [events]);

  const displayEvents = useMemo(
    () =>
      events.map((event) => {
        const shift = pending[event.id];
        return shift ? { ...event, ...shift } : event;
      }),
    [events, pending],
  );

  const days = useMemo(() => weekDays(viewedWeek), [viewedWeek]);
  const layout = useMemo(
    () => layoutWeek(displayEvents, viewedWeek),
    [displayEvents, viewedWeek],
  );
  const classes = useMemo(
    () =>
      displayEvents.filter(
        (event) => event.startsAt && event.endsAt && event.source !== 'form',
      ),
    [displayEvents],
  );
  const calendarName =
    classes.find((event) => event.source === 'google' && event.calendarName)?.calendarName ??
    classes.find((event) => event.calendarName)?.calendarName ??
    null;
  const hiddenThisWeek = useMemo(() => {
    const start = days[0].getTime();
    const end = addDays(days[0], 7).getTime();
    return events.filter((event) => {
      if (!event.hidden || !event.startsAt) return false;
      const at = new Date(event.startsAt).getTime();
      return at >= start && at < end;
    });
  }, [events, days]);

  const now = new Date();
  const todayIndex = days.findIndex((day) => isSameDay(day, now));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine =
    todayIndex >= 0 && nowMinutes >= layout.startMin && nowMinutes <= layout.endMin;

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let hour = Math.floor(layout.startMin / 60); hour <= Math.floor(layout.endMin / 60); hour += 1) {
      list.push(hour);
    }
    return list;
  }, [layout.startMin, layout.endMin]);

  const onCurrentWeek = viewedWeek.getTime() === startOfWeek(new Date()).getTime();

  /** Time from a pointer position, snapped down to the half hour like Google's grid. */
  const slotAt = (mouse: React.MouseEvent<HTMLDivElement>): number => {
    const rect = mouse.currentTarget.getBoundingClientRect();
    const minutes = layout.startMin + ((mouse.clientY - rect.top) / HOUR_HEIGHT) * 60;
    return Math.max(0, Math.min(layout.endMin - 60, Math.floor(minutes / 30) * 30));
  };

  const dateAt = (day: Date, minutes: number) => {
    const value = new Date(day);
    value.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    return value;
  };

  const slotDates = (day: Date, minutes: number) => {
    const start = dateAt(day, minutes);
    const end = new Date(start.getTime() + 60 * 60_000);
    return { start, end };
  };

  /** Pointer position as minutes, snapped to 15 minutes while dragging. */
  const dragMinutes = (element: HTMLElement, clientY: number): number => {
    const rect = element.getBoundingClientRect();
    const minutes = layout.startMin + ((clientY - rect.top) / HOUR_HEIGHT) * 60;
    return Math.max(layout.startMin, Math.min(layout.endMin, Math.round(minutes / 15) * 15));
  };

  const startDrag = (mouse: React.MouseEvent<HTMLDivElement>, dayKey: string) => {
    if (mouse.button !== 0 || mouse.target !== mouse.currentTarget) return;
    // Stop the browser from starting a text selection across the grid.
    mouse.preventDefault();
    columnRef.current = mouse.currentTarget;
    const anchor = dragMinutes(mouse.currentTarget, mouse.clientY);
    const session: DragSession = { day: dayKey, anchor, current: anchor, moved: false };
    dragRef.current = session;
    setHover(null);
    setDrag(session);
  };

  const dragging = drag !== null;

  useEffect(() => {
    if (!dragging) return;

    const move = (mouse: MouseEvent) => {
      const element = columnRef.current;
      const session = dragRef.current;
      if (!element || !session) return;
      const current = dragMinutes(element, mouse.clientY);
      if (current === session.current) return;
      dragRef.current = { ...session, current, moved: true };
      setDrag(dragRef.current);
    };

    const finish = () => {
      const session = dragRef.current;
      dragRef.current = null;
      columnRef.current = null;
      setDrag(null);
      if (!session) return;

      const day = days.find((candidate) => candidate.toISOString() === session.day);
      if (!day) return;

      // A press that never moved keeps the plain one-hour click behaviour.
      if (!session.moved) {
        const startMin = Math.min(session.anchor, layout.endMin - 60);
        onCreate(dateAt(day, startMin).toISOString(), dateAt(day, startMin + 60).toISOString());
        return;
      }

      const range = dragRange(session.anchor, session.current, layout.endMin);
      onCreate(dateAt(day, range.startMin).toISOString(), dateAt(day, range.endMin).toISOString());
    };

    const cancel = () => {
      dragRef.current = null;
      columnRef.current = null;
      setDrag(null);
    };

    // Listening on the window means the drag still finishes when the pointer
    // leaves the column, or is released over another day.
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', finish);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', finish);
      window.removeEventListener('blur', cancel);
    };
  }, [dragging, days, layout.endMin, onCreate]);

  const startBlockDrag = (
    mouse: React.MouseEvent<HTMLElement>,
    block: ScheduleBlock,
    kind: BlockDrag['kind'],
    dayIndex: number,
  ) => {
    if (mouse.button !== 0) return;
    // The day column below starts its own drag if this is not stopped.
    mouse.preventDefault();
    mouse.stopPropagation();
    const column = (mouse.currentTarget as HTMLElement).closest<HTMLElement>('[data-day-index]');
    if (!column) return;
    const rect = column.getBoundingClientRect();
    const session: BlockDrag = {
      kind,
      id: block.event.id,
      dayIndex,
      startMin: block.startMin,
      endMin: block.endMin,
      previewDay: dayIndex,
      previewStart: block.startMin,
      previewEnd: block.endMin,
      anchorX: mouse.clientX,
      anchorY: mouse.clientY,
      columnWidth: Math.max(1, rect.width),
      moved: false,
    };
    blockDragRef.current = session;
    setBlockError(null);
    setHover(null);
    setBlockDrag(session);
  };

  const movingBlock = blockDrag !== null;

  useEffect(() => {
    if (!movingBlock) return;

    const move = (mouse: MouseEvent) => {
      const session = blockDragRef.current;
      if (!session) return;

      // 15 minute steps, measured from the original position so nothing drifts.
      const delta = Math.round(((mouse.clientY - session.anchorY) / HOUR_HEIGHT) * 4) * 15;
      const dayDelta = Math.round((mouse.clientX - session.anchorX) / session.columnWidth);
      let previewDay = session.dayIndex;
      let previewStart = session.startMin;
      let previewEnd = session.endMin;

      if (session.kind === 'move') {
        const duration = session.endMin - session.startMin;
        previewStart = Math.max(0, Math.min(24 * 60 - duration, session.startMin + delta));
        previewEnd = previewStart + duration;
        previewDay = Math.max(0, Math.min(6, session.dayIndex + dayDelta));
      } else if (session.kind === 'resize-start') {
        previewStart = Math.max(0, Math.min(session.endMin - 15, session.startMin + delta));
      } else {
        previewEnd = Math.max(session.startMin + 15, Math.min(24 * 60, session.endMin + delta));
      }

      const moved =
        previewStart !== session.startMin ||
        previewEnd !== session.endMin ||
        previewDay !== session.dayIndex;
      if (
        moved === session.moved &&
        previewStart === session.previewStart &&
        previewEnd === session.previewEnd &&
        previewDay === session.previewDay
      ) {
        return;
      }
      blockDragRef.current = { ...session, previewStart, previewEnd, previewDay, moved };
      setBlockDrag(blockDragRef.current);
    };

    const finish = () => {
      const session = blockDragRef.current;
      blockDragRef.current = null;
      setBlockDrag(null);
      if (!session || !session.moved) return;

      // The release also fires a click on the block; that must not open the dialog.
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);

      const event = events.find((candidate) => candidate.id === session.id);
      const day = days[session.previewDay];
      if (!event || !day) return;

      const startsAt = dateAt(day, session.previewStart).toISOString();
      const endsAt = dateAt(day, session.previewEnd).toISOString();
      setPending((current) => ({ ...current, [event.id]: { startsAt, endsAt } }));

      void (async () => {
        try {
          if (event.source === 'local') {
            await updateLocalEvent(event.id, {
              title: event.title,
              location: event.location ?? null,
              startsAt,
              endsAt,
            });
          } else if (event.source === 'google') {
            // Pinned locally: the feed itself is still read-only.
            await saveEventOverride(event.id, { startsAt, endsAt });
          } else {
            return;
          }
          onMoved?.();
        } catch (error) {
          setPending((current) => {
            const next = { ...current };
            delete next[event.id];
            return next;
          });
          setBlockError(
            error instanceof Error ? error.message : 'Could not move that event.',
          );
        }
      })();
    };

    const cancel = () => {
      blockDragRef.current = null;
      setBlockDrag(null);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', finish);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', finish);
      window.removeEventListener('blur', cancel);
    };
  }, [movingBlock, days, events, onMoved]);

  /** Header shortcut: the next half hour today, or 9am on the viewed week. */
  const addDefault = () => {
    const base = new Date();
    if (!days.some((day) => isSameDay(day, base))) {
      base.setTime(days[0].getTime());
      base.setHours(9, 0, 0, 0);
    } else {
      base.setSeconds(0, 0);
      base.setMinutes(base.getMinutes() < 30 ? 30 : 60);
      if (base.getHours() >= 21) {
        base.setDate(base.getDate() + 1);
        base.setHours(9, 0, 0, 0);
      }
    }
    onCreate(base.toISOString(), new Date(base.getTime() + 60 * 60_000).toISOString());
  };

  return (
    <section className={embedded ? 'overflow-hidden' : 'panel overflow-hidden'}>
      {!embedded && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-white/[0.06] px-4 py-3">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-sky-400/15 text-sky-200 ring-1 ring-inset ring-sky-300/25">
            <School className="h-3.5 w-3.5" />
          </span>
          <h2 className="font-display text-[13px] font-semibold text-slate-100">Class week</h2>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-slate-400">
            {layout.blocks.length}
          </span>
          {calendarName && (
            <span className="hidden truncate text-[11px] text-slate-600 sm:block">· {calendarName}</span>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden items-center gap-1 text-[10.5px] text-slate-600 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
              Updated {syncTime(fetchedAt)}
            </span>
            <button
              type="button"
              onClick={addDefault}
              aria-label="Add event"
              title="Add an event"
              className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-slate-200"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Sync calendars now"
              title="Sync calendars now"
              className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-slate-200 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <div className="flex items-center rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
              <button
                type="button"
                onClick={() => setWeekStart((current) => addDays(current, -7))}
                aria-label="Previous week"
                className="focus-ring grid h-6 w-6 place-items-center rounded-md text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setWeekStart(startOfWeek(new Date()))}
                disabled={onCurrentWeek}
                className="focus-ring rounded-md px-2 text-[10.5px] font-medium text-slate-400 transition hover:bg-white/[0.08] hover:text-white disabled:text-slate-600 disabled:hover:bg-transparent"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setWeekStart((current) => addDays(current, 7))}
                aria-label="Next week"
                className="focus-ring grid h-6 w-6 place-items-center rounded-md text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {blockError && (
        <div className="flex items-center gap-2 border-b border-rose-400/20 bg-rose-500/[0.07] px-4 py-2 text-[11.5px] text-rose-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{blockError}</span>
          <button
            type="button"
            onClick={() => setBlockError(null)}
            className="focus-ring rounded px-1 text-[10.5px] text-rose-300/70 hover:text-rose-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-2.5">
        {!embedded && (
          <p className="font-display text-[13.5px] font-semibold text-white">{weekLabel(viewedWeek)}</p>
        )}
        <p className={`text-[10.5px] text-slate-600 ${embedded ? 'ml-auto' : ''}`}>
          {layout.blocks.length === 0
            ? 'No classes — click or drag a free slot to add an event'
            : `${layout.blocks.length} ${layout.blocks.length === 1 ? 'class' : 'classes'} · click or drag free space to add`}
        </p>
      </div>

      <div className="px-2 pb-3 pt-1">
        <div className="grid grid-cols-[46px_repeat(7,minmax(0,1fr))]">
          <div />
          {days.map((day, index) => {
            const isToday = index === todayIndex;
            return (
              <div key={day.toISOString()} className="flex flex-col items-center gap-1 pb-2">
                <span className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-slate-500">
                  {day.toLocaleDateString('en-CA', { weekday: 'short' })}
                </span>
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-[12px] font-semibold ${
                    isToday ? 'bg-[#8ab4f8] text-[#0b1220]' : 'text-slate-300'
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Plain overflow: once this grid hits its end the wheel carries on to
            the page, so Upcoming sits right below instead of trapping the scroll. */}
        <div
          className={`max-h-[560px] overflow-y-auto ${dragging || movingBlock ? 'select-none' : ''}`}
        >
          <div className="grid grid-cols-[46px_repeat(7,minmax(0,1fr))] pt-2">
            <div className="relative" style={{ height: layout.height }}>
              {hours.map((hour) => (
                <span
                  key={hour}
                  className="absolute right-2 -translate-y-1/2 text-[9.5px] tabular-nums text-slate-600"
                  style={{ top: ((hour * 60 - layout.startMin) / 60) * HOUR_HEIGHT }}
                >
                  {hourLabel(hour)}
                </span>
              ))}
            </div>

            {days.map((day, dayIndex) => {
              const key = day.toISOString();
              const ghost = hover?.day === key ? slotDates(day, hover.minutes) : null;
              const selection =
                drag?.day === key && drag.moved
                  ? dragRange(drag.anchor, drag.current, layout.endMin)
                  : null;
              const movingPreview = blockDrag?.moved && blockDrag.previewDay === dayIndex ? blockDrag : null;
              const movingEvent = movingPreview
                ? layout.blocks.find((block) => block.event.id === movingPreview.id)
                : null;
              return (
                <div
                  key={key}
                  data-day-index={dayIndex}
                  tabIndex={-1}
                  aria-label={`Add an event on ${day.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' })}`}
                  title="Click or drag a free slot to add an event"
                  onMouseDown={(mouse) => startDrag(mouse, key)}
                  onMouseMove={(mouse) => {
                    // The window listeners own the pointer while a drag runs.
                    if (dragRef.current || blockDragRef.current) return;
                    // Over an event block: stay quiet, the block is the target.
                    if (mouse.target !== mouse.currentTarget) {
                      if (hover?.day === key) setHover(null);
                      return;
                    }
                    const minutes = slotAt(mouse);
                    if (hover?.day === key && hover.minutes === minutes) return;
                    setHover({ day: key, minutes });
                  }}
                  onMouseLeave={() => {
                    if (dragRef.current || blockDragRef.current) return;
                    setHover((current) => (current?.day === key ? null : current));
                  }}
                  className={`relative cursor-pointer border-l border-white/[0.055] transition hover:bg-white/[0.015] ${
                    dayIndex === todayIndex ? 'bg-[#8ab4f8]/[0.035]' : ''
                  }`}
                  style={{ height: layout.height }}
                >
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="pointer-events-none absolute inset-x-0 border-t border-white/[0.045]"
                      style={{ top: ((hour * 60 - layout.startMin) / 60) * HOUR_HEIGHT }}
                    />
                  ))}

                  {/* A block being moved or resized follows the pointer here. */}
                  {movingPreview && movingEvent && (
                    <div
                      className="pointer-events-none absolute z-[7] overflow-hidden rounded-[5px] border border-violet-200/80 bg-violet-500/40 px-1.5 py-1 text-violet-50 shadow-lg shadow-black/40"
                      style={{
                        top:
                          ((movingPreview.previewStart - layout.startMin) / 60) * HOUR_HEIGHT,
                        height: Math.max(
                          22,
                          ((movingPreview.previewEnd - movingPreview.previewStart) / 60) *
                            HOUR_HEIGHT -
                            2,
                        ),
                        left: `calc(${movingEvent.leftPct}% + 1px)`,
                        width: `calc(${movingEvent.widthPct}% - 3px)`,
                      }}
                    >
                      <p className="line-clamp-2 break-words text-[10.5px] font-semibold leading-[1.15]">
                        {movingEvent.event.title}
                      </p>
                      <p className="mt-0.5 truncate text-[9.5px] leading-tight opacity-80">
                        {timeRangeLabel(
                          dateAt(day, movingPreview.previewStart).toISOString(),
                          dateAt(day, movingPreview.previewEnd).toISOString(),
                        )}
                      </p>
                    </div>
                  )}

                  {/* The range being dragged out, in Google's translucent style. */}
                  {selection && (
                    <div
                      className="pointer-events-none absolute inset-x-0.5 z-[6] overflow-hidden rounded-[5px] border border-violet-300/80 bg-violet-500/30 px-1.5 py-1 text-violet-50"
                      style={{
                        top: ((selection.startMin - layout.startMin) / 60) * HOUR_HEIGHT,
                        height: Math.max(
                          14,
                          ((selection.endMin - selection.startMin) / 60) * HOUR_HEIGHT - 2,
                        ),
                      }}
                    >
                      <p className="truncate text-[10px] font-semibold leading-tight">+ New event</p>
                      <p className="truncate text-[9.5px] leading-tight opacity-80">
                        {timeRangeLabel(
                          dateAt(day, selection.startMin).toISOString(),
                          dateAt(day, selection.endMin).toISOString(),
                        )}
                      </p>
                    </div>
                  )}

                  {layout.blocks
                    .filter((block) => block.event.startsAt && isSameDay(new Date(block.event.startsAt), day))
                    .map((block) => {
                      const event = block.event;
                      const movable = canMove(event);
                      const isMoving = blockDrag?.id === event.id && blockDrag.moved;
                      const range = timeRangeLabel(event.startsAt!, event.endsAt);
                      const tip = [
                        event.title,
                        range,
                        event.location,
                        movable ? 'Click to edit · drag to move' : 'Click to edit',
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      const blockClass = `focus-ring absolute overflow-hidden rounded-[5px] px-1.5 py-1 text-left shadow-sm shadow-black/30 transition ${
                        movable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                      } ${isMoving ? 'opacity-25' : ''} ${
                        event.source === 'local'
                          ? 'border border-dashed border-white/40 bg-violet-400 text-[#0b0f1a] hover:bg-violet-300'
                          : 'bg-[#8ab4f8] text-[#0b1220] hover:bg-[#a4c6fb]'
                      }`;
                      const style = {
                        top: block.top,
                        height: block.height,
                        left: `calc(${block.leftPct}% + 1px)`,
                        width: `calc(${block.widthPct}% - 3px)`,
                      };
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onMouseDown={
                            movable
                              ? (mouse) => startBlockDrag(mouse, block, 'move', dayIndex)
                              : undefined
                          }
                          onClick={() => {
                            // A finished drag also releases a click on the block.
                            if (suppressClickRef.current) return;
                            onEdit(event);
                          }}
                          title={tip}
                          className={blockClass}
                          style={style}
                        >
                          {movable && (
                            <>
                              <span
                                role="presentation"
                                onMouseDown={(mouse) =>
                                  startBlockDrag(mouse, block, 'resize-start', dayIndex)
                                }
                                className="absolute inset-x-0 top-0 z-10 h-2 cursor-ns-resize"
                              />
                              <span
                                role="presentation"
                                onMouseDown={(mouse) =>
                                  startBlockDrag(mouse, block, 'resize-end', dayIndex)
                                }
                                className="absolute inset-x-0 bottom-0 z-10 h-2 cursor-ns-resize"
                              />
                            </>
                          )}
                          <p className="line-clamp-2 break-words text-[10.5px] font-semibold leading-[1.15]">
                            {event.title}
                          </p>
                          {block.height > 32 && (
                            <p className="mt-0.5 truncate text-[9.5px] font-medium opacity-75">{range}</p>
                          )}
                          {block.height > 46 && event.location && (
                            <p className="truncate text-[9.5px] opacity-70">{event.location}</p>
                          )}
                          {event.edited && (
                            <span className="absolute right-1 top-1 h-1 w-1 rounded-full bg-[#0b1220]/45" />
                          )}
                        </button>
                      );
                    })}

                  {/* The half-hour draft under the pointer, before the click. */}
                  {ghost && (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-[5] overflow-hidden rounded-[5px] border border-dashed border-violet-300/70 bg-violet-500/25 px-1.5 py-1 text-violet-50"
                      style={{
                        top: ((hover!.minutes - layout.startMin) / 60) * HOUR_HEIGHT,
                        height: HOUR_HEIGHT - 2,
                      }}
                    >
                      <p className="truncate text-[10px] font-semibold leading-tight">+ New event</p>
                      <p className="truncate text-[9.5px] leading-tight opacity-80">
                        {timeRangeLabel(ghost.start.toISOString(), ghost.end.toISOString())}
                      </p>
                    </div>
                  )}

                  {showNowLine && dayIndex === todayIndex && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10"
                      style={{ top: ((nowMinutes - layout.startMin) / 60) * HOUR_HEIGHT }}
                    >
                      <div className="relative h-px bg-rose-400/80">
                        <span className="absolute -left-1 -top-[3px] h-1.5 w-1.5 rounded-full bg-rose-400" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {hiddenThisWeek.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-4 py-2.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-600">
            Hidden this week
          </span>
          {hiddenThisWeek.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onEdit(event)}
              title="Click to show or edit"
              className="focus-ring rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10.5px] text-slate-500 transition hover:border-white/20 hover:text-slate-200"
            >
              <span className="line-through">{event.title}</span>
              <span className="ml-1.5 text-slate-600">
                {event.startsAt
                  ? new Date(event.startsAt).toLocaleDateString('en-CA', { weekday: 'short' })
                  : ''}
              </span>
            </button>
          ))}
          <span className="text-[10.5px] text-slate-600">click to restore</span>
        </div>
      )}
    </section>
  );
}
