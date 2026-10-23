import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { AppState, ConnectStatus } from '../../shared/types';
import { cancelConnect, connectD2L, disconnectD2L, fetchConnectStatus, saveBaseUrl } from '../lib/api';

interface ConnectDialogProps {
  open: boolean;
  state: AppState | null;
  onClose: () => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

const STEPS = [
  'A Chrome window opens on your school’s D2L sign-in page.',
  'You sign in through the normal Microsoft / TMU login.',
  'The window closes and your courses load into this dashboard.',
];

export function ConnectDialog({ open, state, onClose, onConnected, onDisconnected }: ConnectDialogProps) {
  const [baseUrl, setBaseUrl] = useState(state?.baseUrl ?? '');
  const [phase, setPhase] = useState<ConnectStatus>({ phase: 'idle', message: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onConnectedRef.current = onConnected;
    onDisconnectedRef.current = onDisconnected;
    onCloseRef.current = onClose;
  }, [onConnected, onDisconnected, onClose]);

  useEffect(() => {
    if (!open) return;
    setBaseUrl(state?.baseUrl ?? '');
    setError(null);
    void fetchConnectStatus()
      .then(setPhase)
      .catch(() => undefined);
  }, [open, state?.baseUrl]);

  // Poll while the dialog is open so the UI follows the sign-in window.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const tick = async () => {
      try {
        const status = await fetchConnectStatus();
        if (!alive) return;
        setPhase(status);
        if (status.phase === 'connected') {
          onConnectedRef.current();
          onCloseRef.current();
        }
      } catch {
        /* the server may briefly restart; the next tick retries */
      }
    };
    void tick();
    const timer = window.setInterval(tick, 1500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && phase.phase !== 'waiting') onCloseRef.current();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, phase.phase]);

  if (!open) return null;

  const chromeMissing = state?.chromeAvailable === false;
  const waiting = phase.phase === 'waiting';

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await saveBaseUrl(baseUrl);
      setBaseUrl(saved.baseUrl);
      const status = await connectD2L(saved.baseUrl);
      setPhase(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the sign-in window.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    try {
      await cancelConnect();
      setPhase({ phase: 'idle', message: '' });
    } catch {
      /* ignore */
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectD2L();
      onDisconnectedRef.current();
      setPhase({ phase: 'idle', message: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-[6px]"
      role="dialog"
      aria-modal="true"
      aria-label="Connect your D2L account"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !waiting) onClose();
      }}
    >
      <div className="pane-float animate-pop w-full max-w-[480px] overflow-hidden">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-700 shadow-lg shadow-violet-950/60">
            <Globe className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[15px] font-semibold tracking-[-0.02em] text-ink-1">Your D2L connection</h2>
            <p className="mt-0.5 text-[12px] text-ink-3">
              {state?.connected ? 'Signed in. Manage this device’s session below.' : 'Sign in once — the dashboard keeps the session.'}
            </p>
          </div>
          {!waiting && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-ink-3 transition hover:bg-white/10 hover:text-ink-1"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="px-5 py-4">
          {waiting ? (
            <div className="flex flex-col items-center py-6 text-center">
              <span className="relative grid h-12 w-12 place-items-center">
                <span className="absolute inset-0 rounded-full border border-violet-400/30" />
                <Loader2 className="h-6 w-6 animate-spin text-violet-300" />
              </span>
              <p className="mt-4 text-[13.5px] font-medium text-ink-1">Waiting for you to sign in…</p>
              <p className="mt-1.5 max-w-[320px] text-[12px] leading-relaxed text-ink-3">{phase.message}</p>
              <p className="mt-3 rounded-lg bg-surface-1 px-3 py-1.5 text-[11px] text-ink-3">
                Keep the Chrome window open until this closes.
              </p>
              <button
                type="button"
                onClick={cancel}
                className="focus-ring mt-5 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-ink-2 transition hover:border-white/20 hover:bg-surface-2"
              >
                Cancel sign-in
              </button>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">
                  D2L address
                </span>
                <input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  disabled={busy}
                  placeholder="https://courses.torontomu.ca"
                  spellCheck={false}
                  className="focus-ring mt-1.5 h-10 w-full rounded-xl border border-line bg-surface-1 px-3 text-[13px] text-ink-1 placeholder:text-ink-4 transition focus:border-violet-400/40 disabled:opacity-60"
                />
              </label>

              {(error || phase.phase === 'error') && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2.5 text-[12px] text-rose-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p className="leading-relaxed">{error ?? phase.message}</p>
                </div>
              )}

              {chromeMissing && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2.5 text-[12px] text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p className="leading-relaxed">
                    Chrome or Edge was not found on this computer. Install one, then try again.
                  </p>
                </div>
              )}

              <ol className="mt-4 space-y-2">
                {STEPS.map((step, index) => (
                  <li key={step} className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-ink-2">
                      {index + 1}
                    </span>
                    <span className="text-[12px] leading-relaxed text-ink-2">{step}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-surface-1 px-3 py-2.5">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
                <p className="text-[11px] leading-relaxed text-ink-3">
                  Your password never reaches this app. Only a D2L session cookie is saved, on this computer, in{' '}
                  <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[10px] text-ink-2">.data/</code>.
                </p>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={begin}
                  disabled={busy || chromeMissing}
                  className="focus-ring flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-violet-400)_78%,#0b0d16),color-mix(in_srgb,var(--color-violet-600)_92%,#0b0d16))] text-[13px] font-semibold text-white shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-violet-300)_34%,transparent),0_12px_28px_-14px_color-mix(in_srgb,var(--color-violet-500)_95%,transparent),inset_0_1px_0_rgba(255,255,255,0.22)] transition hover:brightness-[1.12] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  {state?.connected ? 'Sign in again' : 'Open sign-in window'}
                </button>
                {state?.connected && (
                  <button
                    type="button"
                    onClick={disconnect}
                    disabled={busy}
                    className="focus-ring flex h-10 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-[12px] text-ink-2 transition hover:border-rose-400/30 hover:bg-rose-500/[0.08] hover:text-rose-200 disabled:opacity-60"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-[11px] text-ink-4">
          <Lock className="h-3 w-3" />
          <span>Local only — nothing is uploaded anywhere.</span>
          {state?.connected && (
            <span className="ml-auto inline-flex items-center gap-1 text-emerald-400/80">
              <Check className="h-3 w-3" />
              Session active
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
