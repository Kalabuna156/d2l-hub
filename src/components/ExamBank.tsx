import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Home,
  Library,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { MUES_BANK } from '../../shared/exambank';
import type { AiStatus, DriveEntry, ExamBankFolder, ExamBankLink, LibraryFile } from '../../shared/types';
import { downloadExamBankFile, fetchExamBank } from '../lib/api';
import { PdfViewer } from './PdfViewer';

interface ExamBankProps {
  /** The built-in MUES archive plus folders added in Settings. */
  banks?: ExamBankLink[];
  /** Lets the rest of the app pick up anything saved here. */
  onSaved?: () => void;
  ai?: AiStatus | null;
  onOpenSettings?: () => void;
}

interface Crumb {
  id: string;
  name: string;
}

function isPdfEntry(entry: DriveEntry): boolean {
  return /pdf/i.test(entry.type) || /\.pdf$/i.test(entry.name);
}

export function ExamBank({ banks, onSaved, ai = null, onOpenSettings }: ExamBankProps) {
  const bankList = useMemo(() => (banks && banks.length > 0 ? banks : [MUES_BANK]), [banks]);
  const [activeId, setActiveId] = useState(bankList[0].id);
  const activeBank = bankList.find((bank) => bank.id === activeId) ?? bankList[0];

  const [stack, setStack] = useState<Crumb[]>([{ id: '', name: activeBank.name }]);
  const [folder, setFolder] = useState<ExamBankFolder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, LibraryFile>>({});
  const [viewing, setViewing] = useState<LibraryFile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const current = stack[stack.length - 1];
  const folderPath = stack
    .slice(1)
    .map((crumb) => crumb.name)
    .join(' / ');

  // The bank the user picked last may have been removed in Settings.
  useEffect(() => {
    if (!bankList.some((bank) => bank.id === activeId)) setActiveId(bankList[0].id);
  }, [bankList, activeId]);

  // Switching banks starts at that bank's root folder.
  useEffect(() => {
    setStack([{ id: '', name: activeBank.name }]);
    setSaved({});
    setNotice(null);
  }, [activeBank.id, activeBank.name]);

  const load = async (folderId: string, isRoot: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchExamBank(folderId);
      setFolder(next);
      // MUES takes its name from Drive; a custom bank keeps the name the user gave it.
      if (isRoot && activeBank.builtin && next.name) {
        setStack([{ id: '', name: next.name }]);
      }
    } catch (err) {
      setFolder(null);
      setError(err instanceof Error ? err.message : 'Could not open the exam bank.');
    } finally {
      setLoading(false);
    }
  };

  const currentFolderId = current.id || activeBank.folderId;

  useEffect(() => {
    void load(currentFolderId, current.id === '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId]);

  const openFolder = (entry: DriveEntry) => {
    setStack((crumbs) => [...crumbs, { id: entry.id, name: entry.name }]);
    setNotice(null);
  };

  const goTo = (index: number) => {
    setStack((crumbs) => crumbs.slice(0, index + 1));
    setNotice(null);
  };

  const save = async (entry: DriveEntry) => {
    setDownloading(entry.id);
    setError(null);
    setNotice(null);
    try {
      const result = await downloadExamBankFile({
        fileId: entry.id,
        name: entry.name,
        folder: folderPath || current.name,
        bankId: activeBank.id,
        bankName: activeBank.name,
      });
      setSaved((currentSaved) => ({ ...currentSaved, [entry.id]: result.file }));
      onSaved?.();
      if (result.file.mime === 'application/pdf' || /\.pdf$/i.test(result.file.fileName)) {
        setViewing(result.file);
      } else {
        setNotice(`Saved “${result.file.title}” to Content Space.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download that file.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[20px] font-semibold tracking-[-0.026em] text-ink-1">
            {activeBank.name}
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-3">
            {activeBank.builtin
              ? 'Toronto Metropolitan engineering exams, browsed here. No Google account needed.'
              : 'A Drive folder you added, browsed here. No Google account needed.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-line bg-surface-1 px-2.5 py-1 text-[10.5px] text-ink-3 sm:block">
            Public Drive folder
          </span>
          <button
            type="button"
            onClick={() => void load(currentFolderId, current.id === '')}
            aria-label="Refresh exam bank"
            className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-1 text-ink-2 transition hover:border-white/20 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <a
            href={`https://drive.google.com/drive/folders/${currentFolderId}`}
            target="_blank"
            rel="noreferrer"
            title="Open this folder on Google Drive"
            className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-1 text-ink-2 transition hover:border-white/20 hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {bankList.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Exam banks">
          {bankList.map((bank) => {
            const active = bank.id === activeBank.id;
            const Icon = bank.builtin ? Library : Folder;
            return (
              <button
                key={bank.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveId(bank.id)}
                className={`focus-ring inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition ${
                  active
                    ? 'border-amber-400/30 bg-amber-400/[0.1] text-amber-100'
                    : 'border-line bg-surface-1 text-ink-2 hover:border-white/20 hover:text-ink-1'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{bank.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface-1 px-2 py-1.5">
        {stack.map((crumb, index) => {
          const last = index === stack.length - 1;
          return (
            <span key={`${crumb.id}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-3 w-3 text-ink-4" />}
              <button
                type="button"
                onClick={() => goTo(index)}
                disabled={last}
                className={`focus-ring flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] transition ${
                  last
                    ? 'font-medium text-white'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink-1'
                }`}
              >
                {index === 0 && <Home className="h-3 w-3" />}
                <span className="max-w-[180px] truncate">{crumb.name}</span>
              </button>
            </span>
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/[0.07] px-4 py-3 text-[12px] text-rose-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p className="flex-1 leading-relaxed">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-[11px] text-rose-300/70 hover:text-rose-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.07] px-4 py-2.5 text-[11.5px] text-emerald-100">
          <Download className="h-3.5 w-3.5 shrink-0" />
          <p className="flex-1">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-[11px] text-emerald-200/60 hover:text-emerald-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/20">
            <FolderOpen className="h-3.5 w-3.5" />
          </span>
          <h3 className="font-display text-[13px] font-semibold tracking-[-0.01em] text-ink-1">{current.name}</h3>
          {folder && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] text-ink-2">
              {folder.entries.length}
            </span>
          )}
          {folder && (
            <span className="ml-auto text-[10.5px] text-ink-4">
              Updated{' '}
              {new Date(folder.fetchedAt).toLocaleTimeString('en-CA', {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-14 text-[12px] text-ink-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Opening the folder…
          </div>
        ) : !folder || folder.entries.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[13px] text-ink-2">This folder is empty.</p>
            <p className="mt-1 text-[11.5px] text-ink-4">Pick another folder above.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {folder.entries.map((entry) => {
              const isFolder = entry.kind === 'folder';
              const isSaved = saved[entry.id];
              const busy = downloading === entry.id;
              const pdf = isPdfEntry(entry);
              const badge = (
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${
                    isFolder
                      ? 'border-amber-400/15 bg-amber-400/[0.07] text-amber-300'
                      : 'border-line bg-surface-1 text-ink-2'
                  }`}
                >
                  {isFolder ? <Folder className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </span>
              );

              const label = (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-ink-1">{entry.name}</p>
                  <p className="mt-0.5 truncate text-[10.5px] text-ink-3">
                    {entry.type}
                    {entry.modifiedAt ? ` · ${entry.modifiedAt}` : ''}
                    {isSaved ? ' · saved to Content Space' : ''}
                  </p>
                </div>
              );

              // Folder rows are one big button: the whole bar opens them.
              if (isFolder) {
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => openFolder(entry)}
                      aria-label={`Open ${entry.name}`}
                      className="focus-ring group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-1"
                    >
                      {badge}
                      {label}
                      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-ink-3 transition group-hover:text-ink-1">
                        Open
                        <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                      </span>
                    </button>
                  </li>
                );
              }

              return (
                <li key={entry.id} className="group flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03]">
                  {badge}
                  {label}

                  <div className="flex shrink-0 items-center gap-1.5">
                    {isSaved && (
                      <button
                        type="button"
                        onClick={() => setViewing(isSaved)}
                        className="focus-ring inline-flex items-center gap-1 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.08] px-2.5 py-1.5 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-400/[0.14]"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void save(entry)}
                      disabled={busy}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-[11px] font-medium text-ink-2 transition hover:border-violet-400/30 hover:bg-violet-500/[0.1] hover:text-violet-100 disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      {busy ? 'Saving…' : pdf ? 'Save & view' : 'Save'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-center text-[10.5px] leading-relaxed text-ink-4">
        {activeBank.builtin
          ? 'The MUES exam bank is a public Google Drive folder run by the society.'
          : `“${activeBank.name}” is a Google Drive folder you added in Settings.`}{' '}
        Files you save stay on this computer; nothing is uploaded.
      </p>

      {viewing ? (
        <PdfViewer
          file={viewing}
          ai={ai}
          onOpenSettings={onOpenSettings ?? (() => undefined)}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}
