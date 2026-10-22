import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CalendarDays,
  Check,
  Database,
  ExternalLink,
  FolderOpen,
  KeyRound,
  Loader2,
  Palette,
  Plus,
  Plug,
  RefreshCw,
  Settings2,
  ShieldAlert,
  X,
} from 'lucide-react';
import type {
  AiProvider,
  AppState,
  IntegrationConnection,
  NotionDatabaseOption,
  Preferences,
} from '../../shared/types';
import {
  addExamBankSource,
  connectGoogleFeed,
  connectNotionDatabase,
  fetchNotionDatabases,
  forgetAiKey,
  removeExamBankSource,
  removeGoogleFeed,
  removeNotionDatabase,
  saveAiSettings,
  syncIntegrations,
  testAi,
} from '../lib/api';
import { syncTime } from '../lib/format';
import { ACCENTS, BACKDROPS, DEFAULT_PREFERENCES } from '../lib/preferences';

type Tab = 'connections' | 'ai' | 'appearance';

interface SettingsDialogProps {
  open: boolean;
  state: AppState | null;
  preferences: Preferences;
  onPreferences: (next: Preferences) => void;
  onClose: () => void;
  onOpenD2L: () => void;
  onSynced: () => void;
  /** Open on a specific tab, e.g. AI from the auto-import dialog */
  initialTab?: Tab;
}

function StatusPill({ connection }: { connection: IntegrationConnection | undefined }) {
  const connected = Boolean(connection?.connected);
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        connected
          ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/20'
          : 'bg-white/[0.05] text-slate-500 ring-1 ring-inset ring-white/10'
      }`}
    >
      {connected ? 'Connected' : 'Not connected'}
    </span>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2.5 text-[12px] text-rose-200">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p className="leading-relaxed">{message}</p>
    </div>
  );
}

export function SettingsDialog({
  open,
  state,
  preferences,
  onPreferences,
  onClose,
  onOpenD2L,
  onSynced,
  initialTab = 'connections',
}: SettingsDialogProps) {
  const [tab, setTab] = useState<Tab>(initialTab);

  const [googleUrl, setGoogleUrl] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const [notionToken, setNotionToken] = useState('');
  const [notionBusy, setNotionBusy] = useState(false);
  const [notionError, setNotionError] = useState<string | null>(null);
  const [databases, setDatabases] = useState<NotionDatabaseOption[]>([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [notionEmpty, setNotionEmpty] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [bankName, setBankName] = useState('');
  const [bankUrl, setBankUrl] = useState('');
  const [bankBusy, setBankBusy] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const [bankNotice, setBankNotice] = useState<string | null>(null);

  const [aiProvider, setAiProvider] = useState<AiProvider>('gemini');
  const [aiModel, setAiModel] = useState('');
  const [aiKey, setAiKey] = useState('');
  const [aiBase, setAiBase] = useState('');
  const [aiAllow, setAiAllow] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const googleStatus = state?.integrations.google;
  const notionStatus = state?.integrations.notion;
  const examBanks = state?.examBanks ?? [];
  const chosenDb = useMemo(() => databases.find((db) => db.id === selectedDb) ?? null, [databases, selectedDb]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setGoogleError(null);
    setNotionError(null);
    setSyncError(null);
    setBankError(null);
    setBankNotice(null);
    setAiError(null);
    setAiNotice(null);
    setAiKey('');
    const current = state?.ai;
    setAiProvider(current?.provider ?? 'gemini');
    setAiModel(current?.model ?? '');
    setAiBase(current?.customBaseUrl ?? '');
    setAiAllow(current?.allowCourseFiles ?? false);
    // Only when the dialog opens; later state updates must not wipe a typed key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const connectGoogle = async () => {
    setGoogleBusy(true);
    setGoogleError(null);
    try {
      await connectGoogleFeed(googleUrl);
      setGoogleUrl('');
      onSynced();
    } catch (error) {
      setGoogleError(error instanceof Error ? error.message : 'Could not read that calendar.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const disconnectGoogle = async () => {
    setGoogleBusy(true);
    setGoogleError(null);
    try {
      await removeGoogleFeed();
      onSynced();
    } catch (error) {
      setGoogleError(error instanceof Error ? error.message : 'Could not remove that calendar.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const findDatabases = async () => {
    setNotionBusy(true);
    setNotionError(null);
    setDatabases([]);
    setNotionEmpty(false);
    try {
      const result = await fetchNotionDatabases(notionToken);
      setDatabases(result.databases);
      setNotionEmpty(result.empty);
      setSelectedDb(result.databases.find((db) => db.dateProperty)?.id ?? result.databases[0]?.id ?? '');
    } catch (error) {
      setNotionError(error instanceof Error ? error.message : 'Could not reach Notion.');
    } finally {
      setNotionBusy(false);
    }
  };

  const connectNotion = async () => {
    setNotionBusy(true);
    setNotionError(null);
    try {
      await connectNotionDatabase(notionToken, selectedDb);
      setNotionToken('');
      setDatabases([]);
      setSelectedDb('');
      onSynced();
    } catch (error) {
      setNotionError(error instanceof Error ? error.message : 'Could not read that database.');
    } finally {
      setNotionBusy(false);
    }
  };

  const disconnectNotion = async () => {
    setNotionBusy(true);
    setNotionError(null);
    try {
      await removeNotionDatabase();
      setDatabases([]);
      setSelectedDb('');
      setNotionToken('');
      onSynced();
    } catch (error) {
      setNotionError(error instanceof Error ? error.message : 'Could not remove that database.');
    } finally {
      setNotionBusy(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await syncIntegrations();
      onSynced();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not sync your calendars.');
    } finally {
      setSyncing(false);
    }
  };

  const update = (patch: Partial<Preferences>) => onPreferences({ ...preferences, ...patch });

  const saveAi = async (runTest: boolean) => {
    setAiBusy(true);
    setAiError(null);
    setAiNotice(null);
    try {
      const saved = await saveAiSettings({
        provider: aiProvider,
        apiKey: aiKey.trim() || undefined,
        model: aiModel.trim(),
        customBaseUrl: aiProvider === 'custom' ? aiBase.trim() : '',
        allowCourseFiles: aiAllow,
      });
      setAiKey('');
      onSynced();
      if (runTest) {
        const result = await testAi();
        setAiNotice(`Connected to ${result.provider} · ${result.model}. You are ready to scan and study.`);
      } else {
        setAiNotice(
          saved.configured
            ? 'Saved. Auto-import and Study use this key.'
            : 'Saved. Add a key to turn on AI features.',
        );
      }
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Could not save those AI settings.');
    } finally {
      setAiBusy(false);
    }
  };

  const forgetKey = async () => {
    setAiBusy(true);
    setAiError(null);
    setAiNotice(null);
    try {
      await forgetAiKey();
      setAiKey('');
      onSynced();
      setAiNotice('The API key was removed from this computer.');
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Could not remove that key.');
    } finally {
      setAiBusy(false);
    }
  };

  const addBank = async () => {
    setBankBusy(true);
    setBankError(null);
    setBankNotice(null);
    try {
      const result = await addExamBankSource({ name: bankName, url: bankUrl });
      setBankName('');
      setBankUrl('');
      const added = result.banks[result.banks.length - 1];
      setBankNotice(`“${added?.name ?? 'Exam bank'}” is now in the Exam bank page.`);
      onSynced();
    } catch (error) {
      setBankError(error instanceof Error ? error.message : 'Could not add that folder.');
    } finally {
      setBankBusy(false);
    }
  };

  const removeBank = async (id: string) => {
    setBankBusy(true);
    setBankError(null);
    setBankNotice(null);
    try {
      await removeExamBankSource(id);
      onSynced();
    } catch (error) {
      setBankError(error instanceof Error ? error.message : 'Could not remove that folder.');
    } finally {
      setBankBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="animate-rise flex max-h-[88vh] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[var(--chrome-solid)] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)]">
        <div className="flex items-start gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-700 shadow-lg shadow-violet-950/60">
            <Settings2 className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[15px] font-semibold text-white">Settings</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">Connections and appearance, saved on this computer.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-white/[0.06] px-4 py-2">
          {(
            [
              { id: 'connections', label: 'Connections', icon: Plug },
              { id: 'ai', label: 'AI', icon: Brain },
              { id: 'appearance', label: 'Appearance', icon: Palette },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition ${
                  active ? 'bg-white/[0.08] text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
          {(googleStatus?.connected || notionStatus?.connected) && (
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing}
              className="focus-ring ml-auto flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11.5px] text-slate-400 transition hover:border-white/15 hover:text-slate-200 disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
              Sync now
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {syncError && <ErrorNote message={syncError} />}

          {tab === 'connections' ? (
            <div className="space-y-3">
              <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-500/[0.12] text-violet-300 ring-1 ring-inset ring-violet-400/20">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-[13px] font-semibold text-slate-100">D2L / Brightspace</h3>
                  <span className="ml-auto">
                    <StatusPill connection={{ connected: Boolean(state?.connected), label: null, lastSync: null, error: null, count: 0 }} />
                  </span>
                </div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
                  {state?.connected
                    ? `Signed in as ${state.userName ?? 'your account'} on ${state.baseUrl.replace(/^https?:\/\//, '')}.`
                    : 'Sign in through your school once; the dashboard keeps the session.'}
                </p>
                <button
                  type="button"
                  onClick={onOpenD2L}
                  className="focus-ring mt-3 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-medium text-slate-200 transition hover:border-white/15 hover:bg-white/[0.08]"
                >
                  {state?.connected ? 'Manage D2L session' : 'Connect D2L'}
                </button>
              </section>

              <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-500/[0.12] text-sky-300 ring-1 ring-inset ring-sky-400/20">
                    <CalendarDays className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-[13px] font-semibold text-slate-100">Google Calendar</h3>
                  <span className="ml-auto">
                    <StatusPill connection={googleStatus} />
                  </span>
                </div>

                {googleStatus?.connected ? (
                  <>
                    <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
                      Reading <span className="text-slate-200">{googleStatus.label ?? 'your calendar'}</span>
                      {googleStatus.count > 0 ? ` · ${googleStatus.count} upcoming` : ''}
                      {googleStatus.lastSync ? ` · synced ${syncTime(googleStatus.lastSync)}` : ''}
                    </p>
                    {googleStatus.error && <ErrorNote message={googleStatus.error} />}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={disconnectGoogle}
                        disabled={googleBusy}
                        className="focus-ring rounded-lg border border-white/10 px-3 py-1.5 text-[11.5px] text-slate-300 transition hover:border-rose-400/30 hover:bg-rose-500/[0.08] hover:text-rose-200 disabled:opacity-60"
                      >
                        Remove calendar
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
                      Google shares a calendar read-only through a private address. Copy the one belonging to your
                      school calendar and paste it below — about a minute of work, no Google Cloud project.
                    </p>

                    <a
                      href="https://calendar.google.com/calendar/r/settings"
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-slate-200 transition hover:border-white/15 hover:bg-white/[0.08]"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open Google Calendar settings
                    </a>

                    <ol className="mt-3 space-y-1.5">
                      {[
                        'On the left under “Settings for my calendars”, click the calendar your classes are on.',
                        'Scroll right down to the “Integrate calendar” box.',
                        'Copy “Secret address in iCal format” — the link ending in basic.ics.',
                        'Paste it in the box below and press Connect.',
                      ].map((step, index) => (
                        <li key={step} className="flex gap-2 text-[11.5px] leading-relaxed text-slate-500">
                          <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[9.5px] font-semibold text-slate-400">
                            {index + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>

                    <div className="mt-3">
                      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                        Secret iCal address
                      </span>
                      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                        <input
                          value={googleUrl}
                          onChange={(event) => setGoogleUrl(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && googleUrl.trim() && !googleBusy) void connectGoogle();
                          }}
                          disabled={googleBusy}
                          aria-label="Secret iCal address"
                          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                          spellCheck={false}
                          className="focus-ring h-9 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 font-mono text-[11.5px] text-slate-200 placeholder:text-slate-600 transition focus:border-violet-400/40 disabled:opacity-60"
                        />
                        <button
                          type="button"
                          onClick={connectGoogle}
                          disabled={googleBusy || googleUrl.trim().length === 0}
                          className="focus-ring flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-violet-500 to-indigo-600 px-3 text-[12px] font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:from-violet-400 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {googleBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Connect
                        </button>
                      </div>
                      <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-600">
                        The address is a secret — anyone with it can read that calendar. It is stored only on this
                        computer, and connecting only ever reads it.
                      </p>
                    </div>
                    {googleError && <ErrorNote message={googleError} />}
                  </>
                )}
              </section>

              <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-400/10 text-slate-200 ring-1 ring-inset ring-white/15">
                    <Database className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-[13px] font-semibold text-slate-100">Notion</h3>
                  <span className="ml-auto">
                    <StatusPill connection={notionStatus} />
                  </span>
                </div>

                {notionStatus?.connected ? (
                  <>
                    <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
                      Reading <span className="text-slate-200">{notionStatus.label ?? 'your database'}</span>
                      {notionStatus.count > 0 ? ` · ${notionStatus.count} dated entries` : ''}
                      {notionStatus.lastSync ? ` · synced ${syncTime(notionStatus.lastSync)}` : ''}
                    </p>
                    {notionStatus.error && <ErrorNote message={notionStatus.error} />}
                    <button
                      type="button"
                      onClick={disconnectNotion}
                      disabled={notionBusy}
                      className="focus-ring mt-3 rounded-lg border border-white/10 px-3 py-1.5 text-[11.5px] text-slate-300 transition hover:border-rose-400/30 hover:bg-rose-500/[0.08] hover:text-rose-200 disabled:opacity-60"
                    >
                      Remove database
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
                      Create an integration at{' '}
                      <a
                        href="https://www.notion.so/my-integrations"
                        target="_blank"
                        rel="noreferrer"
                        className="text-violet-300 underline decoration-violet-400/40 underline-offset-2 hover:text-violet-200"
                      >
                        notion.so/my-integrations
                      </a>
                      , copy its Internal Integration Secret, then in Notion open your deadlines database →{' '}
                      <span className="text-slate-300">⋯ → Connections → add your integration</span>.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={notionToken}
                        onChange={(event) => setNotionToken(event.target.value)}
                        disabled={notionBusy}
                        type="password"
                        placeholder="ntn_… integration secret"
                        spellCheck={false}
                        className="focus-ring h-9 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 font-mono text-[11.5px] text-slate-200 placeholder:text-slate-600 transition focus:border-violet-400/40 disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={findDatabases}
                        disabled={notionBusy || notionToken.trim().length === 0}
                        className="focus-ring flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 text-[12px] font-medium text-slate-200 transition hover:border-white/15 hover:bg-white/[0.09] disabled:opacity-50"
                      >
                        {notionBusy && databases.length === 0 ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Database className="h-3.5 w-3.5" />
                        )}
                        Find databases
                      </button>
                    </div>

                    {notionEmpty && (
                      <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-[11.5px] text-amber-200">
                        The token works, but no database is shared with it. In Notion: open the database → ⋯ → Connections.
                      </p>
                    )}

                    {databases.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <select
                          value={selectedDb}
                          onChange={(event) => setSelectedDb(event.target.value)}
                          aria-label="Notion database"
                          className="focus-ring h-9 w-full rounded-lg border border-white/[0.08] bg-[var(--chrome-solid)] px-2.5 text-[12px] text-slate-200"
                        >
                          {databases.map((database) => (
                            <option key={database.id} value={database.id}>
                              {database.title}
                              {database.dateProperty ? '' : ' (no date property)'}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] leading-relaxed text-slate-500">
                          {chosenDb?.dateProperty
                            ? `Due dates come from the “${chosenDb.dateProperty}” property.`
                            : 'Add a Date property called “Due” to that database, then search again.'}
                        </p>
                        <button
                          type="button"
                          onClick={connectNotion}
                          disabled={notionBusy || !chosenDb?.dateProperty}
                          className="focus-ring flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-violet-500 to-indigo-600 text-[12px] font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:from-violet-400 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {notionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Use this database
                        </button>
                      </div>
                    )}

                    {notionError && <ErrorNote message={notionError} />}
                  </>
                )}
              </section>

              <p className="px-1 text-[11px] leading-relaxed text-slate-600">
                Calendar addresses and Notion tokens are stored only on this computer, never uploaded. Synced items are
                merged into Up next and the 14-day stat, and link back to the original entry.
              </p>
            </div>
          ) : tab === 'ai' ? (
            <div className="space-y-4">
              <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-500/[0.12] text-violet-300 ring-1 ring-inset ring-violet-400/20">
                    <Brain className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-[13px] font-semibold text-slate-100">Your own AI</h3>
                  <span className="ml-auto">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        state?.ai?.configured
                          ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/20'
                          : 'bg-white/[0.05] text-slate-500 ring-1 ring-inset ring-white/10'
                      }`}
                    >
                      {state?.ai?.configured ? 'Key saved' : 'No key yet'}
                    </span>
                  </span>
                </div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
                  Auto-import and Study call the provider directly with this key. The key is stored in this
                  computer's app data and is never sent anywhere else.
                </p>

                <label className="mt-3 block">
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                    Provider
                  </span>
                  <select
                    value={aiProvider}
                    onChange={(event) => {
                      setAiProvider(event.target.value as AiProvider);
                      setAiModel('');
                      setAiError(null);
                    }}
                    disabled={aiBusy}
                    className="focus-ring mt-1.5 h-9 w-full rounded-lg border border-white/[0.08] bg-[var(--chrome-solid)] px-2.5 text-[12px] text-slate-200 disabled:opacity-60"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic Claude</option>
                    <option value="custom">OpenAI-compatible endpoint</option>
                  </select>
                </label>

                {aiProvider === 'custom' && (
                  <label className="mt-3 block">
                    <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                      Endpoint URL
                    </span>
                    <input
                      value={aiBase}
                      onChange={(event) => setAiBase(event.target.value)}
                      disabled={aiBusy}
                      placeholder="https://example.com/v1"
                      spellCheck={false}
                      className="focus-ring mt-1.5 h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 font-mono text-[11.5px] text-slate-200 placeholder:text-slate-600 transition focus:border-violet-400/40 disabled:opacity-60"
                    />
                    <span className="mt-1 block text-[10.5px] leading-relaxed text-slate-600">
                      Anything that speaks the OpenAI chat-completions API: a gateway, a local model server, or
                      another vendor's compatible endpoint. http:// is allowed for localhost only.
                    </span>
                  </label>
                )}

                <label className="mt-3 block">
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                    Model
                  </span>
                  <input
                    value={aiModel}
                    onChange={(event) => setAiModel(event.target.value)}
                    disabled={aiBusy}
                    placeholder={aiProvider === 'gemini' ? 'gemini-3.8-flash' : aiProvider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o-mini'}
                    spellCheck={false}
                    className="focus-ring mt-1.5 h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 font-mono text-[11.5px] text-slate-200 placeholder:text-slate-600 transition focus:border-violet-400/40 disabled:opacity-60"
                  />
                  <span className="mt-1 block text-[10.5px] leading-relaxed text-slate-600">
                    Leave blank for the default. A larger model gives better study plans but costs more.
                  </span>
                </label>

                <div className="mt-3 block">
                  <label
                    htmlFor="ai-api-key"
                    className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500"
                  >
                    API key
                  </label>
                  <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                    <input
                      id="ai-api-key"
                      value={aiKey}
                      onChange={(event) => setAiKey(event.target.value)}
                      disabled={aiBusy}
                      type="password"
                      autoComplete="off"
                      placeholder={
                        state?.ai?.keyHint
                          ? `Saved key ${state.ai.keyHint} — type to replace`
                          : 'Paste the key from your provider'
                      }
                      spellCheck={false}
                      className="focus-ring h-9 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 font-mono text-[11.5px] text-slate-200 placeholder:text-slate-600 transition focus:border-violet-400/40 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => void saveAi(false)}
                      disabled={aiBusy}
                      className="focus-ring flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-violet-500 to-indigo-600 px-3 text-[12px] font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:from-violet-400 hover:to-indigo-500 disabled:opacity-50"
                    >
                      {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Save
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void saveAi(true)}
                    disabled={aiBusy || (!state?.ai?.configured && !aiKey.trim())}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.06] px-2.5 py-1.5 text-[11.5px] font-medium text-slate-200 transition hover:border-white/20 hover:text-white disabled:opacity-40"
                  >
                    <RefreshCw className={`h-3 w-3 ${aiBusy ? 'animate-spin' : ''}`} />
                    Save &amp; test
                  </button>
                  {state?.ai?.configured && (
                    <button
                      type="button"
                      onClick={() => void forgetKey()}
                      disabled={aiBusy}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11.5px] text-slate-400 transition hover:border-rose-400/30 hover:bg-rose-500/[0.08] hover:text-rose-200 disabled:opacity-40"
                    >
                      <KeyRound className="h-3 w-3" />
                      Forget key
                    </button>
                  )}
                  <a
                    href={
                      aiProvider === 'gemini'
                        ? 'https://aistudio.google.com/app/apikey'
                        : aiProvider === 'openai'
                          ? 'https://platform.openai.com/api-keys'
                          : aiProvider === 'anthropic'
                            ? 'https://console.anthropic.com/settings/keys'
                            : 'https://platform.openai.com/docs/api-reference/chat'
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="focus-ring ml-auto inline-flex items-center gap-1.5 text-[11px] text-violet-300 underline decoration-violet-400/40 underline-offset-2 hover:text-violet-200"
                  >
                    Get a key
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {aiError && <ErrorNote message={aiError} />}
                {aiNotice && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.08] px-3 py-2.5 text-[12px] text-emerald-100">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <p className="leading-relaxed">{aiNotice}</p>
                  </div>
                )}
              </section>

              <section
                className={`rounded-xl border p-4 ${
                  aiAllow ? 'border-amber-400/25 bg-amber-400/[0.06]' : 'border-white/[0.07] bg-white/[0.02]'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-slate-100">
                      <ShieldAlert className={`h-3.5 w-3.5 ${aiAllow ? 'text-amber-300' : 'text-slate-500'}`} />
                      Let AI read course files
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      When this is on, the text of the lecture PDFs, Word documents and PowerPoint slides you
                      have for a course is sent to your AI provider with a study request. That content leaves
                      this computer and is handled under that provider's terms. Leave it off and only file
                      names are sent.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={aiAllow}
                    aria-label="Let the AI read course files"
                    onClick={() => setAiAllow((value) => !value)}
                    className={`focus-ring relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition ${
                      aiAllow ? 'border-amber-400/40 bg-amber-400/70' : 'border-white/10 bg-white/[0.08]'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all ${
                        aiAllow ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
                {aiAllow && (
                  <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.08] px-2.5 py-2 text-[11px] leading-relaxed text-amber-100/90">
                    On: lecture file text can reach {aiProvider === 'gemini' ? 'Google' : aiProvider === 'openai' ? 'OpenAI' : aiProvider === 'anthropic' ? 'Anthropic' : 'your endpoint'}. Save to apply.
                  </p>
                )}
              </section>

              <p className="px-1 text-[11px] leading-relaxed text-slate-600">
                Outline text is also sent when you press Auto-import or build a study plan — that is how the AI
                reads the dates and chapters. Study also sends the course announcements that mention quiz or
                exam coverage, so the plan follows what your instructor says is covered. Calls use your own
                provider account and credits. AI can make mistakes; check dates and citations against the
                outline and announcements.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <section>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500">Accent</h3>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {ACCENTS.map((accent) => {
                    const active = preferences.accent === accent.id;
                    return (
                      <button
                        key={accent.id}
                        type="button"
                        onClick={() => update({ accent: accent.id })}
                        aria-pressed={active}
                        className={`focus-ring flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[12px] transition ${
                          active
                            ? 'border-white/20 bg-white/[0.07] text-white'
                            : 'border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/15 hover:text-slate-200'
                        }`}
                      >
                        <span className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-white/25" style={{ backgroundColor: accent.swatch }} />
                        {accent.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500">Background</h3>
                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  {BACKDROPS.map((backdrop) => {
                    const active = preferences.backdrop === backdrop.id;
                    return (
                      <button
                        key={backdrop.id}
                        type="button"
                        onClick={() => update({ backdrop: backdrop.id })}
                        aria-pressed={active}
                        className={`focus-ring flex items-center gap-3 rounded-xl border p-2 text-left transition ${
                          active
                            ? 'border-violet-400/40 bg-violet-500/[0.08]'
                            : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
                        }`}
                      >
                        <span
                          className="h-10 w-14 shrink-0 rounded-lg ring-1 ring-inset ring-white/10"
                          style={{ background: backdrop.preview }}
                        />
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-medium text-slate-100">{backdrop.label}</span>
                          <span className="block truncate text-[11px] text-slate-500">{backdrop.hint}</span>
                        </span>
                        {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-violet-300" />}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500">Your own image</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Paste a direct image link (https://…jpg or .png). It sits behind a dimming layer so text stays readable.
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={preferences.backgroundImage ?? ''}
                    onChange={(event) => update({ backgroundImage: event.target.value.trim() || null })}
                    placeholder="https://example.com/wallpaper.jpg"
                    spellCheck={false}
                    className="focus-ring h-9 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 font-mono text-[11.5px] text-slate-200 placeholder:text-slate-600 transition focus:border-violet-400/40"
                  />
                  {preferences.backgroundImage && (
                    <button
                      type="button"
                      onClick={() => update({ backgroundImage: null })}
                      className="focus-ring rounded-lg border border-white/10 px-3 text-[11.5px] text-slate-300 transition hover:border-rose-400/30 hover:text-rose-200"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {preferences.backgroundImage && (
                  <label className="mt-3 flex items-center gap-3">
                    <span className="text-[11.5px] text-slate-500">Image strength</span>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={preferences.imageDim}
                      onChange={(event) => update({ imageDim: Number(event.target.value) })}
                      className="accent-violet-500 h-1.5 flex-1 cursor-pointer"
                    />
                    <span className="w-9 text-right text-[11.5px] text-slate-400">{preferences.imageDim}%</span>
                  </label>
                )}
              </section>

              <section>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500">Features</h3>
                <div className="mt-2.5 flex items-start justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-slate-100">MUES exam bank</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                      Browse the public engineering exam archive inside the app. Engineering students at TMU can use
                      it without an account; turn it off to hide the section.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.examBank}
                    aria-label="Show the MUES exam bank"
                    onClick={() => update({ examBank: !preferences.examBank })}
                    className={`focus-ring relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition ${
                      preferences.examBank
                        ? 'border-violet-400/40 bg-violet-500/70'
                        : 'border-white/10 bg-white/[0.08]'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all ${
                        preferences.examBank ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              </section>

              <section>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500">Exam banks</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Each link you add becomes its own bank on the Exam bank page, with its own folders and Save buttons.
                  The folder has to be shared with “anyone with the link”.
                </p>

                <ul className="mt-2.5 space-y-1.5">
                  {examBanks.map((bank) => (
                    <li
                      key={bank.id}
                      className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2"
                    >
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-300/80" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-slate-200">{bank.name}</span>
                        <span className="block truncate font-mono text-[10px] text-slate-600">{bank.folderId}</span>
                      </span>
                      {bank.builtin ? (
                        <span className="shrink-0 rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-slate-500 ring-1 ring-inset ring-white/10">
                          Built in
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void removeBank(bank.id)}
                          disabled={bankBusy}
                          className="focus-ring shrink-0 rounded-lg px-2 py-1 text-[11px] text-slate-400 transition hover:bg-rose-500/[0.1] hover:text-rose-200 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={bankName}
                    onChange={(event) => setBankName(event.target.value)}
                    placeholder="Name (optional)"
                    className="focus-ring h-9 min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-[11.5px] text-slate-200 placeholder:text-slate-600 transition focus:border-violet-400/40 sm:w-[38%]"
                  />
                  <input
                    value={bankUrl}
                    onChange={(event) => setBankUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && bankUrl.trim() && !bankBusy) void addBank();
                    }}
                    placeholder="https://drive.google.com/drive/folders/…"
                    spellCheck={false}
                    className="focus-ring h-9 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-600 transition focus:border-violet-400/40"
                  />
                  <button
                    type="button"
                    onClick={() => void addBank()}
                    disabled={bankBusy || !bankUrl.trim()}
                    className="focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11.5px] font-medium text-slate-200 transition hover:border-white/20 hover:text-white disabled:opacity-40"
                  >
                    {bankBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Add
                  </button>
                </div>

                {bankError && <ErrorNote message={bankError} />}
                {bankNotice && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.08] px-3 py-2.5 text-[12px] text-emerald-100">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <p className="leading-relaxed">{bankNotice}</p>
                  </div>
                )}
              </section>

              <button
                type="button"
                onClick={() => onPreferences({ ...DEFAULT_PREFERENCES })}
                className="focus-ring rounded-lg border border-white/[0.08] px-3 py-1.5 text-[11.5px] text-slate-400 transition hover:border-white/15 hover:text-slate-200"
              >
                Reset to defaults
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/[0.06] px-5 py-3 text-[11px] text-slate-600">
          <Palette className="h-3 w-3" />
          <span>Saved to this device only.</span>
        </div>
      </div>
    </div>
  );
}
