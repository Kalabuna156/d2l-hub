import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PageViewport, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { PdfInkStroke } from '../../shared/types';
import { PdfInkLayer, type PdfTool } from './PdfInkLayer';

interface PdfPageProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  /** Unrotated page size in PDF points, or null until the viewer has it */
  size: { width: number; height: number } | null;
  /** Width of the reading column, in CSS pixels */
  width: number;
  zoom: number;
  fitWidth: boolean;
  rotation: number;
  invert: boolean;
  /** The scrolling element, so pages only render near the reader */
  scrollRoot: RefObject<HTMLDivElement | null>;
  tool: PdfTool;
  color: string;
  brushSize: number;
  strokes: PdfInkStroke[];
  onAddStroke: (stroke: PdfInkStroke) => void;
  onErase: (ids: string[]) => void;
  onViewport: (page: number, viewport: PageViewport) => void;
}

/** US Letter, used only until the page's real size is known. */
const LETTER_ASPECT = 792 / 612;
const GUTTER = 48;
/** Render pages a screen or so ahead, so scrolling never outruns the canvas. */
const LAZY_MARGIN = '1200px 0px';

/**
 * One page of a continuously scrolling PDF: its own canvas, its own ink layer.
 * Only pages near the reader draw, and far ones give their pixels back.
 */
export function PdfPage({
  doc,
  pageNumber,
  size,
  width,
  zoom,
  fitWidth,
  rotation,
  invert,
  scrollRoot,
  tool,
  color,
  brushSize,
  strokes,
  onAddStroke,
  onErase,
  onViewport,
}: PdfPageProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const [near, setNear] = useState(false);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = holderRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setNear(entry.isIntersecting);
      },
      { root: scrollRoot.current, rootMargin: LAZY_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [scrollRoot]);

  /** Page width in points once rotated, which fit-width scales against. */
  const baseWidth = size ? (rotation % 180 === 0 ? size.width : size.height) : null;

  // A sized box is always better than a stale bitmap: when the layout changes,
  // fall back to the reserved space until this page has drawn at the new size.
  useEffect(() => {
    setViewport(null);
  }, [fitWidth, rotation, width, zoom]);

  // Scrolling far past a page frees its bitmap; a full-size canvas is several
  // megabytes, and a long read would otherwise keep every page in memory.
  useEffect(() => {
    if (near) return;
    const canvas = canvasRef.current;
    if (canvas && canvas.width > 2) {
      canvas.width = 0;
      canvas.height = 0;
    }
    setViewport(null);
  }, [near]);

  useEffect(() => {
    if (!near || baseWidth === null) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const available = Math.max(160, width - GUTTER);
    const scale = (fitWidth ? available / baseWidth : 1) * zoom;
    let alive = true;
    let task: RenderTask | null = null;

    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (!alive) return;
        const nextViewport = page.getViewport({ scale, rotation });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        taskRef.current?.cancel();
        canvas.width = Math.floor(nextViewport.width * ratio);
        canvas.height = Math.floor(nextViewport.height * ratio);
        task = page.render({
          canvas,
          canvasContext: context,
          viewport: nextViewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        taskRef.current = task;
        await task.promise;
        if (!alive) return;
        setFailed(false);
        setViewport(nextViewport);
        onViewport(pageNumber, nextViewport);
      } catch (err) {
        // Cancelling is normal when zooming or scrolling past a page.
        if (alive && !(err instanceof Error && /cancel/i.test(err.message))) setFailed(true);
      }
    })();

    return () => {
      alive = false;
      task?.cancel();
      if (taskRef.current === task) taskRef.current = null;
    };
  }, [baseWidth, doc, fitWidth, near, onViewport, pageNumber, rotation, width, zoom]);

  const available = Math.max(160, width - GUTTER);
  const boxWidth = viewport
    ? Math.floor(viewport.width)
    : Math.floor(fitWidth ? available : (baseWidth ?? 612) * zoom);
  // Rotating swaps the page's proportions, including before it has drawn.
  const aspect = size
    ? (rotation % 180 === 0 ? size.height / size.width : size.width / size.height)
    : rotation % 180 === 0
      ? LETTER_ASPECT
      : 1 / LETTER_ASPECT;
  const boxHeight = Math.floor(boxWidth * aspect);

  return (
    <div
      ref={holderRef}
      data-pdf-page={pageNumber}
      className="relative shrink-0 overflow-hidden rounded-sm bg-white/[0.04] shadow-[0_18px_50px_-12px_rgba(0,0,0,0.8)]"
      style={{ width: boxWidth, height: boxHeight }}
    >
      <canvas
        ref={canvasRef}
        data-pdf-canvas
        className="block h-full w-full"
        style={{ filter: invert ? 'invert(1) hue-rotate(180deg)' : undefined }}
      />
      {near && !viewport && !failed && (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-white/[0.03]" />
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center px-4 text-center text-[11.5px] text-ink-3">
          Page {pageNumber} could not be shown.
        </div>
      )}
      <PdfInkLayer
        page={pageNumber}
        viewport={viewport}
        strokes={strokes}
        tool={tool}
        color={color}
        brushSize={brushSize}
        onAddStroke={onAddStroke}
        onErase={onErase}
      />
    </div>
  );
}
