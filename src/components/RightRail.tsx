import { Plug, RefreshCw, ServerCog } from 'lucide-react';
import type { CalendarEvent } from '../../shared/types';
import { hostLabel, syncTime } from '../lib/format';
import { TodaySchedule } from './TodaySchedule';
import { UpNext } from './UpNext';

interface RightRailProps {
  events: CalendarEvent[];
  connected: boolean;
  baseUrl: string;
  savedAt: string | null;
  fetchedAt: string;
  onViewCalendar: () => void;
  onManage: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export function RightRail({
  events,
  connected,
  baseUrl,
  savedAt,
  fetchedAt,
  onViewCalendar,
  onManage,
  onRefresh,
  refreshing,
}: RightRailProps) {
  return (
    <aside className="space-y-4">
      <UpNext events={events} connected={connected} onViewCalendar={onViewCalendar} />

      <TodaySchedule events={events} onEdit={onViewCalendar} />

      <section className="panel p-4">
        <div className="flex items-center gap-2">
          <ServerCog className="h-3.5 w-3.5 text-ink-4" />
          <h2 className="font-display text-[13px] font-semibold text-ink-1">Session</h2>
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
              connected
                ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/20'
                : 'bg-amber-400/10 text-amber-300 ring-1 ring-inset ring-amber-400/20'
            }`}
          >
            {connected ? 'Live' : 'Not connected'}
          </span>
        </div>
        <dl className="mt-3 space-y-2 text-[11.5px]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-4">School</dt>
            <dd className="truncate font-medium text-ink-2" title={baseUrl}>
              {hostLabel(baseUrl)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-4">Signed in</dt>
            <dd className="text-ink-2">{savedAt ? new Date(savedAt).toLocaleDateString('en-CA') : '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-4">Last sync</dt>
            <dd className="text-ink-2">{syncTime(fetchedAt)}</dd>
          </div>
        </dl>
        <div className="mt-3 flex gap-2">
          {!connected && (
            <button
              type="button"
              onClick={onManage}
              className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.09] py-1.5 text-[11.5px] font-medium text-amber-100 transition hover:border-amber-300/40 hover:bg-amber-400/[0.16]"
            >
              <Plug className="h-3 w-3" />
              Connect D2L
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-1 py-1.5 text-[11.5px] font-medium text-ink-2 transition hover:border-white/15 hover:text-ink-1 disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            Sync now
          </button>
          <button
            type="button"
            onClick={onManage}
            className="focus-ring rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-[11.5px] font-medium text-ink-2 transition hover:border-white/15 hover:text-ink-1"
          >
            Manage
          </button>
        </div>
      </section>
    </aside>
  );
}
