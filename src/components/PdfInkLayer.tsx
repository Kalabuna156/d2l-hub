import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { PageViewport } from 'pdfjs-dist';
import type { PdfInkPoint, PdfInkStroke } from '../../shared/types';
import {
  brushWidthInPdf,
  drawInkStrokes,
  eraseStrokesAt,
  newStrokeId,
  screenToPdf,
} from '../lib/pdf-ink';

export type PdfTool = 'read' | 'pen' | 'highlighter' | 'eraser';

interface PdfInkLayerProps {
  page: number;
  viewport: PageViewport | null;
  strokes: PdfInkStroke[];
  tool: PdfTool;
  color: string;
  /** Brush diameter in screen pixels */
  brushSize: number;
  onAddStroke: (stroke: PdfInkStroke) => void;
  onErase: (ids: string[]) => void;
}

interface ClientPoint {
  clientX: number;
  clientY: number;
}

function canvasScreenPoint(canvas: HTMLCanvasElement, viewport: PageViewport, event: ClientPoint) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * viewport.width,
    y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * viewport.height,
  };
}

function pressureOf(event: PointerEvent | ReactPointerEvent<HTMLCanvasElement>): number {
  const native = 'nativeEvent' in event ? event.nativeEvent : event;
  if (native.pointerType === 'mouse') return 0.5;
  return native.pressure > 0 ? Math.min(1, native.pressure) : 0.5;
}

export function PdfInkLayer({
  page,
  viewport,
  strokes,
  tool,
  color,
  brushSize,
  onAddStroke,
  onErase,
}: PdfInkLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef<number | null>(null);
  const activeRef = useRef<PdfInkStroke | null>(null);
  const erasingRef = useRef<Set<string>>(new Set());
  /**
   * Strokes that have been released but may not have reached the viewer's
   * state yet. Painting them from a ref keeps the ink on screen even when a
   * parent re-render is slow, instead of flashing away until the next render.
   */
  const pendingRef = useRef<PdfInkStroke[]>([]);
  const pendingErasedRef = useRef<Set<string>>(new Set());
  const frameRef = useRef(0);
  const lastScreenRef = useRef<{ x: number; y: number } | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The page has scrolled out of view and given up its space: release this
    // bitmap too, and draw it again when the page comes back.
    if (!viewport) {
      if (canvas.width > 0 || canvas.height > 0) {
        canvas.width = 0;
        canvas.height = 0;
      }
      return;
    }
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(viewport.width));
    const height = Math.max(1, Math.floor(viewport.height));
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const hidden = new Set([...erasingRef.current, ...pendingErasedRef.current]);
    const visible = hidden.size ? strokes.filter((stroke) => !hidden.has(stroke.id)) : strokes;
    const known = new Set(visible.map((stroke) => stroke.id));
    const pending = pendingRef.current.filter(
      (stroke) => !known.has(stroke.id) && !hidden.has(stroke.id),
    );
    drawInkStrokes(context, pending.length ? [...visible, ...pending] : visible, page, viewport, activeRef.current);
  }, [page, strokes, viewport]);

  // A frame scheduled on pointer-up must paint the *new* stroke after React
  // commits it. Calling the closure captured at schedule time would clear the
  // canvas with the old stroke list and make released ink flash away.
  const renderRef = useRef(render);
  useLayoutEffect(() => {
    renderRef.current = render;
  }, [render]);

  const schedule = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      renderRef.current();
    });
  }, []);

  // Once the viewer's state carries a committed stroke, the local copy is no
  // longer needed. Before that point it is the only thing painting the stroke.
  useEffect(() => {
    pendingRef.current = [];
    pendingErasedRef.current.clear();
  }, [strokes]);

  useLayoutEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    return () => window.cancelAnimationFrame(frameRef.current);
  }, []);

  useEffect(() => {
    activeRef.current = null;
    erasingRef.current.clear();
    pendingRef.current = [];
    pendingErasedRef.current.clear();
    drawingRef.current = null;
    schedule();
  }, [page, schedule]);

  const eraseAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !viewport) return;
    const screen = canvasScreenPoint(canvas, viewport, { clientX, clientY });
    const pdf = screenToPdf(viewport, screen.x, screen.y);
    const ids = eraseStrokesAt(
      [...strokes, ...pendingRef.current],
      page,
      pdf,
      brushSize / 2 / Math.max(0.05, viewport.scale),
    );
    let changed = false;
    for (const id of ids) {
      if (erasingRef.current.has(id)) continue;
      erasingRef.current.add(id);
      changed = true;
    }
    if (changed) schedule();
  };

  const finish = (event?: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drawingRef.current === null) return;
    if (event && canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }
    drawingRef.current = null;
    lastScreenRef.current = null;
    if (erasingRef.current.size) {
      const ids = [...erasingRef.current];
      erasingRef.current.clear();
      for (const id of ids) pendingErasedRef.current.add(id);
      onErase(ids);
    }
    const stroke = activeRef.current;
    activeRef.current = null;
    if (stroke && stroke.points.length >= 1) {
      // A tap with no movement is a dot. Two nearly identical points give it a
      // round cap the saved layer can draw again later.
      if (stroke.points.length === 1) {
        const point = stroke.points[0];
        stroke.points.push({ ...point, x: point.x + 0.01, y: point.y + 0.01 });
      }
      pendingRef.current.push(stroke);
      onAddStroke(stroke);
    }
    schedule();
  };

  const handleDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === 'read' || !viewport) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = event.pointerId;
    const screen = canvasScreenPoint(canvas, viewport, event);
    lastScreenRef.current = screen;

    if (tool === 'eraser') {
      eraseAt(event.clientX, event.clientY);
      return;
    }

    const pdf = screenToPdf(viewport, screen.x, screen.y);
    const point: PdfInkPoint = {
      x: pdf.x,
      y: pdf.y,
      pressure: pressureOf(event),
    };
    activeRef.current = {
      id: newStrokeId(),
      page,
      tool,
      color,
      width: brushWidthInPdf(viewport, brushSize),
      opacity: tool === 'highlighter' ? 0.32 : 1,
      points: [point],
    };
    schedule();
  };

  const handleMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drawingRef.current !== event.pointerId || !viewport) return;
    event.preventDefault();

    if (tool === 'eraser') {
      eraseAt(event.clientX, event.clientY);
      return;
    }

    const canvas = event.currentTarget;
    const native = event.nativeEvent;
    const samples =
      typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [native];
    const stroke = activeRef.current;
    if (!stroke) return;
    let added = false;
    for (const sample of samples.length ? samples : [native]) {
      const screen = canvasScreenPoint(canvas, viewport, sample);
      const last = lastScreenRef.current;
      if (last && Math.hypot(screen.x - last.x, screen.y - last.y) < 0.6) continue;
      const pdf = screenToPdf(viewport, screen.x, screen.y);
      stroke.points.push({ x: pdf.x, y: pdf.y, pressure: pressureOf(sample) });
      lastScreenRef.current = screen;
      added = true;
      if (stroke.points.length >= 4000) break;
    }
    if (added) schedule();
  };

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-pdf-ink
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event)}
      onLostPointerCapture={(event) => {
        if (drawingRef.current === event.pointerId) finish();
      }}
      className="absolute left-0 top-0 touch-none"
      style={{
        width: viewport?.width ?? 0,
        height: viewport?.height ?? 0,
        cursor: tool === 'read' ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair',
        pointerEvents: tool === 'read' || !viewport ? 'none' : 'auto',
      }}
    />
  );
}
