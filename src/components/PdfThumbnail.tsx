import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

interface PdfThumbnailProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  onSelect: (page: number) => void;
}

const THUMB_WIDTH = 104;

/** Only pages near the sidebar viewport keep a canvas, so long PDFs stay light. */
export function PdfThumbnail({ doc, pageNumber, active, onSelect }: PdfThumbnailProps) {
  const holderRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [aspect, setAspect] = useState(0.7727);

  useEffect(() => {
    if (active) holderRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        setVisible(entry.isIntersecting);
      },
      { rootMargin: '280px 0px' },
    );
    observer.observe(holder);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let cancel: (() => void) | null = null;
    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const base = page.getViewport({ scale: 1 });
        if (!cancelled) setAspect(base.width / Math.max(1, base.height));
        const scale = THUMB_WIDTH / base.width;
        const viewport = page.getViewport({ scale });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        const task = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        cancel = () => task.cancel();
        await task.promise;
        if (!cancelled) setReady(true);
      } catch {
        /* a thumbnail is optional; the page itself still opens */
      }
    })();
    return () => {
      cancelled = true;
      cancel?.();
    };
  }, [doc, pageNumber, visible]);

  return (
    <button
      ref={holderRef}
      type="button"
      onClick={() => onSelect(pageNumber)}
      aria-label={`Page ${pageNumber}`}
      aria-current={active ? 'page' : undefined}
      className={`group flex w-full flex-col items-center gap-1.5 rounded-lg p-1.5 transition ${
        active ? 'bg-violet-500/[0.14]' : 'hover:bg-white/[0.05]'
      }`}
    >
      <span
        className={`relative flex w-full justify-center overflow-hidden rounded border bg-white/[0.04] transition ${
          active
            ? 'border-violet-400/60 shadow-[0_0_0_1px_rgba(139,92,246,0.25)]'
            : 'border-white/[0.08] group-hover:border-white/20'
        }`}
        style={{ aspectRatio: String(aspect) }}
      >
        {!ready && <span className="absolute inset-0 animate-pulse bg-white/[0.04]" />}
        {visible && <canvas ref={canvasRef} className="block h-full w-full" />}
      </span>
      <span
        className={`text-[10px] tabular-nums ${
          active ? 'font-semibold text-violet-200' : 'text-slate-500'
        }`}
      >
        {pageNumber}
      </span>
    </button>
  );
}
