import { Plug, RefreshCw, ServerCog } from 'lucide-react';
import { hostLabel, syncTime } from '../lib/format';

interface SessionBarProps {
  connected: boolean;
  baseUrl: string;
  savedAt: string | null;
  fetchedAt: string;
  onManage: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

/**
 * Sync state, kept out of the way at the foot of the overview: one line of
 * facts and the three actions that change them.
 */
export function SessionBar({
  connected,
  baseUrl,
  savedAt,
  fetchedAt,
  onManage,
  onRefresh,
  refreshing,
}: SessionBarProps) {
  return (
    <section className="panel flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <ServerCog className="h-3.5 w-3.5 text-ink-4" strokeWidth={1.9} />
        <h2 className="font-display text-[12px] font-semibold tracking-[-0.01em] text-ink-1">Session</h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[9.5px] font-semibold uppercase tracking-[0.08em] ${
            connected
              ? 'border-emerald-400/25 bg-emerald-400/[0.09] text-emerald-300'
              : 'border-amber-400/25 bg-amber-400/[0.09] text-amber-300'
          }`}
        >
          <span className={`h-1 w-1 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {connected ? 'Live' : 'Offline'}
        </span>
      </div>

      <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11.5px]">
        <div className="flex items-center gap-1.5">
          <dt className="text-ink-4">School</dt>
          <dd className="max-w-[180px] truncate font-medium text-ink-2" title={baseUrl}>
            {hostLabel(baseUrl)}
          </dd>
        </div>
        <div className="flex items-center gap-1.5 border-l border-line pl-5">
          <dt className="text-ink-4">Signed in</dt>
          <dd className="tabular-nums text-ink-2">
            {savedAt ? new Date(savedAt).toLocaleDateString('en-CA') : '—'}
          </dd>
        </div>
        <div className="flex items-center gap-1.5 border-l border-line pl-5">
          <dt className="text-ink-4">Last sync</dt>
          <dd className="tabular-nums text-ink-2">{syncTime(fetchedAt)}</dd>
        </div>
      </dl>

      <div className="ml-auto flex items-center gap-1.5">
        {!connected && (
          <button
            type="button"
            onClick={onManage}
            className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-lg border border-violet-400/30 bg-violet-500/[0.13] px-2.5 text-[11px] font-medium text-violet-100 transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-out)] hover:border-violet-300/50 hover:bg-violet-500/[0.2] active:scale-[0.985]"
          >
            <Plug className="h-3 w-3" />
            Connect
          </button>
        )}
        <button type="button" onClick={onRefresh} disabled={refreshing} className="btn btn-sm focus-ring">
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          Sync now
        </button>
        <button type="button" onClick={onManage} className="btn btn-sm focus-ring">
          Manage
        </button>
      </div>
    </section>
  );
}
