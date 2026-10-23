import type { PdfInkPoint, PdfInkStroke } from '../../shared/types';

/** The slice of a pdf.js page viewport the ink layer needs. */
export interface InkViewport {
  scale: number;
  convertToViewportPoint(x: number, y: number): number[];
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export function toScreen(viewport: InkViewport, point: PdfInkPoint): ScreenPoint {
  const [x, y] = viewport.convertToViewportPoint(point.x, point.y);
  return { x, y };
}

export function screenToPdf(
  viewport: { convertToPdfPoint(x: number, y: number): number[] },
  x: number,
  y: number,
): { x: number; y: number } {
  const [pdfX, pdfY] = viewport.convertToPdfPoint(x, y);
  return { x: pdfX, y: pdfY };
}

/** Screen pixels become PDF points, so a stroke keeps its size at every zoom. */
export function brushWidthInPdf(viewport: { scale: number }, screenWidth: number): number {
  return Math.max(0.15, screenWidth / Math.max(0.05, viewport.scale));
}

function smoothPath(ctx: CanvasRenderingContext2D, points: ScreenPoint[]): void {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    ctx.quadraticCurveTo(
      current.x,
      current.y,
      (current.x + next.x) / 2,
      (current.y + next.y) / 2,
    );
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

function drawOne(ctx: CanvasRenderingContext2D, stroke: PdfInkStroke, viewport: InkViewport): void {
  if (stroke.points.length < 2) return;
  const screen = stroke.points.map((point) => toScreen(viewport, point));
  const baseWidth = Math.max(0.5, stroke.width * viewport.scale);
  ctx.save();
  ctx.globalAlpha = stroke.opacity;
  ctx.strokeStyle = stroke.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.tool === 'highlighter') {
    // One path keeps the translucent highlighter from stacking darker at joins.
    ctx.globalAlpha = Math.min(0.55, stroke.opacity);
    ctx.lineWidth = Math.max(2, baseWidth);
    smoothPath(ctx, screen);
    ctx.stroke();
    ctx.restore();
    return;
  }

  for (let index = 1; index < screen.length; index += 1) {
    const from = screen[index - 1];
    const to = screen[index];
    const pressure = Math.max(0.05, (stroke.points[index - 1].pressure + stroke.points[index].pressure) / 2);
    ctx.lineWidth = Math.max(0.5, baseWidth * (0.45 + pressure * 1.1));
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw one page's ink. The context transform must already be in CSS pixels. */
export function drawInkStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: PdfInkStroke[],
  page: number,
  viewport: InkViewport,
  extra?: PdfInkStroke | null,
): void {
  for (const stroke of strokes) {
    if (stroke.page === page) drawOne(ctx, stroke, viewport);
  }
  if (extra && extra.page === page) drawOne(ctx, extra, viewport);
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** Ids of strokes whose ink falls under the eraser circle, in PDF coordinates. */
export function eraseStrokesAt(
  strokes: PdfInkStroke[],
  page: number,
  point: { x: number; y: number },
  radius: number,
): string[] {
  const hit: string[] = [];
  for (const stroke of strokes) {
    if (stroke.page !== page) continue;
    const reach = radius + stroke.width / 2;
    let touched = false;
    if (stroke.points.length === 1) {
      touched = Math.hypot(point.x - stroke.points[0].x, point.y - stroke.points[0].y) <= reach;
    }
    for (let index = 1; !touched && index < stroke.points.length; index += 1) {
      const a = stroke.points[index - 1];
      const b = stroke.points[index];
      touched = distanceToSegment(point.x, point.y, a.x, a.y, b.x, b.y) <= reach;
    }
    if (touched) hit.push(stroke.id);
  }
  return hit;
}

export function newStrokeId(): string {
  return `ink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
