import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FilePlus2, Loader2, Upload, X } from 'lucide-react';
import type { Course, LibraryFile } from '../../shared/types';
import { uploadLibraryFile } from '../lib/api';

export interface ShelfChoice {
  id: string;
  name: string;
  code: string | null;
}

interface UploadDialogProps {
  open: boolean;
  /** Enrollments, offered as targets when there is no shelf yet. */
  courses: Course[];
  /** Content Space folders that already exist. */
  shelves: ShelfChoice[];
  /** Preselected shelf or D2L course id. */
  initialCourseId?: string | null;
  onClose: () => void;
  /** Called with everything that made it in, so the shelf refreshes at once. */
  onUploaded: (files: LibraryFile[]) => void;
}

interface Target {
  courseId: string;
  courseName: string;
  courseCode: string | null;
}

const MAX_BYTES = 150 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A stable id for a course the user typed in, so its shelf is reused. */
function localCourseId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `local-${slug || 'files'}`;
}

export function UploadDialog({
  open,
  courses,
  shelves,
  initialCourseId,
  onClose,
  onUploaded,
}: UploadDialogProps) {
  const [target, setTarget] = useState('new');
  const [newName, setNewName] = useState('');
  const [folder, setFolder] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    const list: { value: string; label: string }[] = [];
    for (const shelf of shelves) {
      list.push({ value: `shelf:${shelf.id}`, label: shelf.code ? `${shelf.name}` : shelf.name });
    }
    for (const course of courses) {
      // A course that already has a shelf is listed once, above.
      if (shelves.some((shelf) => shelf.id === course.id)) continue;
      list.push({ value: `course:${course.id}`, label: course.code ? `${course.code} — ${course.name}` : course.name });
    }
    return list;
  }, [courses, shelves]);

  useEffect(() => {
    if (!open) return;
    setNewName('');
    setFolder('');
    setFiles([]);
    setDone(0);
    setError(null);
    setDragging(false);
    setBusy(false);

    const known = options.find((option) => option.value === `shelf:${initialCourseId}`) ??
      options.find((option) => option.value === `course:${initialCourseId}`);
    setTarget(known?.value ?? options[0]?.value ?? 'new');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, busy, onClose]);

  if (!open) return null;

  const pick = (incoming: FileList | null) => {
    if (!incoming) return;
    setError(null);
    setFiles(Array.from(incoming).slice(0, 40));
  };

  const resolveTarget = (): Target | null => {
    if (target === 'new') {
      const name = newName.replace(/\s+/g, ' ').trim();
      if (!name) {
        setError('Give the course a name, or pick one from the list.');
        return null;
      }
      return { courseId: localCourseId(name), courseName: name, courseCode: null };
    }
    if (target.startsWith('shelf:')) {
      const shelf = shelves.find((entry) => `shelf:${entry.id}` === target);
      return shelf ? { courseId: shelf.id, courseName: shelf.name, courseCode: shelf.code } : null;
    }
    const course = courses.find((entry) => `course:${entry.id}` === target);
    return course ? { courseId: course.id, courseName: course.name, courseCode: course.code } : null;
  };

  const submit = async () => {
    const destination = resolveTarget();
    if (!destination) return;
    if (files.length === 0) {
      setError('Choose at least one file to upload.');
      return;
    }
    const tooBig = files.find((file) => file.size > MAX_BYTES);
    if (tooBig) {
      setError(`“${tooBig.name}” is over the 150 MB limit.`);
      return;
    }

    setBusy(true);
    setError(null);
    setDone(0);
    const uploaded: LibraryFile[] = [];

    for (const [index, file] of files.entries()) {
      try {
        const result = await uploadLibraryFile({
          ...destination,
          title: file.name.replace(/\.[^.]+$/, '') || file.name,
          folder: folder.replace(/\s+/g, ' ').trim() || null,
          file,
        });
        uploaded.push(result.file);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Could not upload “${file.name}”.`);
        break;
      } finally {
        setDone(index + 1);
      }
    }

    setBusy(false);
    if (uploaded.length > 0) onUploaded(uploaded);
    if (uploaded.length === files.length) onClose();
    else setFiles((current) => current.slice(uploaded.length));
  };

  const total = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Add your own files">
      <div className="panel w-full max-w-lg overflow-hidden">
        <div className="flex items-start gap-3 border-b border-white/[0.06] px-5 py-4">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/12 text-violet-300 ring-1 ring-inset ring-violet-400/20">
            <FilePlus2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[15px] font-semibold tracking-tight text-white">Add your own files</h2>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
              Papers from another class, a friend’s notes, a scanned midterm — they sit in the course you pick, grouped
              by unit like everything else.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Course</span>
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              disabled={busy}
              className="focus-ring mt-1.5 h-9 w-full rounded-lg border border-white/[0.08] bg-[#12131a] px-2.5 text-[12.5px] text-slate-200 transition focus:border-violet-400/40"
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              <option value="new">New course…</option>
            </select>
          </label>

          {target === 'new' && (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Course name</span>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                disabled={busy}
                autoFocus
                placeholder="e.g. CHEM 222 — extra practice"
                className="focus-ring mt-1.5 h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-[12.5px] text-slate-200 placeholder:text-slate-600 transition focus:border-violet-400/40"
              />
            </label>
          )}

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Unit or folder <span className="normal-case tracking-normal text-slate-600">(optional)</span>
            </span>
            <input
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
              disabled={busy}
              placeholder="e.g. Unit 3"
              className="focus-ring mt-1.5 h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-[12.5px] text-slate-200 placeholder:text-slate-600 transition focus:border-violet-400/40"
            />
            <span className="mt-1 block text-[10.5px] text-slate-600">
              Where the files are filed, even if their names mention another unit.
            </span>
          </label>

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Files</span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                pick(event.dataTransfer.files);
              }}
              disabled={busy}
              className={`focus-ring mt-1.5 flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition ${
                dragging
                  ? 'border-violet-400/50 bg-violet-500/[0.08]'
                  : 'border-white/[0.12] bg-white/[0.02] hover:border-white/25'
              }`}
            >
              <Upload className="h-4 w-4 text-slate-400" />
              <span className="text-[12px] text-slate-300">
                {files.length === 0
                  ? 'Drop files here or click to choose'
                  : `${files.length} ${files.length === 1 ? 'file' : 'files'} · ${formatSize(total)}`}
              </span>
              <span className="text-[10.5px] text-slate-600">PDF, Word, PowerPoint, images · 150 MB each</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                pick(event.target.files);
                event.target.value = '';
              }}
            />

            {files.length > 0 && (
              <ul className="mt-2 max-h-[104px] space-y-1 overflow-y-auto">
                {files.map((file) => (
                  <li
                    key={`${file.name}-${file.size}`}
                    className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-400"
                  >
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-slate-600">{formatSize(file.size)}</span>
                    {!busy && (
                      <button
                        type="button"
                        onClick={() => setFiles((current) => current.filter((entry) => entry !== file))}
                        aria-label={`Remove ${file.name}`}
                        className="focus-ring grid h-5 w-5 place-items-center rounded text-slate-500 hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2.5 text-[12px] text-rose-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-3">
          <span className="text-[11px] text-slate-600">Saved on this computer only.</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="focus-ring rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-slate-300 transition hover:bg-white/[0.05] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || files.length === 0}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-violet-500/90 px-3.5 py-1.5 text-[12px] font-medium text-white transition hover:bg-violet-500 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {busy ? `Uploading ${Math.min(done + 1, files.length)} of ${files.length}` : 'Add to Content Space'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
