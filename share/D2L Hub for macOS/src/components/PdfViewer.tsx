import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Contrast,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { LibraryFile } from '../../shared/types';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import '../lib/pdf-polyfills';

interface PdfViewerProps {
  file: LibraryFile | null;
  onClose: () => void;
}

const INVERT_KEY = 'd2l-hub.pdf-invert';
const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

function readInvert(): boolean {
  try {
    return localStorage.getItem(INVERT_KEY) === '1';
  } catch {
    return false;
  }
}

export function PdfViewer({ file, onClose }: PdfViewerProps) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [invert, setInvert] = useState(readInvert);
  const [fitWidth, setFitWidth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const loadRef = useRef(0);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const url = file ? `/api/library/file/${file.id}` : null;

  useEffect(() => {
    setDoc(null);
    setPage(1);
    setPageInput('1');
    setZoom(1);
    setRotation(0);
    setLoading(Boolean(file));
    setError(null);
    if (!file || !url) return;

    const loadId = loadRef.current + 1;
    loadRef.current = loadId;

    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const PdfWorker = (await import('../pdf.worker?worker')).default;
        pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
        const loaded = await pdfjs.getDocument({ url }).promise;
        if (loadRef.current !== loadId) {
          void loaded.destroy();
          return;
        }
        setDoc(loaded);
        setLoading(false);
      } catch (err) {
        if (loadRef.current !== loadId) return;
        console.error('PDF could not be opened', err);
        setLoading(false);
        setError(
          err instanceof Error && /password/i.test(err.message)
            ? 'This PDF is password protected.'
            : 'This PDF could not be opened. It may be damaged or not a PDF.',
        );
      }
    })();
  }, [file, url]);

  useEffect(() => {
    return () => {
      void doc?.destroy();
    };
  }, [doc]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!file) return;
      if (event.key === 'Escape') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else onClose();
      } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        setPage((current) => Math.min(current + 1, doc?.numPages ?? current));
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        setPage((current) => Math.max(current - 1, 1));
      } else if (event.key === '+' || event.key === '=') {
        setZoom((current) => Math.min(3, +(current + 0.15).toFixed(2)));
      } else if (event.key === '-') {
        setZoom((current) => Math.max(0.5, +(current - 0.15).toFixed(2)));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [file, doc, onClose]);

  useEffect(() => {
    setPage((current) => (doc ? Math.min(current, doc.numPages) : current));
  }, [doc]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const toggleInvert = useCallback(() => {
    setInvert((current) => {
      const next = !current;
      try {
        localStorage.setItem(INVERT_KEY, next ? '1' : '0');
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);

  const renderPage = useCallback(async () => {
    if (!doc || !canvasRef.current) return;
    const targetPage = Math.min(Math.max(page, 1), doc.numPages);
    const rendered = await doc.getPage(targetPage);
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    // Navigating quickly would otherwise start a second render on the same canvas.
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;

    const base = rendered.getViewport({ scale: 1, rotation });
    const available = scrollRef.current?.clientWidth ?? 0;
    const fitScale = available > 48 ? (available - 48) / base.width : 1;
    const scale = Math.max(0.2, (fitWidth ? fitScale : 1) * zoom);
    const viewport = rendered.getViewport({ scale, rotation });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const task = rendered.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    renderTaskRef.current = task;

    try {
      await task.promise;
    } catch (err) {
      if (!(err instanceof Error && /cancelled/i.test(err.message))) {
        setError('That page could not be drawn.');
      }
    } finally {
      if (renderTaskRef.current === task) renderTaskRef.current = null;
    }
  }, [doc, page, zoom, rotation, fitWidth]);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    void (async () => {
      if (!cancelled) await renderPage();
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [doc, renderPage]);

  // Keep a fit-width page fitted when the window or fullscreen state changes.
  useEffect(() => {
    if (!doc || !fitWidth) return;
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      void renderPage();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [doc, fitWidth, renderPage]);

  useEffect(() => {
    const handler = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const changeZoom = (direction: 1 | -1) => {
    setFitWidth(false);
    setZoom((current) => {
      const index = ZOOM_STEPS.findIndex((step) => step >= current - 0.001);
      const next = direction === 1 ? Math.min(index + 1, ZOOM_STEPS.length - 1) : Math.max(index - 1, 0);
      return ZOOM_STEPS[Math.max(0, next)];
    });
  };

  const goToPage = (value: number) => {
    if (!doc) return;
    setPage(Math.min(Math.max(Math.round(value), 1), doc.numPages));
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch {
      /* fullscreen is a nicety, not a requirement */
    }
  };

  const pages = doc?.numPages ?? 0;
  const percent = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom]);

  if (!file) return null;

  return (
    <div
      ref={shellRef}
      className="fixed inset-0 z-[80] flex flex-col bg-[#0a0c12]"
      role="dialog"
      aria-modal="true"
      aria-label={`${file.title} PDF`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] bg-[var(--chrome-solid)] px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close PDF"
          className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-slate-100">{file.title}</p>
          <p className="truncate text-[10.5px] text-slate-500">
            {file.courseName} · {file.fileName}
          </p>
        </div>

        <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
            disabled={page <= 1}
            aria-label="Previous page"
            className="focus-ring grid h-8 w-8 place-items-center rounded-l-lg text-slate-400 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              goToPage(Number(pageInput) || page);
            }}
            className="flex items-center gap-1 px-1"
          >
            <input
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => goToPage(Number(pageInput) || page)}
              aria-label="Page number"
              className="h-6 w-8 rounded border border-white/[0.08] bg-white/[0.04] text-center text-[11px] text-slate-200 outline-none focus:border-violet-400/40"
            />
            <span className="text-[10.5px] text-slate-500">/ {pages || '—'}</span>
          </form>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(current + 1, pages || current))}
            disabled={!pages || page >= pages}
            aria-label="Next page"
            className="focus-ring grid h-8 w-8 place-items-center rounded-r-lg text-slate-400 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
          <button
            type="button"
            onClick={() => changeZoom(-1)}
            aria-label="Zoom out"
            className="focus-ring grid h-8 w-8 place-items-center rounded-l-lg text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-11 text-center text-[10.5px] tabular-nums text-slate-400">{percent}</span>
          <button
            type="button"
            onClick={() => changeZoom(1)}
            aria-label="Zoom in"
            className="focus-ring grid h-8 w-8 place-items-center rounded-r-lg text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setFitWidth(true);
            setZoom(1);
          }}
          title="Fit width"
          aria-pressed={fitWidth}
          className={`focus-ring hidden h-8 rounded-lg border px-2.5 text-[10.5px] font-medium transition sm:block ${
            fitWidth
              ? 'border-violet-400/30 bg-violet-500/[0.14] text-violet-200'
              : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white'
          }`}
        >
          Fit width
        </button>

        <button
          type="button"
          onClick={() => setRotation((current) => (current + 90) % 360)}
          title="Rotate"
          className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
        >
          <RotateCw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={toggleInvert}
          title="Invert colours"
          aria-pressed={invert}
          className={`focus-ring grid h-8 w-8 place-items-center rounded-lg border transition ${
            invert
              ? 'border-violet-400/30 bg-violet-500/[0.14] text-violet-200'
              : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:bg-white/[0.08] hover:text-white'
          }`}
        >
          <Contrast className="h-4 w-4" />
        </button>

        <a
          href={url ?? undefined}
          download={file.fileName}
          title="Save a copy"
          className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
        >
          <Download className="h-4 w-4" />
        </a>

        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          title="Fullscreen"
          className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto bg-[#14161d] px-4 py-5"
        onDoubleClick={() => void toggleFullscreen()}
      >
        {loading && (
          <div className="flex h-full items-center justify-center gap-2 text-[12px] text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening PDF…
          </div>
        )}

        {error && !loading && (
          <div className="mx-auto mt-16 max-w-sm rounded-xl border border-rose-400/20 bg-rose-500/[0.08] px-4 py-5 text-center">
            <p className="text-[12.5px] text-rose-200">{error}</p>
          </div>
        )}

        <div className={`flex justify-center ${loading || error ? 'hidden' : ''}`}>
          <canvas
            ref={canvasRef}
            className="rounded-sm shadow-[0_18px_50px_-12px_rgba(0,0,0,0.8)]"
            style={{ filter: invert ? 'invert(1) hue-rotate(180deg)' : undefined }}
          />
        </div>
      </div>
    </div>
  );
}
