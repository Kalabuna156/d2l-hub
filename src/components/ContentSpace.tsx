import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileText,
  FolderOpen,
  FolderSearch,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Trash,
} from 'lucide-react';
import type { AiStatus, Course, LibraryFile } from '../../shared/types';
import { groupLibraryFiles } from '../../shared/library';
import { fetchLibrary, removeLibraryFile, revealLibraryFile, uploadLibraryFile } from '../lib/api';
import { PdfViewer } from './PdfViewer';
import { UploadDialog } from './UploadDialog';

interface CourseShelf {
  id: string;
  name: string;
  code: string | null;
  files: LibraryFile[];
  size: number;
  updatedAt: string;
}

const MAX_BYTES = 150 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return FileImage;
  if (mime.startsWith('video/')) return FileArchive;
  if (/zip|compressed/.test(mime)) return FileArchive;
  return FileText;
}

function isPdf(file: LibraryFile): boolean {
  return file.mime === 'application/pdf' || /\.pdf$/i.test(file.fileName);
}

export function ContentSpace({
  courses = [],
  ai = null,
  onOpenSettings,
}: {
  courses?: Course[];
  ai?: AiStatus | null;
  onOpenSettings?: () => void;
}) {
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCourse, setActiveCourse] = useState<string | null>(null);
  const [viewing, setViewing] = useState<LibraryFile | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /** Shelf a drag is hovering over, so the card can show it accepts drops. */
  const [dragOver, setDragOver] = useState<string | null>(null);
  /** Unit a drag is hovering over inside an open shelf. */
  const [dragSection, setDragSection] = useState<string | null>(null);
  const [dropping, setDropping] = useState<{
    id: string;
    section: string | null;
    done: number;
    total: number;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const library = await fetchLibrary();
      setFiles(library.files);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open Content Space.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const shelves = useMemo<CourseShelf[]>(() => {
    const map = new Map<string, CourseShelf>();
    for (const file of files) {
      const shelf = map.get(file.courseId) ?? {
        id: file.courseId,
        name: file.courseName,
        code: file.courseCode,
        files: [],
        size: 0,
        updatedAt: file.downloadedAt,
      };
      shelf.files.push(file);
      shelf.size += file.size;
      if (new Date(file.downloadedAt).getTime() > new Date(shelf.updatedAt).getTime()) {
        shelf.updatedAt = file.downloadedAt;
      }
      map.set(file.courseId, shelf);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [files]);

  const shelf = shelves.find((entry) => entry.id === activeCourse) ?? null;
  const sections = useMemo(() => (shelf ? groupLibraryFiles(shelf.files) : []), [shelf]);

  const mergeUploaded = (uploaded: LibraryFile[]) => {
    if (uploaded.length === 0) return;
    const ids = new Set(uploaded.map((file) => file.id));
    setFiles((current) => [...uploaded, ...current.filter((file) => !ids.has(file.id))]);
  };

  const onUploaded = (uploaded: LibraryFile[]) => {
    mergeUploaded(uploaded);
    // From the course list, open the shelf the files just landed in.
    if (!activeCourse && uploaded.length > 0) setActiveCourse(uploaded[0].courseId);
  };

  /**
   * Dropping files on a course card files them into that shelf; dropping on a
   * unit inside a shelf also records the unit, so they land in that group.
   */
  const addDropped = async (
    target: CourseShelf,
    listed: FileList | null,
    options: { folder?: string | null; section?: string | null } = {},
  ) => {
    const incoming = listed ? Array.from(listed) : [];
    if (incoming.length === 0) return;

    setError(null);
    const tooBig = incoming.find((file) => file.size > MAX_BYTES);
    if (tooBig) {
      setError(`“${tooBig.name}” is over the 150 MB limit.`);
      return;
    }

    const uploaded: LibraryFile[] = [];
    const section = options.section ?? null;
    setDropping({ id: target.id, section, done: 0, total: incoming.length });

    for (const [index, file] of incoming.entries()) {
      try {
        const result = await uploadLibraryFile({
          courseId: target.id,
          courseCode: target.code,
          courseName: target.name,
          title: file.name.replace(/\.[^.]+$/, '') || file.name,
          folder: options.folder ?? null,
          file,
        });
        uploaded.push(result.file);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Could not add “${file.name}”.`);
        break;
      } finally {
        setDropping({ id: target.id, section, done: index + 1, total: incoming.length });
      }
    }

    setDropping(null);
    mergeUploaded(uploaded);
  };

  const reveal = async (file: LibraryFile) => {
    try {
      await revealLibraryFile(file.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that folder.');
    }
  };

  const remove = async (file: LibraryFile) => {
    setRemoving(file.id);
    try {
      const library = await removeLibraryFile(file.id);
      setFiles(library.files);
      if (viewing?.id === file.id) setViewing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that file.');
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="panel h-[110px] animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="panel h-[132px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[19px] font-semibold tracking-tight text-white">
            {shelf ? shelf.name : 'Content Space'}
          </h2>
          <p className="mt-1 text-[12.5px] text-slate-500">
            {shelf
              ? `${shelf.files.length} ${shelf.files.length === 1 ? 'file' : 'files'} · ${formatSize(shelf.size)} · grouped by unit`
              : `${files.length} ${files.length === 1 ? 'file' : 'files'} saved on this computer.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {shelf && (
            <button
              type="button"
              onClick={() => setActiveCourse(null)}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All courses
            </button>
          )}
          <button
            type="button"
            onClick={() => setUploading(true)}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-500/[0.12] px-2.5 py-1.5 text-[11.5px] font-medium text-violet-100 transition hover:border-violet-400/40 hover:bg-violet-500/[0.18]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add files
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-slate-400 transition hover:border-white/20 hover:text-white"
            aria-label="Refresh Content Space"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/[0.07] px-4 py-3 text-[12px] text-rose-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="flex-1 leading-relaxed">{error}</p>
          <button type="button" onClick={() => setError(null)} className="text-[11px] text-rose-300/70 hover:text-rose-100">
            Dismiss
          </button>
        </div>
      )}

      {files.length === 0 ? (
        <div className="panel grid place-items-center px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-500/10 text-violet-300 ring-1 ring-inset ring-violet-400/20">
            <Download className="h-5 w-5" />
          </span>
          <h3 className="mt-4 font-display text-[15px] font-semibold text-white">Nothing saved yet</h3>
          <p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-slate-500">
            Hover a file in a course’s <span className="text-slate-300">Content</span> tab and press
            the download icon, save something from the <span className="text-slate-300">Exam bank</span>,
            or add your own papers with <span className="text-slate-300">Add files</span>.
            Everything lands here, grouped by unit and readable offline.
          </p>
          <button
            type="button"
            onClick={() => setUploading(true)}
            className="focus-ring mt-4 inline-flex items-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-500/[0.12] px-3 py-1.5 text-[12px] font-medium text-violet-100 transition hover:border-violet-400/40 hover:bg-violet-500/[0.18]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add your own files
          </button>
        </div>
      ) : !shelf ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shelves.map((entry) => {
              const busy = dropping?.id === entry.id && !dropping.section ? dropping : null;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setActiveCourse(entry.id)}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes('Files')) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                    setDragOver(entry.id);
                  }}
                  onDragLeave={() => setDragOver((current) => (current === entry.id ? null : current))}
                  onDrop={(event) => {
                    if (!event.dataTransfer.types.includes('Files')) return;
                    event.preventDefault();
                    setDragOver(null);
                    void addDropped(entry, event.dataTransfer.files);
                  }}
                  className={`focus-ring panel group relative overflow-hidden text-left transition ${
                    dragOver === entry.id
                      ? 'border-violet-400/50 bg-violet-500/[0.07] ring-1 ring-inset ring-violet-400/30'
                      : 'hover:border-white/[0.16] hover:bg-white/[0.045]'
                  }`}
                >
                  <div className="relative h-[72px] overflow-hidden bg-gradient-to-br from-violet-500/25 via-indigo-500/15 to-sky-400/10 px-4 py-3">
                    <FolderOpen className="absolute -right-3 -top-3 h-20 w-20 text-white/[0.06]" strokeWidth={1.2} />
                    <p className="relative font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
                      {entry.code ?? 'Content'} · {entry.files.length} {entry.files.length === 1 ? 'file' : 'files'}
                    </p>
                    <p className="relative mt-2 line-clamp-2 text-[13.5px] font-semibold leading-snug text-white">
                      {entry.name}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 text-[11px] text-slate-500">
                      {busy ? (
                        <p className="flex items-center gap-1.5 text-violet-200">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Adding {Math.min(busy.done + 1, busy.total)} of {busy.total}…
                        </p>
                      ) : (
                        <>
                          <p>{formatSize(entry.size)}</p>
                          <p className="mt-0.5">
                            Updated{' '}
                            {new Date(entry.updatedAt).toLocaleDateString('en-CA', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-violet-300/80 transition group-hover:text-violet-200">
                      {busy ? 'Adding' : 'Open →'}
                    </span>
                  </div>

                  {dragOver === entry.id && (
                    <span className="pointer-events-none absolute inset-0 grid place-items-center bg-[#0b0c15]/70 backdrop-blur-[1px]">
                      <span className="rounded-lg border border-violet-400/30 bg-violet-500/[0.15] px-2.5 py-1 text-[11.5px] font-medium text-violet-100">
                        Drop to add to {entry.code ?? entry.name}
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-center text-[11px] text-slate-600">
            Drop files onto a course card to add them, or use{' '}
            <span className="text-slate-400">Add files</span> to choose a course first.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map((section) => (
            <section
              key={section.key}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes('Files')) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                setDragSection(section.key);
              }}
              onDragLeave={(event) => {
                // Moving onto a child row fires dragleave on the panel; that is
                // not leaving the unit, and reacting to it makes the highlight
                // (and the page) flicker under the cursor.
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setDragSection((current) => (current === section.key ? null : current));
              }}
              onDrop={(event) => {
                if (!event.dataTransfer.types.includes('Files')) return;
                event.preventDefault();
                setDragSection(null);
                if (!shelf) return;
                void addDropped(shelf, event.dataTransfer.files, {
                  // "Other files" has no unit to attach, so it stays unfiled.
                  folder: section.key === 'other' ? null : section.label,
                  section: section.key,
                });
              }}
              className={`panel overflow-hidden transition ${
                dragSection === section.key
                  ? 'border-violet-400/50 bg-violet-500/[0.06] ring-1 ring-inset ring-violet-400/30'
                  : ''
              }`}
            >
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/20">
                  <FolderOpen className="h-3.5 w-3.5" />
                </span>
                <h3 className="font-display text-[13px] font-semibold text-slate-100">{section.label}</h3>
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-slate-400">
                  {section.files.length}
                </span>
                {dragSection === section.key ? (
                  <span className="ml-auto text-[10.5px] font-medium text-violet-200">
                    Drop to add to {section.label}
                  </span>
                ) : dropping?.section === section.key ? (
                  <span className="ml-auto flex items-center gap-1.5 text-[10.5px] text-violet-200">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Adding {Math.min(dropping.done + 1, dropping.total)} of {dropping.total}…
                  </span>
                ) : (
                  <span className="ml-auto text-[10.5px] text-slate-600">
                    {formatSize(section.files.reduce((sum, file) => sum + file.size, 0))}
                  </span>
                )}
              </div>

              <ul className="divide-y divide-white/[0.055]">
                {section.files.map((file) => {
                  const Icon = fileIcon(file.mime);
                  const pdf = isPdf(file);
                  return (
                    <li key={file.id} className="group flex items-center gap-3 px-4 py-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-slate-400">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-slate-200">{file.title}</p>
                        <p className="mt-0.5 truncate text-[10.5px] text-slate-500">
                          {file.fileName.split('.').pop()?.toUpperCase() ?? 'FILE'} · {formatSize(file.size)} ·{' '}
                          {new Date(file.downloadedAt).toLocaleDateString('en-CA', {
                            month: 'short',
                            day: 'numeric',
                          })}
                          {file.source === 'local' ? ' · added by you' : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewing(file)}
                          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-violet-400/30 hover:bg-violet-500/[0.1] hover:text-violet-100"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {pdf ? 'View' : 'Open'}
                        </button>
                        <a
                          href={`/api/library/file/${file.id}`}
                          download={file.fileName}
                          title="Save a copy"
                          className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-white"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => void reveal(file)}
                          title="Show in folder — ready to share"
                          aria-label="Show in folder"
                          className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-white"
                        >
                          <FolderSearch className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(file)}
                          disabled={removing === file.id}
                          title="Remove from Content Space"
                          className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-slate-600 transition hover:bg-rose-500/[0.1] hover:text-rose-300 disabled:opacity-50"
                        >
                          {removing === file.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {sections.length === 0 && (
            <div className="panel px-6 py-12 text-center">
              <p className="text-[13px] text-slate-400">No files in this course.</p>
            </div>
          )}

          <p className="text-center text-[11px] text-slate-600">
            Drop files onto a unit to file them there, or use{' '}
            <span className="text-slate-400">Add files</span> above.
          </p>
        </div>
      )}

      {files.length > 0 && !shelf && (
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-600">
          <Trash className="h-3 w-3" />
          Files stay on this computer; removing one deletes its local copy.
        </p>
      )}

      <UploadDialog
        open={uploading}
        courses={courses}
        shelves={shelves.map((entry) => ({ id: entry.id, name: entry.name, code: entry.code }))}
        initialCourseId={shelf?.id ?? null}
        onClose={() => setUploading(false)}
        onUploaded={onUploaded}
      />

      {viewing && isPdf(viewing) ? (
        <PdfViewer
          file={viewing}
          ai={ai}
          onOpenSettings={onOpenSettings ?? (() => undefined)}
          onClose={() => setViewing(null)}
        />
      ) : viewing ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog">
          <div className="panel w-full max-w-sm px-5 py-5 text-center">
            <p className="text-[13px] text-slate-300">{viewing.fileName}</p>
            <p className="mt-1 text-[11.5px] text-slate-500">
              This file type opens outside the reader.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <a
                href={`/api/library/file/${viewing.id}`}
                target="_blank"
                rel="noreferrer"
                className="focus-ring rounded-lg bg-white/[0.08] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-white/[0.13]"
              >
                Open file
              </a>
              <button
                type="button"
                onClick={() => setViewing(null)}
                className="focus-ring rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-slate-300 hover:bg-white/[0.05]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
