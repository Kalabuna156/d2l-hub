import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  FileSearch,
  Loader2,
  ScanLine,
  Sparkles,
  X,
} from 'lucide-react';
import type { AiStatus, OutlineScanCourse, OutlineScanResult } from '../../shared/types';
import { importCourseForm, scanCourseOutlines } from '../lib/api';

interface AutoImportDialogProps {
  open: boolean;
  ai: AiStatus | null;
  onClose: () => void;
  onOpenSettings: () => void;
  onImported: (result: { added: number; skipped: number }) => void;
}

function dateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

function sourceLabel(source: OutlineScanCourse['outlineSource']): string {
  if (source === 'd2l') return 'D2L course files';
  if (source === 'library') return 'Content Space';
  return 'saved outline';
}

export function AutoImportDialog({
  open,
  ai,
  onClose,
  onOpenSettings,
  onImported,
}: AutoImportDialogProps) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<OutlineScanResult | null>(null);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setScanning(false);
    setResult(null);
    setSelected({});
    setError(null);
    setBusy(false);
    setImportError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !scanning && !busy) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, scanning, busy, onClose]);

  const scan = async () => {
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      const next = await scanCourseOutlines();
      setResult(next);
      const picks: Record<string, Set<string>> = {};
      for (const course of next.courses) {
        picks[course.courseCode] = new Set(course.deadlines.map((deadline) => deadline.id));
      }
      setSelected(picks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not scan your outlines.');
    } finally {
      setScanning(false);
    }
  };

  const toggle = (courseCode: string, id: string) => {
    setSelected((current) => {
      const next = new Set(current[courseCode] ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...current, [courseCode]: next };
    });
  };

  const toggleCourse = (course: OutlineScanCourse) => {
    setSelected((current) => {
      const all = course.deadlines.map((deadline) => deadline.id);
      const currentSet = current[course.courseCode] ?? new Set<string>();
      const every = all.length > 0 && all.every((id) => currentSet.has(id));
      return { ...current, [course.courseCode]: new Set(every ? [] : all) };
    });
  };

  const total = useMemo(
    () =>
      Object.values(selected).reduce((sum, ids) => sum + ids.size, 0),
    [selected],
  );

  const foundCount = result?.courses.filter((course) => course.outlineFileName).length ?? 0;

  const addAll = async () => {
    if (!result || total === 0) return;
    setBusy(true);
    setImportError(null);
    let added = 0;
    let skipped = 0;
    const failures: string[] = [];

    for (const course of result.courses) {
      const ids = selected[course.courseCode] ?? new Set<string>();
      const deadlines = course.deadlines
        .filter((deadline) => ids.has(deadline.id))
        .map((deadline) => ({
          title: deadline.title,
          startsAt: deadline.startsAt,
          endsAt: deadline.endsAt,
        }));
      if (deadlines.length === 0) continue;
      try {
        const imported = await importCourseForm({ courseCode: course.courseCode, deadlines });
        added += imported.added;
        skipped += imported.skipped;
      } catch (err) {
        failures.push(`${course.courseCode}: ${err instanceof Error ? err.message : 'import failed'}`);
      }
    }

    setBusy(false);
    if (failures.length > 0) {
      setImportError(failures.join(' · '));
      if (added > 0) onImported({ added, skipped });
      return;
    }
    onImported({ added, skipped });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Scan course outlines with AI"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy && !scanning) onClose();
      }}
    >
      <div className="animate-rise flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[var(--chrome-solid)] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)]">
        <div className="flex items-start gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-700 shadow-lg shadow-violet-950/60">
            <ScanLine className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[15px] font-semibold text-white">Find outlines for every course</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Looks through course files and Content Space, then your AI reads each outline.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy || scanning}
            aria-label="Close"
            className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-white/10 hover:text-slate-200 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!ai?.configured ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] px-6 py-10 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-500/[0.1] text-violet-300 ring-1 ring-inset ring-violet-400/20">
                <Brain className="h-5 w-5" />
              </span>
              <p className="mt-3 text-[13px] font-medium text-slate-200">Add your own AI key first</p>
              <p className="mt-1 max-w-sm text-[11.5px] leading-relaxed text-slate-500">
                Auto-import sends your outline text to the provider you choose, using your own key and credits.
                Settings takes about a minute.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="focus-ring mt-4 flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-b from-violet-500 to-indigo-600 px-3.5 text-[12px] font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:from-violet-400 hover:to-indigo-500"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Open AI settings
              </button>
            </div>
          ) : !result ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <p className="text-[12.5px] font-medium text-slate-100">
                  Scan up to 10 courses with {ai.provider === 'gemini' ? 'Gemini' : ai.provider === 'openai' ? 'OpenAI' : ai.provider === 'anthropic' ? 'Claude' : 'your endpoint'} · {ai.model}
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
                  Each course is searched for an outline or syllabus. Its text is sent to your provider so the
                  dates can be read, including midterms that sit in a separate table. Nothing is added until you
                  review the result.
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-200/80">
                  <AlertTriangle className="h-3 w-3 shrink-0 text-amber-300" />
                  Uses your provider account and credits. A scan of six courses makes six requests.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void scan()}
                disabled={scanning}
                className="focus-ring flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-violet-500 to-indigo-600 text-[12.5px] font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:from-violet-400 hover:to-indigo-500 disabled:opacity-60"
              >
                {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                {scanning ? 'Looking for outlines and reading them…' : 'Scan my courses'}
              </button>
              {scanning && (
                <p className="text-center text-[10.5px] text-slate-600">
                  This can take a minute — one AI request per course with an outline.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                <p className="text-[11.5px] text-slate-400">
                  Found an outline for <span className="text-slate-200">{foundCount}</span> of{' '}
                  {result.courses.length} courses · {result.provider} · {result.model}
                </p>
                <button
                  type="button"
                  onClick={() => void scan()}
                  disabled={scanning || busy}
                  className="focus-ring ml-auto rounded-lg border border-white/[0.08] px-2.5 py-1 text-[10.5px] text-slate-400 transition hover:border-white/20 hover:text-white disabled:opacity-50"
                >
                  Scan again
                </button>
              </div>

              {result.courses.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-5 text-center">
                  <p className="text-[12px] text-slate-300">No courses or saved outlines to scan.</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    Connect D2L, or add an outline in Content Space under a course, then scan again.
                  </p>
                </div>
              )}

              {result.courses.map((course) => {
                const ids = selected[course.courseCode] ?? new Set<string>();
                if (!course.outlineFileName && course.deadlines.length === 0) {
                  return (
                    <div
                      key={`${course.courseId}-${course.courseCode}`}
                      className="rounded-xl border border-white/[0.05] bg-white/[0.01] px-3.5 py-2.5"
                    >
                      <p className="text-[11.5px] text-slate-500">
                        <span className="font-medium text-slate-400">{course.courseName}</span> — no outline found.
                      </p>
                    </div>
                  );
                }

                return (
                  <section
                    key={`${course.courseId}-${course.courseCode}`}
                    className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]"
                  >
                    <div className="flex flex-wrap items-start gap-2 border-b border-white/[0.06] px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-slate-100">
                          {course.courseName}
                          <span className="ml-1.5 font-mono text-[10px] uppercase text-slate-500">
                            {course.courseCode}
                          </span>
                        </p>
                        <p className="mt-0.5 truncate text-[10.5px] text-slate-600">
                          {course.outlineFileName ?? 'Outline text saved earlier'} ·{' '}
                          {sourceLabel(course.outlineSource)}
                        </p>
                      </div>
                      {course.deadlines.length > 0 && (
                        <label className="flex cursor-pointer items-center gap-1.5 text-[10.5px] text-slate-400">
                          <input
                            type="checkbox"
                            checked={course.deadlines.length > 0 && course.deadlines.every((d) => ids.has(d.id))}
                            onChange={() => toggleCourse(course)}
                            className="h-3.5 w-3.5 accent-violet-500"
                          />
                          All {course.deadlines.length}
                        </label>
                      )}
                    </div>

                    {course.error && (
                      <p className="flex items-start gap-2 border-b border-white/[0.06] bg-amber-400/[0.04] px-3.5 py-2 text-[11px] leading-relaxed text-amber-100/80">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-300" />
                        {course.error}
                        {course.deadlines.length > 0 ? ' Showing the dates read locally instead.' : ''}
                      </p>
                    )}

                    {course.deadlines.length === 0 ? (
                      <p className="px-3.5 py-3 text-[11.5px] text-slate-500">
                        The outline was found, but no dated assessments were read from it.
                      </p>
                    ) : (
                      <div className="divide-y divide-white/[0.055]">
                        {course.deadlines.map((deadline) => (
                          <label
                            key={deadline.id}
                            className="flex cursor-pointer items-start gap-2.5 px-3.5 py-2.5 transition hover:bg-white/[0.03]"
                          >
                            <input
                              type="checkbox"
                              checked={ids.has(deadline.id)}
                              onChange={() => toggle(course.courseCode, deadline.id)}
                              className="mt-1 h-3.5 w-3.5 shrink-0 accent-violet-500"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] text-slate-200">{deadline.title}</span>
                              <span className="mt-0.5 block text-[10.5px] text-slate-500">
                                {dateLabel(deadline.startsAt)} · {timeLabel(deadline.startsAt)}
                              </span>
                              {deadline.raw && (
                                <span className="mt-0.5 block truncate text-[10px] text-slate-700">{deadline.raw}</span>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    {course.undated.length > 0 && (
                      <div className="border-t border-white/[0.06] bg-amber-400/[0.03] px-3.5 py-2.5">
                        <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-amber-200/60">
                          No specific date
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {course.undated.map((item) => (
                            <li key={`${item.title}-${item.when}`} className="text-[11px] text-slate-500">
                              <span className="text-slate-300">{item.title}</span>
                              {item.when ? ` — ${item.when}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2.5 text-[12px] text-rose-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}
          {importError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2.5 text-[12px] text-rose-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="leading-relaxed">{importError}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-5 py-3">
          <button
            type="button"
            onClick={() => void addAll()}
            disabled={busy || scanning || total === 0}
            className="focus-ring flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-violet-500 to-indigo-600 px-3.5 text-[12px] font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:from-violet-400 hover:to-indigo-500 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {total === 0 ? 'No dates selected' : `Add ${total} ${total === 1 ? 'date' : 'dates'} to calendar`}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="focus-ring h-9 rounded-lg border border-white/10 px-3 text-[11.5px] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-60"
          >
            Cancel
          </button>
          <p className="ml-auto hidden text-[10.5px] text-slate-600 sm:block">
            Dates already on your calendar are skipped.
          </p>
        </div>
      </div>
    </div>
  );
}
