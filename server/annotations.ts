import fs from 'node:fs';
import path from 'node:path';
import type { PdfInkAnnotations, PdfInkPoint, PdfInkStroke, PdfInkTool } from '../shared/types';
import { DATA_DIR } from './config';
import { libraryFilePath } from './library';

/**
 * Ink layers for Content Space PDFs. One small JSON file per document, next to
 * the downloaded bytes, so annotations stay on this computer with the PDF.
 */
const INK_DIR = path.join(DATA_DIR, 'annotations');
const MAX_STROKES = 3000;
const MAX_POINTS_PER_STROKE = 4000;
const MAX_TOTAL_POINTS = 150_000;
const MAX_BYTES = 6 * 1024 * 1024;

const EMPTY: PdfInkAnnotations = { version: 1, strokes: [] };

function isPdfFile(name: string, mime: string): boolean {
  return /^application\/pdf\b/i.test(mime) || /\.pdf$/i.test(name);
}

function inkPath(id: unknown): string | null {
  const found = libraryFilePath(id);
  if (!found || !isPdfFile(found.file.fileName, found.file.mime)) return null;
  return path.join(INK_DIR, `${found.file.id}.json`);
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function strokeId(value: unknown, index: number): string {
  return typeof value === 'string' && /^[a-z0-9_-]{4,80}$/i.test(value)
    ? value
    : `srv-${Date.now().toString(36)}-${index.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function point(raw: unknown): PdfInkPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const x = finite(input.x, Number.NaN);
  const y = finite(input.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > 20_000 || Math.abs(y) > 20_000) return null;
  return {
    x: round(x),
    y: round(y),
    pressure: round(clamp(finite(input.pressure, 0.5), 0, 1), 3),
  };
}

function stroke(raw: unknown, index: number, budget: number): PdfInkStroke | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const page = Math.round(finite(input.page, Number.NaN));
  if (!Number.isFinite(page) || page < 1 || page > 20_000) return null;
  const tool: PdfInkTool = input.tool === 'highlighter' ? 'highlighter' : 'pen';
  if (input.tool !== 'pen' && input.tool !== 'highlighter') return null;
  const color = typeof input.color === 'string' && /^#[0-9a-f]{6}$/i.test(input.color)
    ? input.color.toLowerCase()
    : null;
  if (!color) return null;
  if (!Array.isArray(input.points)) return null;

  const points: PdfInkPoint[] = [];
  for (const rawPoint of input.points.slice(0, Math.min(MAX_POINTS_PER_STROKE, budget))) {
    const next = point(rawPoint);
    if (next) points.push(next);
  }
  if (points.length < 2) return null;

  return {
    id: strokeId(input.id, index),
    page,
    tool,
    color,
    width: round(clamp(finite(input.width, 2), 0.2, 80)),
    opacity: round(clamp(finite(input.opacity, 1), 0.05, 1), 2),
    points,
  };
}

/**
 * Accept only what the viewer can draw, and cap the total size so a bug (or a
 * hand-edited JSON file) can never create a runaway annotation layer.
 */
export function sanitizePdfInk(raw: unknown): PdfInkAnnotations {
  if (!raw || typeof raw !== 'object') return { ...EMPTY };
  const input = raw as Record<string, unknown>;
  if (!Array.isArray(input.strokes)) return { ...EMPTY };

  const strokes: PdfInkStroke[] = [];
  let pointsLeft = MAX_TOTAL_POINTS;
  for (const [index, rawStroke] of input.strokes.slice(0, MAX_STROKES).entries()) {
    if (pointsLeft <= 0) break;
    const next = stroke(rawStroke, index, pointsLeft);
    if (!next) continue;
    pointsLeft -= next.points.length;
    strokes.push(next);
  }
  return { version: 1, strokes };
}

export function readPdfInk(id: unknown): PdfInkAnnotations {
  const file = inkPath(id);
  if (!file) throw new Error('That PDF is no longer in Content Space.');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    return sanitizePdfInk(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return { ...EMPTY };
    // A corrupt sidecar must not stop the PDF opening; the next save replaces it.
    return { ...EMPTY };
  }
}

export function savePdfInk(id: unknown, raw: unknown): PdfInkAnnotations {
  const file = inkPath(id);
  if (!file) throw new Error('That PDF is no longer in Content Space.');
  const annotations = sanitizePdfInk(raw);
  const body = JSON.stringify(annotations);
  if (Buffer.byteLength(body) > MAX_BYTES) {
    throw new Error('These annotations are too large. Erase some ink and try again.');
  }

  fs.mkdirSync(INK_DIR, { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, body, { mode: 0o600 });
  fs.renameSync(temp, file);
  return annotations;
}
