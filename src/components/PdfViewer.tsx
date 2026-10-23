import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Contrast,
  Copy,
  Download,
  Eraser,
  Highlighter,
  Loader2,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Redo2,
  RotateCw,
  ScanText,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { AiStatus, PdfInkStroke, PdfOcrResult, LibraryFile } from '../../shared/types';
import type { PageViewport, PDFDocumentProxy } from 'pdfjs-dist';
import {
  askAiAboutPage,
  fetchAiStatus,
  fetchPdfInk,
  fetchPdfOcr,
  recognizePdfPage,
  savePdfInk,
  transcribePdfHandwriting,
} from '../lib/api';
import { PdfAiPanel, type PdfAiMessage } from './PdfAiPanel';
import type { PdfTool } from './PdfInkLayer';
import { PdfPage } from './PdfPage';
import { PdfThumbnail } from './PdfThumbnail';
import '../lib/pdf-polyfills';

interface PdfViewerProps {
  file: LibraryFile | null;
  ai: AiStatus | null;
  onOpenSettings: () => void;
  onClose: () => void;
}

interface InkState {
  strokes: PdfInkStroke[];
  undo: PdfInkStroke[][];
  redo: PdfInkStroke[][];
}

interface SearchHit {
  page: number;
  count: number;
}

const INVERT_KEY = 'd2l-hub.pdf-invert';
const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const MAX_UNDO = 40;
const INK_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#0f172a'];

function emptyInk(): InkState {
  return { strokes: [], undo: [], redo: [] };
}

function readInvert(): boolean {
  try {
    return localStorage.getItem(INVERT_KEY) === '1';
  } catch {
    return false;
  }
}

/** The line in the viewport that decides which page is being read. */
function readingLine(element: HTMLElement): number {
  return Math.min(200, element.clientHeight * 0.35);
}

function countMatches(text: string, query: string): number {
  if (!query) return 0;
  let count = 0;
  let from = 0;
  while (from < text.length) {
    const found = text.indexOf(query, from);
    if (found === -1) break;
    count += 1;
    from = found + query.length;
  }
  return count;
}

export function PdfViewer({ file, ai, onOpenSettings, onClose }: PdfViewerProps) {
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
  /** Effective scale of the page being read, for the zoom read-out */
  const [viewScale, setViewScale] = useState<number | null>(null);
  /** Width of the reading column; every page sizes itself against it */
  const [containerWidth, setContainerWidth] = useState(0);
  /** Unrotated page sizes, so every page reserves the right space before it draws */
  const [pageSizes, setPageSizes] = useState<Map<number, { width: number; height: number }>>(new Map());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [tool, setTool] = useState<PdfTool>('read');
  const [ink, setInk] = useState<InkState>(emptyInk);
  const [inkReady, setInkReady] = useState(false);
  const [inkLoading, setInkLoading] = useState(false);
  const [inkError, setInkError] = useState<string | null>(null);
  const [inkReload, setInkReload] = useState(0);
  const [brushColor, setBrushColor] = useState(INK_COLORS[0]);
  const [brushSize, setBrushSize] = useState(3);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchNote, setSearchNote] = useState<string | null>(null);

  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<PdfOcrResult | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrPages, setOcrPages] = useState<number[]>([]);
  const [ocrRevision, setOcrRevision] = useState(0);
  const [copied, setCopied] = useState(false);

  const [handwritingBusy, setHandwritingBusy] = useState(false);
  const [handwritingText, setHandwritingText] = useState<string | null>(null);
  const [handwritingFound, setHandwritingFound] = useState(false);
  const [handwritingError, setHandwritingError] = useState<string | null>(null);

  const [aiStatus, setAiStatus] = useState<AiStatus | null>(ai);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<PdfAiMessage[]>([]);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadRef = useRef(0);
  const pageNodesRef = useRef<Map<number, HTMLElement>>(new Map());
  const viewportsRef = useRef<Map<number, PageViewport>>(new Map());
  const currentPageRef = useRef(1);
  const pagesRef = useRef<HTMLDivElement>(null);
  /** Where the reader was inside the current page, across a zoom or rotation */
  const anchorRef = useRef<{ page: number; fraction: number } | null>(null);
  const anchorTimerRef = useRef(0);
  const inkLoadRef = useRef(0);
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const latestStrokesRef = useRef<PdfInkStroke[]>([]);
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const textCacheRef = useRef<Map<number, string>>(new Map());
  const searchTokenRef = useRef(0);
  const ocrLoadRef = useRef(0);
  const ocrTokenRef = useRef(0);
  const handwritingTokenRef = useRef(0);

  const fileId = file?.id ?? null;
  const url = fileId ? `/api/library/file/${fileId}` : null;

  useEffect(() => {
    setDoc(null);
    setPage(1);
    setPageInput('1');
    setZoom(1);
    setRotation(0);
    setViewScale(null);
    currentPageRef.current = 1;
    scrollRef.current?.scrollTo({ top: 0 });
    setLoading(Boolean(file));
    setError(null);
    setTool('read');
    setSearchOpen(false);
    setQuery('');
    setSearchHits([]);
    setSearchNote(null);
    setOcrOpen(false);
    setOcrLoading(false);
    setOcrResult(null);
    setOcrError(null);
    setOcrPages([]);
    setCopied(false);
    setHandwritingBusy(false);
    setHandwritingText(null);
    setHandwritingFound(false);
    setHandwritingError(null);
    handwritingTokenRef.current += 1;
    setAiOpen(false);
    setAiMessages([]);
    setAiQuestion('');
    setAiBusy(false);
    setAiError(null);
    textCacheRef.current.clear();
    if (!fileId || !url) return;

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
  }, [file, fileId, url]);

  useEffect(() => {
    return () => {
      void doc?.destroy();
    };
  }, [doc]);

  // Load the ink layer beside the PDF. Drawing stays paused if it cannot load,
  // so a save can never overwrite notes the viewer has not seen.
  useEffect(() => {
    if (!fileId) {
      setInk(emptyInk());
      setInkReady(false);
      setInkLoading(false);
      setInkError(null);
      return;
    }
    let alive = true;
    const loadId = inkLoadRef.current + 1;
    inkLoadRef.current = loadId;
    setInk(emptyInk());
    latestStrokesRef.current = [];
    setInkReady(false);
    setInkLoading(true);
    setInkError(null);
    setDirty(false);
    dirtyRef.current = false;
    revisionRef.current = 0;
    setSaveState('idle');
    setSaveError(null);

    void (async () => {
      try {
        const annotations = await fetchPdfInk(fileId);
        if (!alive || inkLoadRef.current !== loadId) return;
        latestStrokesRef.current = annotations.strokes;
        setInk({ strokes: annotations.strokes, undo: [], redo: [] });
        setInkReady(true);
        setInkLoading(false);
      } catch (err) {
        if (!alive || inkLoadRef.current !== loadId) return;
        setInkLoading(false);
        setInkError(err instanceof Error ? err.message : 'Could not load your notes for this PDF.');
      }
    })();

    return () => {
      alive = false;
    };
  }, [fileId, inkReload]);

  useEffect(() => {
    latestStrokesRef.current = ink.strokes;
  }, [ink.strokes]);

  useEffect(() => {
    setAiStatus(ai);
  }, [ai]);

  // Recognised text from earlier sessions joins the search cache right away.
  useEffect(() => {
    if (!fileId) return;
    let alive = true;
    const loadId = ocrLoadRef.current + 1;
    ocrLoadRef.current = loadId;
    void fetchPdfOcr(fileId)
      .then((payload) => {
        if (!alive || ocrLoadRef.current !== loadId) return;
        const numbers: number[] = [];
        for (const [key, value] of Object.entries(payload.pages ?? {})) {
          const number = Number(key);
          if (!Number.isInteger(number) || number < 1 || !value) continue;
          textCacheRef.current.set(number, value.toLowerCase());
          numbers.push(number);
        }
        numbers.sort((a, b) => a - b);
        setOcrPages(numbers);
        if (numbers.length) setOcrRevision((current) => current + 1);
      })
      .catch(() => {
        /* OCR is optional; the PDF still opens without it */
      });
    return () => {
      alive = false;
    };
  }, [fileId]);

  // Writes stay in order: an older autosave must never land after a newer one.
  const queueSave = useCallback((id: string, strokes: PdfInkStroke[]) => {
    const job = saveChainRef.current.then(() => savePdfInk(id, { version: 1, strokes }));
    saveChainRef.current = job.catch(() => undefined);
    return job;
  }, []);

  // Save the latest layer when the viewer closes, even if the debounce has not fired.
  useEffect(() => {
    const id = fileId;
    return () => {
      if (id && dirtyRef.current) {
        void queueSave(id, latestStrokesRef.current);
      }
    };
  }, [fileId, queueSave]);

  const persist = useCallback(
    async (strokes: PdfInkStroke[]) => {
      if (!fileId) return;
      const revision = revisionRef.current;
      setSaveState('saving');
      setSaveError(null);
      try {
        await queueSave(fileId, strokes);
        if (revisionRef.current === revision) {
          dirtyRef.current = false;
          setDirty(false);
          setSaveState('saved');
        }
      } catch (err) {
        setSaveState('error');
        setSaveError(err instanceof Error ? err.message : 'Could not save your notes.');
      }
    },
    [fileId, queueSave],
  );

  useEffect(() => {
    if (!inkReady || !dirty || !fileId) return;
    const strokes = ink.strokes;
    const timer = window.setTimeout(() => void persist(strokes), 700);
    return () => window.clearTimeout(timer);
  }, [dirty, fileId, ink.strokes, inkReady, persist]);

  const markDirty = useCallback(() => {
    revisionRef.current += 1;
    dirtyRef.current = true;
    setDirty(true);
    setSaveState('idle');
    setSaveError(null);
  }, []);

  const commit = useCallback(
    (update: (current: PdfInkStroke[]) => PdfInkStroke[]) => {
      setInk((current) => {
        const next = update(current.strokes);
        if (next === current.strokes) return current;
        return {
          strokes: next,
          undo: [...current.undo.slice(-(MAX_UNDO - 1)), current.strokes],
          redo: [],
        };
      });
      markDirty();
    },
    [markDirty],
  );

  const addStroke = useCallback(
    (stroke: PdfInkStroke) => {
      commit((current) => [...current, stroke]);
    },
    [commit],
  );

  const eraseStrokes = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const remove = new Set(ids);
      commit((current) => {
        const next = current.filter((stroke) => !remove.has(stroke.id));
        return next.length === current.length ? current : next;
      });
    },
    [commit],
  );

  const undo = useCallback(() => {
    setInk((current) => {
      if (!current.undo.length) return current;
      const previous = current.undo[current.undo.length - 1];
      return {
        strokes: previous,
        undo: current.undo.slice(0, -1),
        redo: [current.strokes, ...current.redo].slice(0, MAX_UNDO),
      };
    });
    markDirty();
  }, [markDirty]);

  const redo = useCallback(() => {
    setInk((current) => {
      if (!current.redo.length) return current;
      const [next, ...rest] = current.redo;
      return {
        strokes: next,
        undo: [...current.undo.slice(-(MAX_UNDO - 1)), current.strokes],
        redo: rest,
      };
    });
    markDirty();
  }, [markDirty]);

  const clearPage = useCallback(() => {
    commit((current) => {
      const next = current.filter((stroke) => stroke.page !== page);
      return next.length === current.length ? current : next;
    });
  }, [commit, page]);

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

  const closeOcr = useCallback(() => {
    ocrTokenRef.current += 1;
    handwritingTokenRef.current += 1;
    setOcrOpen(false);
    setOcrLoading(false);
    setHandwritingBusy(false);
    setHandwritingText(null);
    setHandwritingFound(false);
    setHandwritingError(null);
  }, []);

  const runOcr = useCallback(
    async (target: number) => {
      if (!fileId || ocrLoading) return;
      const token = ocrTokenRef.current + 1;
      ocrTokenRef.current = token;
      setOcrOpen(true);
      setOcrLoading(true);
      setOcrResult(null);
      setOcrError(null);
      setCopied(false);
      handwritingTokenRef.current += 1;
      setHandwritingBusy(false);
      setHandwritingText(null);
      setHandwritingFound(false);
      setHandwritingError(null);
      try {
        const result = await recognizePdfPage(fileId, target);
        if (ocrTokenRef.current !== token) return;
        setOcrResult(result);
        if (result.text) {
          textCacheRef.current.set(target, result.text.toLowerCase());
          setOcrPages((current) =>
            current.includes(target) ? current : [...current, target].sort((a, b) => a - b),
          );
          setOcrRevision((current) => current + 1);
        }
      } catch (err) {
        if (ocrTokenRef.current === token) {
          setOcrError(err instanceof Error ? err.message : 'Could not read this page.');
        }
      } finally {
        if (ocrTokenRef.current === token) setOcrLoading(false);
      }
    },
    [fileId, ocrLoading],
  );

  const copyOcrText = useCallback(async () => {
    const text = ocrResult?.text;
    if (!text) return;
    // clipboard.writeText can wait on a permission prompt; do not leave the
    // button stuck while it does.
    let apiCopy: Promise<void> | null = null;
    try {
      apiCopy = navigator.clipboard?.writeText?.(text) ?? null;
    } catch {
      apiCopy = null;
    }
    const copiedWithApi = apiCopy
      ? await Promise.race([
          apiCopy.then(() => true).catch(() => false),
          new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 500)),
        ])
      : false;
    if (!copiedWithApi) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
      } catch {
        /* the text stays selectable in the panel */
      }
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [ocrResult]);

  /** A JPEG of the page plus any ink, at a size vision models can read. */
  const capturePageImage = useCallback((): string | null => {
    // Every page keeps its own canvas now, so ask for the one being read.
    const holder = shellRef.current?.querySelector<HTMLElement>(`[data-pdf-page="${page}"]`);
    const base = holder?.querySelector<HTMLCanvasElement>('canvas[data-pdf-canvas]');
    if (!base || base.width < 2 || base.height < 2) return null;
    const maxWidth = 1_400;
    const scale = Math.min(1, maxWidth / base.width);
    const width = Math.max(1, Math.round(base.width * scale));
    const height = Math.max(1, Math.round(base.height * scale));
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const context = offscreen.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(base, 0, 0, width, height);

    // The ink layer is a separate canvas; draw it over the page so the model
    // can read handwritten notes and annotations too.
    const inkCanvas = holder?.querySelector<HTMLCanvasElement>('canvas[data-pdf-ink]');
    if (inkCanvas && inkCanvas.width > 0 && inkCanvas.height > 0) {
      context.drawImage(inkCanvas, 0, 0, width, height);
    }
    try {
      return offscreen.toDataURL('image/jpeg', 0.86);
    } catch {
      return null;
    }
  }, [page]);

  /** Selectable text for this page, with the OCR sidecar as a fallback. */
  const pageTextForAi = useCallback(async (): Promise<string> => {
    let text = '';
    if (doc) {
      try {
        const target = await doc.getPage(page);
        const content = await target.getTextContent();
        text = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      } catch {
        /* fall back to OCR text */
      }
    }
    if (!text) text = textCacheRef.current.get(page) ?? '';
    return text.slice(0, 24_000);
  }, [doc, page]);

  const toggleAi = useCallback(() => {
    const next = !aiOpen;
    setAiOpen(next);
    if (next) {
      setAiError(null);
      void fetchAiStatus().then(setAiStatus).catch(() => undefined);
    }
  }, [aiOpen]);

  const sendAiQuestion = useCallback(
    async (prompt?: string) => {
      const question = (prompt ?? aiQuestion).trim();
      if (!question || aiBusy) return;
      if (!aiStatus?.configured) {
        setAiError('Add your own AI API key in Settings → AI first.');
        return;
      }
      const image = capturePageImage();
      const history = aiMessages.slice(-8).map((message) => ({
        role: message.role,
        text: message.text,
      }));
      setAiMessages((current) => [...current, { role: 'user', text: question }]);
      setAiQuestion('');
      setAiError(null);
      setAiBusy(true);
      try {
        const pageText = await pageTextForAi();
        if (!image && !pageText) {
          throw new Error('This page is still rendering. Give it a second and try again.');
        }
        const result = await askAiAboutPage({
          question,
          page,
          pageCount: doc?.numPages ?? null,
          fileName: file?.fileName ?? 'this document',
          pageText,
          image,
          history,
        });
        setAiMessages((current) => [...current, { role: 'assistant', text: result.reply }]);
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'The AI could not answer that question.');
      } finally {
        setAiBusy(false);
      }
    },
    [aiBusy, aiMessages, aiQuestion, aiStatus?.configured, capturePageImage, doc, file, page, pageTextForAi],
  );

  const readHandwriting = useCallback(async () => {
    if (!fileId || handwritingBusy) return;
    const image = capturePageImage();
    if (!image) {
      setHandwritingError('The page is still rendering. Try again in a moment.');
      return;
    }
    const token = handwritingTokenRef.current + 1;
    handwritingTokenRef.current = token;
    setHandwritingBusy(true);
    setHandwritingError(null);
    setHandwritingText(null);
    setHandwritingFound(false);
    try {
      const pageText = await pageTextForAi();
      const result = await transcribePdfHandwriting(fileId, { page, image, pageText });
      if (handwritingTokenRef.current !== token) return;
      setHandwritingText(result.text);
      setHandwritingFound(result.found);
      if (result.found) {
        textCacheRef.current.set(page, result.savedText.toLowerCase());
        setOcrPages((current) =>
          current.includes(page) ? current : [...current, page].sort((a, b) => a - b),
        );
        setOcrRevision((current) => current + 1);
      }
    } catch (err) {
      if (handwritingTokenRef.current === token) {
        setHandwritingError(
          err instanceof Error ? err.message : 'Could not read the handwriting on this page.',
        );
      }
    } finally {
      if (handwritingTokenRef.current === token) setHandwritingBusy(false);
    }
  }, [capturePageImage, fileId, handwritingBusy, page, pageTextForAi]);

  // Width of the reading column drives fit-width on every page at once.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => setContainerWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleViewport = useCallback((number: number, next: PageViewport) => {
    viewportsRef.current.set(number, next);
    if (number === currentPageRef.current) setViewScale(next.scale);
  }, []);

  /** Stable ref callback: page wrappers register once, in reading order. */
  const registerPageNode = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const number = Number(node.dataset.pdfSlot);
    if (Number.isFinite(number)) pageNodesRef.current.set(number, node);
  }, []);

  /**
   * Continuous scrolling: the page crossing the reading line is the current
   * one, so the toolbar, thumbnails, ink tools, OCR and AI follow the reader
   * instead of waiting for a button.
   */
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !doc) return;
    let frame = 0;
    const pick = () => {
      frame = 0;
      const line = element.scrollTop + readingLine(element);
      // Pages are in reading order, so walk down to the one the line is on and
      // stop: no need to measure the other two hundred.
      let best = currentPageRef.current;
      for (const [number, node] of pageNodesRef.current) {
        const top = node.offsetTop;
        const bottom = top + node.offsetHeight;
        if (bottom < line) {
          best = number;
          continue;
        }
        if (top <= line) best = number;
        break;
      }
      currentPageRef.current = best;
      setPage((current) => (current === best ? current : best));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(pick);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    pick();
    return () => {
      element.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [doc]);

  /** Called *before* the pages are re-laid out, while the old geometry is live. */
  const rememberPlace = useCallback(() => {
    const element = scrollRef.current;
    const node = pageNodesRef.current.get(currentPageRef.current);
    window.clearTimeout(anchorTimerRef.current);
    if (!element || !node) {
      anchorRef.current = null;
      return;
    }
    const height = Math.max(1, node.offsetHeight);
    anchorRef.current = {
      page: currentPageRef.current,
      fraction: Math.min(1, Math.max(0, (element.scrollTop + readingLine(element) - node.offsetTop) / height)),
    };
    // A zoom is a moment, not a mode: stop holding the anchor soon after.
    anchorTimerRef.current = window.setTimeout(() => {
      anchorRef.current = null;
    }, 1_600);
  }, []);

  // Every page resizes at its own pace, so the anchor is re-applied on each
  // layout change until the reader scrolls again.
  useEffect(() => {
    const container = pagesRef.current;
    const element = scrollRef.current;
    if (!container || !element) return;
    const observer = new ResizeObserver(() => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const node = pageNodesRef.current.get(anchor.page);
      if (!node) return;
      const target = node.offsetTop + anchor.fraction * node.offsetHeight - readingLine(element);
      const next = Math.max(0, target);
      if (Math.abs(element.scrollTop - next) > 1) element.scrollTop = next;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Taking over with the wheel or a finger cancels any pending re-anchor.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const release = () => {
      anchorRef.current = null;
      window.clearTimeout(anchorTimerRef.current);
    };
    element.addEventListener('wheel', release, { passive: true });
    element.addEventListener('pointerdown', release);
    element.addEventListener('touchstart', release, { passive: true });
    return () => {
      element.removeEventListener('wheel', release);
      element.removeEventListener('pointerdown', release);
      element.removeEventListener('touchstart', release);
      window.clearTimeout(anchorTimerRef.current);
    };
  }, []);

  useEffect(() => {
    ocrTokenRef.current += 1;
    handwritingTokenRef.current += 1;
    setOcrOpen(false);
    setOcrLoading(false);
    setOcrResult(null);
    setOcrError(null);
    setCopied(false);
    setHandwritingBusy(false);
    setHandwritingText(null);
    setHandwritingFound(false);
    setHandwritingError(null);
  }, [page, fileId]);

  useEffect(() => {
    setPage((current) => (doc ? Math.min(current, doc.numPages) : current));
  }, [doc]);

  // A continuous view needs every page's size up front, otherwise the
  // scrollbar grows while you read and the page you were on drifts away.
  useEffect(() => {
    if (!doc) {
      // The page wrappers are gone with the document, so are their entries.
      pageNodesRef.current.clear();
      viewportsRef.current.clear();
      setPageSizes(new Map());
      return;
    }
    let alive = true;
    void (async () => {
      const sizes = new Map<number, { width: number; height: number }>();
      for (let number = 1; number <= doc.numPages; number += 1) {
        if (!alive) return;
        try {
          const page = await doc.getPage(number);
          const view = page.getViewport({ scale: 1 });
          sizes.set(number, { width: view.width, height: view.height });
        } catch {
          /* a page that will not parse keeps the fallback size */
        }
        // Yield every so often so a long document still paints immediately.
        if (number % 25 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
      if (alive) setPageSizes(sizes);
    })();
    return () => {
      alive = false;
    };
  }, [doc]);

  useEffect(() => {
    currentPageRef.current = page;
    setPageInput(String(page));
    const known = viewportsRef.current.get(page);
    if (known) setViewScale(known.scale);
  }, [page]);

  useEffect(() => {
    const handler = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const changeZoom = (direction: 1 | -1) => {
    rememberPlace();
    setFitWidth(false);
    setZoom((current) => {
      const index = ZOOM_STEPS.findIndex((step) => step >= current - 0.001);
      const next =
        direction === 1 ? Math.min(index + 1, ZOOM_STEPS.length - 1) : Math.max(index - 1, 0);
      return ZOOM_STEPS[Math.max(0, next)];
    });
  };

  const goToPage = useCallback(
    (value: number) => {
      if (!doc) return;
      const target = Math.min(Math.max(Math.round(value), 1), doc.numPages);
      setPage(target);
      currentPageRef.current = target;
      // Jumping (page box, thumbnails, search, a link) scrolls that page into
      // place; ordinary reading just moves the scrollbar.
      const element = scrollRef.current;
      const node = pageNodesRef.current.get(target);
      if (element && node) element.scrollTop = Math.max(0, node.offsetTop - 12);
    },
    [doc],
  );

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch {
      /* fullscreen is a nicety, not a requirement */
    }
  };

  const flushAndClose = useCallback(() => {
    if (fileId && dirtyRef.current) void persist(latestStrokesRef.current);
    onClose();
  }, [fileId, onClose, persist]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!file) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (typing) {
        if (event.key === 'Escape') {
          setSearchOpen(false);
          if (target) target.blur();
        }
        return;
      }
      if (event.key === 'Escape') {
        if (ocrOpen) closeOcr();
        else if (searchOpen) setSearchOpen(false);
        else if (tool !== 'read') setTool('read');
        else if (document.fullscreenElement) void document.exitFullscreen();
        else flushAndClose();
      } else if (event.key === 'ArrowRight') {
        goToPage(page + 1);
      } else if (event.key === 'ArrowLeft') {
        goToPage(page - 1);
      } else if (event.key === 'PageDown' || event.key === 'ArrowDown') {
        // The document scrolls now, so the scrolling keys move the document.
        event.preventDefault();
        const element = scrollRef.current;
        if (element) {
          element.scrollTop += element.clientHeight * (event.key === 'PageDown' ? 0.9 : 0.14);
        }
      } else if (event.key === 'PageUp' || event.key === 'ArrowUp') {
        event.preventDefault();
        const element = scrollRef.current;
        if (element) {
          element.scrollTop -= element.clientHeight * (event.key === 'PageUp' ? 0.9 : 0.14);
        }
      } else if (event.key === '+' || event.key === '=') {
        rememberPlace();
        setZoom((current) => Math.min(3, +(current + 0.15).toFixed(2)));
        setFitWidth(false);
      } else if (event.key === '-') {
        rememberPlace();
        setZoom((current) => Math.max(0.5, +(current - 0.15).toFixed(2)));
        setFitWidth(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeOcr, doc, file, flushAndClose, goToPage, ocrOpen, page, rememberPlace, searchOpen, tool]);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }, [searchOpen]);

  // Text search runs page by page; hits are cached so repeated searches are quick.
  useEffect(() => {
    const needle = query.trim().toLowerCase();
    if (!searchOpen || !doc || needle.length < 2) {
      setSearchHits([]);
      setSearching(false);
      setSearchNote(null);
      setSearchIndex(0);
      return;
    }
    const token = searchTokenRef.current + 1;
    searchTokenRef.current = token;
    setSearching(true);
    setSearchNote(null);

    const timer = window.setTimeout(() => {
      void (async () => {
        const hits: SearchHit[] = [];
        let sawText = false;
        for (let number = 1; number <= doc.numPages; number += 1) {
          if (searchTokenRef.current !== token) return;
          let text = textCacheRef.current.get(number);
          if (text === undefined) {
            try {
              const found = await doc.getPage(number);
              const content = await found.getTextContent();
              text = content.items
                .map((item) => ('str' in item ? item.str : ''))
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
              textCacheRef.current.set(number, text);
            } catch {
              text = '';
            }
          }
          if (text) sawText = true;
          const count = countMatches(text, needle);
          if (count) hits.push({ page: number, count });
        }
        if (searchTokenRef.current !== token) return;
        setSearching(false);
        setSearchHits(hits);
        setSearchIndex(0);
        if (!hits.length) {
          setSearchNote(
            sawText
              ? 'No matches in this PDF.'
              : 'No text layer found. Use the OCR button to read this page.',
          );
        } else {
          currentPageRef.current = hits[0].page;
          setPage(hits[0].page);
          const element = scrollRef.current;
          const node = pageNodesRef.current.get(hits[0].page);
          if (element && node) element.scrollTop = Math.max(0, node.offsetTop - 12);
        }
      })();
    }, 320);

    return () => {
      window.clearTimeout(timer);
      if (searchTokenRef.current === token) searchTokenRef.current += 1;
    };
  }, [doc, ocrRevision, query, searchOpen]);

  const stepSearch = useCallback(
    (direction: 1 | -1) => {
      if (!searchHits.length) return;
      setSearchIndex((current) => {
        const next = (current + direction + searchHits.length) % searchHits.length;
        goToPage(searchHits[next].page);
        return next;
      });
    },
    [goToPage, searchHits],
  );

  const pages = doc?.numPages ?? 0;
  const percent = useMemo(
    () => `${Math.round((viewScale ?? zoom) * 100)}%`,
    [viewScale, zoom],
  );
  const pageStrokeCount = ink.strokes.filter((stroke) => stroke.page === page).length;
  const canDraw = inkReady && !inkError && !inkLoading;
  const totalMatches = searchHits.reduce((sum, hit) => sum + hit.count, 0);
  const toolWidth =
    tool === 'eraser' ? 18 : tool === 'highlighter' ? Math.max(12, brushSize * 4) : brushSize;

  if (!file) return null;

  return (
    <div
      ref={shellRef}
      className="fixed inset-0 z-[80] flex flex-col bg-[#0a0c12]"
      role="dialog"
      aria-modal="true"
      aria-label={`${file.title} PDF`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-[var(--chrome-solid)] px-3 py-2">
        <button
          type="button"
          onClick={flushAndClose}
          aria-label="Close PDF"
          className="focus-ring grid h-8 w-8 place-items-center rounded-lg text-ink-2 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-ink-1">{file.title}</p>
          <p className="truncate text-[10.5px] text-ink-3">
            {file.courseName} · {file.fileName}
          </p>
        </div>

        <div className="flex items-center rounded-lg border border-line bg-surface-1">
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="focus-ring grid h-8 w-8 place-items-center rounded-l-lg text-ink-2 transition hover:bg-surface-2 hover:text-white disabled:opacity-30"
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
              className="h-6 w-8 rounded border border-line bg-surface-1 text-center text-[11px] text-ink-1 outline-none focus:border-violet-400/40"
            />
            <span className="text-[10.5px] text-ink-3">/ {pages || '—'}</span>
          </form>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={!pages || page >= pages}
            aria-label="Next page"
            className="focus-ring grid h-8 w-8 place-items-center rounded-r-lg text-ink-2 transition hover:bg-surface-2 hover:text-white disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center rounded-lg border border-line bg-surface-1">
          <button
            type="button"
            onClick={() => changeZoom(-1)}
            aria-label="Zoom out"
            className="focus-ring grid h-8 w-8 place-items-center rounded-l-lg text-ink-2 transition hover:bg-surface-2 hover:text-white"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-11 text-center text-[10.5px] tabular-nums text-ink-2">
            {percent}
          </span>
          <button
            type="button"
            onClick={() => changeZoom(1)}
            aria-label="Zoom in"
            className="focus-ring grid h-8 w-8 place-items-center rounded-r-lg text-ink-2 transition hover:bg-surface-2 hover:text-white"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            rememberPlace();
            setFitWidth(true);
            setZoom(1);
          }}
          title="Fit width"
          aria-pressed={fitWidth}
          className={`focus-ring hidden h-8 rounded-lg border px-2.5 text-[10.5px] font-medium transition sm:block ${
            fitWidth
              ? 'border-violet-400/30 bg-violet-500/[0.14] text-violet-200'
              : 'border-line bg-surface-1 text-ink-2 hover:text-white'
          }`}
        >
          Fit width
        </button>

        <button
          type="button"
          onClick={() => {
            rememberPlace();
            setRotation((current) => (current + 90) % 360);
          }}
          title="Rotate"
          className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-1 text-ink-2 transition hover:bg-surface-2 hover:text-white"
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
              : 'border-line bg-surface-1 text-ink-2 hover:bg-surface-2 hover:text-white'
          }`}
        >
          <Contrast className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setSearchOpen((current) => !current)}
          title="Search this PDF (Ctrl+F)"
          aria-pressed={searchOpen}
          className={`focus-ring grid h-8 w-8 place-items-center rounded-lg border transition ${
            searchOpen
              ? 'border-violet-400/30 bg-violet-500/[0.14] text-violet-200'
              : 'border-line bg-surface-1 text-ink-2 hover:bg-surface-2 hover:text-white'
          }`}
        >
          <Search className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={toggleAi}
          title="Ask AI about this page"
          aria-pressed={aiOpen}
          aria-label="Ask AI about this page"
          className={`focus-ring flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10.5px] font-semibold transition ${
            aiOpen
              ? 'border-violet-400/40 bg-violet-500/[0.18] text-violet-100'
              : 'border-line bg-surface-1 text-ink-2 hover:bg-surface-2 hover:text-white'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Ask AI</span>
        </button>

        <button
          type="button"
          onClick={() => void runOcr(page)}
          disabled={!doc || ocrLoading}
          title={
            ocrPages.length
              ? `Read this page with OCR (${ocrPages.length} page${ocrPages.length === 1 ? '' : 's'} saved)`
              : 'Read this page with OCR'
          }
          aria-label="OCR this page"
          className="focus-ring relative grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-1 text-ink-2 transition hover:bg-surface-2 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ocrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
          {ocrPages.length > 0 && (
            <span className="absolute right-1.5 top-1.5 h-1 w-1 rounded-full bg-emerald-400" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            if (!canDraw) return;
            setTool((current) => (current === 'read' ? 'pen' : 'read'));
          }}
          disabled={!canDraw}
          title={inkError ?? 'Draw on this PDF'}
          aria-label={tool === 'read' ? 'Draw on this PDF' : 'Stop drawing'}
          aria-pressed={tool !== 'read'}
          className={`focus-ring relative flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            tool !== 'read'
              ? 'border-violet-400/40 bg-violet-500/[0.18] text-violet-100'
              : 'border-line bg-surface-1 text-ink-2 hover:bg-surface-2 hover:text-white'
          }`}
        >
          {inkLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">Draw</span>
          {ink.strokes.length > 0 && (
            <span className="rounded-full bg-violet-500/30 px-1.5 text-[9px] leading-4 text-violet-100">
              {ink.strokes.length > 99 ? '99+' : ink.strokes.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSidebarOpen((current) => !current)}
          title={sidebarOpen ? 'Hide page thumbnails' : 'Show page thumbnails'}
          aria-pressed={sidebarOpen}
          className="focus-ring hidden h-8 w-8 place-items-center rounded-lg border border-line bg-surface-1 text-ink-2 transition hover:bg-surface-2 hover:text-white md:grid"
        >
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>

        <a
          href={url ?? undefined}
          download={file.fileName}
          title="Save a copy"
          className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-1 text-ink-2 transition hover:bg-surface-2 hover:text-white"
        >
          <Download className="h-4 w-4" />
        </a>

        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          title="Fullscreen"
          className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface-1 text-ink-2 transition hover:bg-surface-2 hover:text-white"
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {tool !== 'read' && (
        <div className="flex flex-wrap items-center gap-2 border-b border-violet-400/15 bg-[#12101c] px-3 py-1.5">
          <div className="flex items-center rounded-lg border border-line bg-surface-1 p-0.5">
            {(
              [
                { id: 'pen', label: 'Pen', icon: PenLine },
                { id: 'highlighter', label: 'Highlighter', icon: Highlighter },
                { id: 'eraser', label: 'Eraser', icon: Eraser },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTool(item.id)}
                  title={item.label}
                  aria-pressed={tool === item.id}
                  className={`focus-ring flex h-7 items-center gap-1 rounded-md px-2 text-[10.5px] font-medium transition ${
                    tool === item.id
                      ? 'bg-violet-500/25 text-violet-100'
                      : 'text-ink-2 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{item.label}</span>
                </button>
              );
            })}
          </div>

          {tool !== 'eraser' && (
            <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-1 px-1.5 py-1">
              {INK_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setBrushColor(color)}
                  title={`Colour ${color}`}
                  aria-label={`Ink colour ${color}`}
                  aria-pressed={brushColor === color}
                  className={`h-4 w-4 rounded-full border transition ${
                    brushColor === color
                      ? 'scale-110 border-white/80 shadow-[0_0_0_2px_rgba(255,255,255,0.16)]'
                      : 'border-white/20 hover:scale-110'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          )}

          <label className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 px-2 py-1 text-[10px] text-ink-2">
            <span className="hidden sm:inline">Size</span>
            <input
              type="range"
              min={1}
              max={8}
              step={1}
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
              className="h-1 w-16 accent-violet-400"
              aria-label="Brush size"
            />
            <span className="w-3 text-center tabular-nums text-ink-2">{brushSize}</span>
          </label>

          <div className="flex items-center rounded-lg border border-line bg-surface-1 p-0.5">
            <button
              type="button"
              onClick={undo}
              disabled={!ink.undo.length}
              title="Undo"
              className="focus-ring grid h-7 w-7 place-items-center rounded-md text-ink-2 transition hover:bg-surface-2 hover:text-white disabled:opacity-30"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!ink.redo.length}
              title="Redo"
              className="focus-ring grid h-7 w-7 place-items-center rounded-md text-ink-2 transition hover:bg-surface-2 hover:text-white disabled:opacity-30"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={clearPage}
              disabled={!pageStrokeCount}
              title="Clear ink on this page"
              className="focus-ring grid h-7 w-7 place-items-center rounded-md text-ink-2 transition hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <span className="text-[10px] text-ink-3">
            {pageStrokeCount ? `${pageStrokeCount} stroke${pageStrokeCount === 1 ? '' : 's'} on page` : 'Draw with a pen, stylus or finger'}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <span aria-live="polite" className="text-[10px] text-ink-3">
              {saveState === 'saving' ? (
                <span className="flex items-center gap-1 text-ink-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </span>
              ) : saveState === 'error' ? (
                <button
                  type="button"
                  onClick={() => void persist(ink.strokes)}
                  title={saveError ?? undefined}
                  className="flex items-center gap-1 text-rose-300 hover:text-rose-200"
                >
                  <AlertCircle className="h-3 w-3" /> Save failed — retry
                </button>
              ) : dirty ? (
                'Unsaved changes'
              ) : saveState === 'saved' ? (
                <span className="flex items-center gap-1 text-emerald-300/80">
                  <Check className="h-3 w-3" /> Saved
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => setTool('read')}
              className="focus-ring flex h-7 items-center gap-1 rounded-lg border border-line-strong bg-surface-2 px-2 text-[10.5px] font-medium text-ink-1 transition hover:bg-surface-3"
            >
              <Check className="h-3.5 w-3.5" /> Done
            </button>
          </div>
        </div>
      )}

      {searchOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-[#10131a] px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-ink-3" />
          <form
            className="flex min-w-[180px] flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              stepSearch(1);
            }}
          >
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this PDF…"
              aria-label="Search this PDF"
              className="h-7 w-full max-w-sm rounded-md border border-line-strong bg-surface-1 px-2 text-[11.5px] text-ink-1 outline-none placeholder:text-ink-4 focus:border-violet-400/40"
            />
          </form>
          <span className="text-[10.5px] text-ink-3">
            {searching
              ? 'Searching…'
              : searchHits.length
                ? `${totalMatches} match${totalMatches === 1 ? '' : 'es'} · ${searchHits.length} page${
                    searchHits.length === 1 ? '' : 's'
                  }`
                : searchNote ?? (query.trim().length > 0 && query.trim().length < 2 ? 'Type at least 2 letters' : '')}
          </span>
          <div className="flex items-center rounded-lg border border-line bg-surface-1">
            <button
              type="button"
              onClick={() => stepSearch(-1)}
              disabled={!searchHits.length}
              title="Previous match"
              className="focus-ring grid h-7 w-7 place-items-center rounded-l-md text-ink-2 transition hover:bg-surface-2 hover:text-white disabled:opacity-30"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => stepSearch(1)}
              disabled={!searchHits.length}
              title="Next match"
              className="focus-ring grid h-7 w-7 place-items-center rounded-r-md text-ink-2 transition hover:bg-surface-2 hover:text-white disabled:opacity-30"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          {searchHits.length > 0 && (
            <span className="text-[10px] tabular-nums text-ink-3">
              {searchIndex + 1}/{searchHits.length}
            </span>
          )}
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            aria-label="Close search"
            className="focus-ring grid h-7 w-7 place-items-center rounded-md text-ink-3 transition hover:bg-surface-2 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {inkError && (
        <div className="flex items-center gap-2 border-b border-amber-400/20 bg-amber-500/[0.08] px-3 py-1.5 text-[10.5px] text-amber-100">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{inkError} Drawing is paused so notes cannot be overwritten.</span>
          <button
            type="button"
            onClick={() => setInkReload((current) => current + 1)}
            className="rounded border border-amber-300/30 px-2 py-0.5 font-medium transition hover:bg-amber-400/10"
          >
            Retry
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && doc && (
          <aside
            aria-label="Page thumbnails"
            className="hidden w-[132px] shrink-0 overflow-y-auto border-r border-line bg-[#0d0f15] p-2 md:block"
          >
            <div className="flex flex-col gap-1.5">
              {Array.from({ length: pages }, (_, index) => (
                <PdfThumbnail
                  key={index + 1}
                  doc={doc}
                  pageNumber={index + 1}
                  active={page === index + 1}
                  onSelect={goToPage}
                />
              ))}
            </div>
          </aside>
        )}

        <div
          ref={scrollRef}
          className="relative flex-1 overflow-auto bg-[#14161d] px-4 py-5"
          onDoubleClick={(event) => {
            if ((event.target as HTMLElement).closest('[data-pdf-ink]')) return;
            void toggleFullscreen();
          }}
        >
          {loading && (
            <div className="flex h-full items-center justify-center gap-2 text-[12px] text-ink-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Opening PDF…
            </div>
          )}

          {error && !loading && (
            <div className="mx-auto mt-16 max-w-sm rounded-xl border border-rose-400/20 bg-rose-500/[0.08] px-4 py-5 text-center">
              <p className="text-[12.5px] text-rose-200">{error}</p>
            </div>
          )}

          {/* Every page in one column: read straight down instead of paging. */}
          <div
            ref={pagesRef}
            className={`flex flex-col items-center gap-4 ${loading || error ? 'hidden' : ''}`}
            data-pdf-pages
          >
            {doc &&
              Array.from({ length: pages }, (_, index) => {
                const number = index + 1;
                return (
                  <div
                    key={number}
                    ref={registerPageNode}
                    data-pdf-slot={number}
                    className="flex w-full shrink-0 justify-center"
                  >
                    <PdfPage
                      doc={doc}
                      pageNumber={number}
                      size={pageSizes.get(number) ?? null}
                      width={containerWidth}
                      zoom={zoom}
                      fitWidth={fitWidth}
                      rotation={rotation}
                      invert={invert}
                      scrollRoot={scrollRef}
                      tool={canDraw ? tool : 'read'}
                      color={brushColor}
                      brushSize={toolWidth}
                      strokes={ink.strokes}
                      onAddStroke={addStroke}
                      onErase={eraseStrokes}
                      onViewport={handleViewport}
                    />
                  </div>
                );
              })}
          </div>
        </div>

        {aiOpen && (
          <PdfAiPanel
            page={page}
            pageCount={pages}
            ai={aiStatus}
            messages={aiMessages}
            question={aiQuestion}
            busy={aiBusy}
            error={aiError}
            onQuestion={setAiQuestion}
            onSend={(prompt) => void sendAiQuestion(prompt)}
            onClose={() => setAiOpen(false)}
            onOpenSettings={onOpenSettings}
          />
        )}
      </div>

      {ocrOpen && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeOcr();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Recognized text for page ${ocrResult?.page ?? page}`}
            className="pane-float animate-pop flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden"
          >
            <div className="flex items-start gap-3 border-b border-line px-5 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-200">
                <ScanText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink-1">Recognized text</p>
                <p className="truncate text-[10.5px] text-ink-3">
                  Page {ocrResult?.page ?? page}
                  {ocrResult && !ocrResult.skipped
                    ? ` · ${ocrResult.words} word${ocrResult.words === 1 ? '' : 's'}`
                    : ''}{' '}
                  · the PDF is not changed
                </p>
              </div>
              <button
                type="button"
                onClick={closeOcr}
                aria-label="Close recognized text"
                className="focus-ring grid h-7 w-7 place-items-center rounded-md text-ink-3 transition hover:bg-surface-2 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-4 rounded-xl border border-violet-400/20 bg-violet-500/[0.06] px-4 py-3.5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-200">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-violet-100">Handwritten notes</p>
                    <p className="mt-1 text-[11px] leading-5 text-ink-2">
                      PdfCraft reads printed text. Ask your AI provider to read the ink you drew on
                      this page too — it is added to search for this PDF.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void readHandwriting()}
                    disabled={handwritingBusy || ocrLoading || !aiStatus?.configured}
                    className="focus-ring flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-violet-300/30 bg-violet-500/[0.14] px-2.5 text-[10.5px] font-semibold text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {handwritingBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {handwritingBusy ? 'Reading…' : 'Read handwriting'}
                  </button>
                </div>

                {!aiStatus?.configured && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[10.5px] text-ink-3">
                    <span>Add your own AI API key to read handwriting.</span>
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="focus-ring rounded-md border border-line-strong px-2 py-0.5 font-medium text-ink-2 transition hover:bg-surface-2 hover:text-white"
                    >
                      Open AI settings
                    </button>
                  </div>
                )}

                {handwritingError && (
                  <div className="mt-2.5 rounded-lg border border-rose-400/20 bg-rose-500/[0.07] px-3 py-2 text-[10.5px] leading-5 text-rose-100">
                    {handwritingError}
                  </div>
                )}

                {handwritingText !== null && (
                  <div className="mt-2.5 rounded-lg border border-line bg-[#0b0d13]/60 px-3 py-2.5">
                    {handwritingFound ? (
                      <>
                        <pre className="select-text whitespace-pre-wrap font-sans text-[12px] leading-6 text-ink-1">
                          {handwritingText}
                        </pre>
                        <p className="mt-2 text-[10px] text-ink-3">
                          Saved on this computer and added to this PDF's search.
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] text-ink-2">
                        No handwriting was found on this page.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {ocrLoading && (
                <div className="flex items-center gap-2 py-6 text-[12px] text-ink-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reading page {page} with PdfCraft OCR…
                </div>
              )}

              {ocrError && !ocrLoading && (
                <div className="rounded-xl border border-rose-400/20 bg-rose-500/[0.07] px-4 py-3.5">
                  <p className="text-[12px] font-medium text-rose-200">OCR could not read this page</p>
                  <p className="mt-1 text-[11.5px] leading-5 text-rose-100/80">{ocrError}</p>
                  <p className="mt-2 text-[10.5px] leading-5 text-ink-3">
                    This uses the PdfCraft engine installed on this computer. Install PdfCraft, or set
                    PDFCRAFT_CLI to its pdfcraft-cli path, then try again.
                  </p>
                  <button
                    type="button"
                    onClick={() => void runOcr(page)}
                    className="focus-ring mt-3 rounded-lg border border-rose-300/25 bg-rose-400/10 px-2.5 py-1 text-[10.5px] font-medium text-rose-100 transition hover:bg-rose-400/20"
                  >
                    Try page {page} again
                  </button>
                </div>
              )}

              {ocrResult && !ocrLoading && !ocrError && ocrResult.skipped && (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] px-4 py-3.5">
                  <p className="text-[12px] font-medium text-emerald-200">This page already has text</p>
                  <p className="mt-1 text-[11.5px] leading-5 text-emerald-100/70">
                    {ocrResult.skipped}. Its words can already be selected and found with search, so
                    no OCR text needed to be added.
                  </p>
                </div>
              )}

              {ocrResult && !ocrLoading && !ocrError && !ocrResult.skipped && ocrResult.text && (
                <pre className="select-text whitespace-pre-wrap font-sans text-[12.5px] leading-6 text-ink-1">
                  {ocrResult.text}
                </pre>
              )}

              {ocrResult &&
                !ocrLoading &&
                !ocrError &&
                !ocrResult.skipped &&
                !ocrResult.text && (
                  <div className="rounded-xl border border-line bg-surface-1 px-4 py-3.5 text-[11.5px] text-ink-2">
                    No words were recognized on this page. The page may be blank, or the scan may be
                    too faint.
                  </div>
                )}
            </div>

            {ocrResult?.text && !ocrError && !ocrLoading && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-2.5">
                <p className="text-[10.5px] text-ink-3">
                  Saved for this PDF, so later searches can find these words.
                </p>
                <button
                  type="button"
                  onClick={() => void copyOcrText()}
                  className="focus-ring flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-[10.5px] font-medium text-ink-1 transition hover:bg-surface-3"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy text'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
