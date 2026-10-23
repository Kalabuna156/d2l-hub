import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  FileText,
  GraduationCap,
  Loader2,
  Megaphone,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import type { AppNotification, NotificationFeed } from '../../shared/types';
import { fetchNotifications, markNotificationsRead } from '../lib/api';

const PAGE = 5;

const KIND_ICON = {
  grade: GraduationCap,
  content: FileText,
  announcement: Megaphone,
  message: MessageSquare,
  other: Bell,
} as const;

/** "today at 8:39 p.m." / "yesterday at 11:42 p.m." / "Oct 18 at 9:04 a.m." */
function activityTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const time = date.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfThatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfToday - startOfThatDay) / 86_400_000);

  if (days === 0) return `today at ${time}`;
  if (days === 1) return `yesterday at ${time}`;
  return `${date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} at ${time}`;
}

function Item({ item, onNavigate }: { item: AppNotification; onNavigate: () => void }) {
  const Icon = KIND_ICON[item.kind] ?? Bell;
  const meta = [item.categoryLabel, item.courseName].filter(Boolean).join(' - ');

  return (
    <a
      href={item.url ?? undefined}
      target={item.url ? '_blank' : undefined}
      rel="noreferrer"
      onClick={() => {
        if (item.url) onNavigate();
      }}
      className={`flex gap-3 border-b border-line px-3.5 py-3 transition last:border-b-0 ${
        item.read ? 'hover:bg-surface-1' : 'bg-surface-1 hover:bg-surface-1'
      } ${item.url ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line bg-surface-1 text-ink-2">
        <Icon className="h-3.5 w-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={`text-[12.5px] leading-snug ${
            item.read ? 'text-ink-2' : 'font-medium text-sky-300'
          }`}
        >
          {item.title}
        </p>
        <div className="mt-1 flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-[10.5px] leading-relaxed text-ink-3">{meta}</p>
          <span className="shrink-0 text-[10.5px] text-ink-3">{activityTime(item.createdAt)}</span>
        </div>
      </div>

      {!item.read && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />}
    </a>
  );
}

export function NotificationsBell({ connected }: { connected: boolean }) {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async (nextLimit: number) => {
    setLoading(true);
    try {
      const result = await fetchNotifications(nextLimit);
      setFeed(result);
      setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  // One fetch on mount keeps the badge honest without opening the panel.
  useEffect(() => {
    void load(limit);
  }, [load, limit]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!open) void load(limit);
    }, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [load, limit, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = feed?.unread ?? 0;
  const items = feed?.items ?? [];
  const total = feed?.total ?? 0;

  const markAllRead = async () => {
    setBusy(true);
    try {
      const next = await markNotificationsRead();
      // Keep the panel at the number of rows it was showing.
      setFeed({ ...next, items: next.items.slice(0, limit) });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark notifications as read.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          // Opening the bell always starts from the five newest updates.
          if (next) {
            if (limit === PAGE) void load(PAGE);
            else setLimit(PAGE);
          }
        }}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
        aria-expanded={open}
        title="Notifications"
        className="focus-ring relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface-1 text-ink-2 transition hover:border-white/15 hover:bg-surface-2 hover:text-white"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9.5px] font-semibold leading-none text-white ring-2 ring-[var(--chrome-solid)]">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="pane-float animate-pop absolute right-0 top-[calc(100%+10px)] z-50 w-[372px] max-w-[calc(100vw-2rem)] overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <Bell className="h-3.5 w-3.5 text-violet-300" />
            <h3 className="font-display text-[13px] font-semibold tracking-[-0.01em] text-ink-1">Notifications</h3>
            {unread > 0 && (
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-200">
                {unread} new
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => void load(limit)}
                aria-label="Refresh notifications"
                title="Refresh"
                className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-ink-3 transition hover:bg-surface-2 hover:text-white"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => void markAllRead()}
                disabled={busy || unread === 0}
                aria-label="Mark all as read"
                title="Mark all as read"
                className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-ink-3 transition hover:bg-surface-2 hover:text-white disabled:opacity-35"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 border-b border-amber-400/15 bg-amber-400/[0.06] px-4 py-2.5 text-[11.5px] leading-relaxed text-amber-100/85">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="max-h-[420px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-12 text-[12px] text-ink-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading updates…
              </div>
            ) : !connected && items.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-[12.5px] text-ink-2">Connect D2L to see updates</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
                  New grades, course content and announcements show up here.
                </p>
              </div>
            ) : items.length === 0 && error ? (
              <div className="px-6 py-10 text-center">
                <p className="text-[12.5px] text-ink-2">Nothing to show yet</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
                  Updates appear here as D2L reports them. Use the refresh button if you just added a course.
                </p>
              </div>
            ) : items.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-[12.5px] text-ink-2">You’re all caught up</p>
                <p className="mt-1 text-[11px] text-ink-3">Nothing new in your courses right now.</p>
              </div>
            ) : (
              items.map((item) => <Item key={item.id} item={item} onNavigate={() => setOpen(false)} />)
            )}
          </div>

          {total > items.length && (
            <div className="border-t border-line p-2.5">
              <button
                type="button"
                onClick={() => setLimit((current) => Math.min(80, current + PAGE))}
                disabled={loading}
                className="focus-ring w-full rounded-xl bg-surface-2 px-3 py-2 text-[12px] font-medium text-ink-1 transition hover:bg-surface-3 disabled:opacity-50"
              >
                {loading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
