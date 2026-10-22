import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileUp, Loader2, Upload, X } from 'lucide-react';
import { describeCourse } from '../../shared/categorize';
import type { Course, CourseFormDeadline } from '../../shared/types';
import { importCourseForm, parseCourseForm } from '../lib/api';

interface CourseFormImportProps {
  open: boolean;
  courses: Course[];
  onClose: () => void;
  onImported: (result: { added: number; skipped: number }) => void;
}

interface DraftDeadline {
  id: string;
  title: string;
  /** yyyy-mm-dd in local time */
  date: string;
  /** HH:MM in local time */
  time: string;
  selected: boolean;
  raw: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDraft(deadline: CourseFormDeadline): DraftDeadline {
  const start = new Date(deadline.startsAt);
  const valid = !Number.isNaN(start.getTime());
  return {
    id: deadline.id,
    title: deadline.title,
    date: valid ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` : '',
    time: valid ? `${pad(start.getHours())}:${pad(start.getMinutes())}` : '09:00',
    selected: valid,
    raw: deadline.raw,
  };
}

/** "MTH141 outline.pdf" → the matching course, so the user need not pick it. */
function guessCourse(fileName: string, courses: Course[]): Course | null {
  const needle = fileName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    courses.find((course) => {
      const info = describeCourse(course);
      if (info.kind !== 'course' || !info.number) return false;
      return needle.includes(`${info.subject}${info.number}`.toLowerCase());
    }) ?? null
  );
}

const fieldClass =
  'focus-ring h-8 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] text-slate-200 placeholder:text-slate-600 transition focus:border-violet-400/40 disabled:opacity-60';
const inputClass = `${fieldClass} w-full`;

export function CourseFormImport({ open, courses, onClose, onImported }: CourseFormImportProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [outlineText, setOutlineText] = useState('');
  const [drafts, setDrafts] = useState<DraftDeadline[]>([]);
  const [courseCode, setCourseCode] = useState('');
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setFileName(null);
    setOutlineText('');
    setDrafts([]);
    setCourseCode('');
    setParsing(false);
    setBusy(false);
    setError(null);
    setDragging(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (keyboard: KeyboardEvent) => {
      if (keyboard.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, busy, onClose]);

  const selected = drafts.filter((draft) => draft.selected);
  const ready = selected.filter((draft) => draft.title.trim() && draft.date && draft.time);

  const readFile = useCallback(
    async (file: File) => {
      setParsing(true);
      setError(null);
      setDrafts([]);
      setFileName(null);
      setOutlineText('');
      try {
        const result = await parseCourseForm(file);
        const next = result.deadlines.map(toDraft);
        setFileName(result.fileName);
        setOutlineText(result.text);
        setDrafts(next);
        setCourseCode((current) => current || guessCourse(result.fileName, courses)?.code || '');
        if (next.length === 0) {
          setError(
            'No dated assessments were found. A PDF with a selectable schedule table works best — a scan has no text to read.',
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read that outline.');
      } finally {
        setParsing(false);
      }
    },
    [courses],
  );

  if (!open) return null;

  const choose = () => inputRef.current?.click();

  const patch = (id: string, change: Partial<DraftDeadline>) => {
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...change } : draft)));
  };

  const toggleAll = (checked: boolean) => {
    setDrafts((current) => current.map((draft) => ({ ...draft, selected: checked })));
  };

  const submit = async () => {
    if (ready.length === 0) {
      setError('Pick at least one date with a name.');
      return;
    }

    const deadlines = ready.map((draft) => {
      const start = new Date(`${draft.date}T${draft.time}`);
      return {
        title: draft.title.trim(),
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
      };
    });

    setBusy(true);
    setError(null);
    try {
      const result = await importCourseForm({
        courseCode: courseCode || null,
        deadlines,
        outline: courseCode && outlineText ? { fileName: fileName ?? 'Course outline', text: outlineText } : null,
      });
      onImported({ added: result.added, skipped: result.skipped });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add those dates.');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Import due dates from a course outline"
      onMouseDown={(mouse) => {
        if (mouse.target === mouse.currentTarget && !busy && !parsing) onClose();
      }}
    >
      <div className="animate-rise flex max-h-[88vh] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[var(--chrome-solid)] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)]">
        <div className="flex items-start gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-700 shadow-lg shadow-violet-950/60">
            <FileUp className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[15px] font-semibold text-white">Import dates from an outline</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Upload your course management form — read here, and kept on this computer for Study.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-white/10 hover:text-slate-200 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain"
            className="hidden"
            onChange={(change) => {
              const file = change.target.files?.[0];
              change.target.value = '';
              if (file) void readFile(file);
            }}
          />

          {drafts.length === 0 ? (
            <button
              type="button"
              onClick={choose}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void readFile(file);
              }}
              disabled={parsing}
              className={`focus-ring grid w-full place-items-center rounded-xl border border-dashed px-6 py-10 text-center transition ${
                dragging
                  ? 'border-violet-400/60 bg-violet-500/[0.08]'
                  : 'border-white/[0.12] bg-white/[0.02] hover:border-violet-400/40 hover:bg-white/[0.04]'
              } disabled:opacity-70`}
            >
              {parsing ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-violet-300" />
                  <span className="mt-3 text-[13px] font-medium text-slate-200">Reading the outline…</span>
                  <span className="mt-1 text-[11.5px] text-slate-500">Looking for dated assessments</span>
                </>
              ) : (
                <>
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.05] text-slate-300 ring-1 ring-inset ring-white/[0.08]">
                    <Upload className="h-5 w-5" />
                  </span>
                  <span className="mt-3 text-[13px] font-medium text-slate-200">
                    Drop the PDF here, or choose a file
                  </span>
                  <span className="mt-1 max-w-sm text-[11.5px] leading-relaxed text-slate-500">
                    A text-based PDF or plain text file with the schedule. Nothing leaves this computer.
                  </span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[12px] text-slate-400">
                  <span className="font-medium text-slate-200">{fileName}</span>
                  <span className="ml-1.5 text-slate-600">
                    · {drafts.length} {drafts.length === 1 ? 'date' : 'dates'} found
                  </span>
                </p>
                <button
                  type="button"
                  onClick={choose}
                  disabled={parsing || busy}
                  className="focus-ring shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-60"
                >
                  Choose another file
                </button>
              </div>

              <label className="block">
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                  Course
                </span>
                <select
                  value={courseCode}
                  onChange={(change) => setCourseCode(change.target.value)}
                  disabled={busy}
                  className={`mt-1.5 ${inputClass}`}
                >
                  <option value="">No course</option>
                  {courseCode && !courses.some((course) => course.code === courseCode) && (
                    <option value={courseCode}>{courseCode}</option>
                  )}
                  {courses.map((course) => (
                    <option key={course.id} value={course.code}>
                      {course.code ? `${course.code} — ${course.name}` : course.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={drafts.length > 0 && drafts.every((draft) => draft.selected && draft.date)}
                    onChange={(change) => toggleAll(change.target.checked)}
                    className="h-3.5 w-3.5 accent-violet-500"
                  />
                  Tick every date
                </label>
                <span className="ml-auto">Times default to 9:00 a.m. — edit any row</span>
              </div>

              <div className="space-y-1.5">
                {drafts.map((draft) => (
                  <div
                    key={draft.id}
                    title={draft.raw}
                    className={`rounded-lg border px-2.5 py-2 transition ${
                      draft.selected
                        ? 'border-white/[0.09] bg-white/[0.03]'
                        : 'border-white/[0.05] bg-transparent opacity-55'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={draft.selected}
                        onChange={(change) => patch(draft.id, { selected: change.target.checked })}
                        aria-label={`Include ${draft.title}`}
                        className="mt-2 h-3.5 w-3.5 shrink-0 accent-violet-500"
                      />
                      <div className="min-w-0 flex-1">
                        <input
                          value={draft.title}
                          onChange={(change) => patch(draft.id, { title: change.target.value })}
                          disabled={!draft.selected || busy}
                          aria-label="Assessment name"
                          className={`${inputClass} font-medium`}
                        />
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <input
                            type="date"
                            value={draft.date}
                            onChange={(change) =>
                              patch(draft.id, { date: change.target.value, selected: true })
                            }
                            disabled={busy}
                            aria-label="Due date"
                            className={`${fieldClass} min-w-0 flex-1`}
                          />
                          <input
                            type="time"
                            value={draft.time}
                            onChange={(change) =>
                              patch(draft.id, { time: change.target.value, selected: true })
                            }
                            disabled={busy}
                            aria-label="Due time"
                            className={`${fieldClass} w-[96px] shrink-0`}
                          />
                        </div>
                        <p className="mt-1 truncate text-[10.5px] text-slate-600">{draft.raw}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2.5 text-[12px] text-rose-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-5 py-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || parsing || ready.length === 0}
            className="focus-ring flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-violet-500 to-indigo-600 px-3.5 text-[12px] font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:from-violet-400 hover:to-indigo-500 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {ready.length === 0
              ? 'Add dates'
              : `Add ${ready.length} ${ready.length === 1 ? 'date' : 'dates'} to calendar`}
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
            You can edit or delete any of them later.
          </p>
        </div>
      </div>
    </div>
  );
}
