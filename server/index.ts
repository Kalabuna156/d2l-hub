import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { CalendarEvent, Preferences } from '../shared/types';
import { DEMO_MODE, readConfig, updateConfig } from './config';
import { DEMO_BASE_URL, demoDashboard } from './demo';
import {
  cancelConnect,
  disconnect,
  getAppState,
  getConnectStatus,
  getCourseImage,
  loadCourse,
  loadCourseContent,
  loadCourseGrades,
  loadDashboard,
  setBaseUrl,
  startConnect,
} from './d2l';
import {
  clearEventOverride,
  connectGoogleFeed,
  connectNotion,
  createLocalEvent,
  disconnectGoogle,
  disconnectNotion,
  getExternalEvents,
  getIntegrationStatus,
  importFormDeadlines,
  listLocalEvents,
  listNotionDatabases,
  removeLocalEvent,
  setEventOverride,
  updateLocalEvent,
} from './integrations';
import {
  downloadDriveFile,
  downloadTopic,
  libraryFilePath,
  listLibrary,
  removeLibraryFile,
  revealLibraryFile,
  uploadLibraryFile,
} from './library';
import { addExamBankSource, listExamBanks, loadExamBank, removeExamBankSource } from './exambank';
import { readPdfInk, savePdfInk } from './annotations';
import { OcrUnavailableError, readOcrText, recognizePdfPage } from './ocr';
import { askAiAboutPage, transcribeHandwriting } from './page-ai';
import { aiStatus, forgetAiKey, saveAiSettings, testAi } from './ai';
import { readCourseForm } from './course-form';
import { saveOutline, scanCourseOutlines } from './outlines';
import { buildLecturePlan, buildStudyPlan } from './study';
import { recommendStudyVideo } from './study-video';
import { clearNotificationCache, getNotifications, markNotificationsRead } from './notifications';

const app = express();
// Some shells export PORT=0; only honour a usable port number.
const envPort = Number(process.env.PORT);
const PORT = Number.isInteger(envPort) && envPort > 1024 && envPort < 65536 ? envPort : 8787;

// Ink layers and page screenshots travel as one JSON document per request, so
// this is above the usual API payload; every route still validates its input.
app.use(express.json({ limit: '8mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

/** Session state plus the bits other modules own, so the UI loads in one request. */
function appStatePayload() {
  const config = readConfig();
  const state = getAppState();
  return {
    ...state,
    // Preview mode never reads a stored session, even if one is lying around.
    ...(DEMO_MODE
      ? { baseUrl: DEMO_BASE_URL, connected: false, userName: null, savedAt: null }
      : null),
    preferences: config.preferences,
    integrations: getIntegrationStatus(config),
    ai: aiStatus(),
    examBanks: listExamBanks(),
  };
}

/** Everything on screen in preview mode is invented; local events are kept too. */
function demoDashboardPayload() {
  const config = readConfig();
  const data = demoDashboard(
    DEMO_BASE_URL,
    'Preview data — every course, class and event here is sample content.',
  );
  return {
    connected: false,
    data: { ...data, events: [...data.events, ...listLocalEvents()] },
    integrations: getIntegrationStatus(config),
  };
}

/** A connected feed that failed to sync says so in the dashboard banner. */
function integrationNotice(): string | null {
  const status = getIntegrationStatus(readConfig());
  const problems = [status.google, status.notion]
    .filter((connection) => connection.connected && connection.error)
    .map((connection) => `${connection.label ?? 'A synced calendar'}: ${connection.error}`);
  return problems.length > 0 ? problems.join(' ') : null;
}

/** Later events win, but D2L keeps its own ids so a course page still links back. */
function mergeEvents(d2lEvents: CalendarEvent[], synced: CalendarEvent[]): CalendarEvent[] {
  if (synced.length === 0) return d2lEvents;
  const seen = new Set(d2lEvents.map((event) => event.id));
  return [...d2lEvents, ...synced.filter((event) => !seen.has(event.id))];
}

app.get('/api/state', (_req, res) => {
  res.json(appStatePayload());
});

app.post('/api/settings', (req, res) => {
  const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl : '';
  setBaseUrl(baseUrl);
  res.json(appStatePayload());
});

app.post('/api/preferences', (req, res) => {
  const input = req.body?.preferences as Partial<Preferences> | undefined;
  if (!input || typeof input !== 'object') {
    res.status(400).json({ error: 'No preferences were sent.' });
    return;
  }
  updateConfig((config) => ({
    ...config,
    // readConfig normalises whatever lands on disk, so merge then normalise.
    preferences: { ...config.preferences, ...input },
  }));
  res.json(appStatePayload());
});

app.get('/api/integrations', async (_req, res) => {
  try {
    const events = await getExternalEvents();
    res.json({ status: getIntegrationStatus(readConfig()), events });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Could not sync your calendars.' });
  }
});

app.post('/api/integrations/sync', async (_req, res) => {
  try {
    const events = await getExternalEvents(true);
    res.json({ status: getIntegrationStatus(readConfig()), events });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Could not sync your calendars.' });
  }
});

app.post('/api/integrations/google', async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url : '';
  try {
    const events = await connectGoogleFeed(url);
    res.json({ events, status: getIntegrationStatus(readConfig()) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not read that calendar.' });
  }
});

app.post('/api/integrations/google/remove', (_req, res) => {
  disconnectGoogle();
  res.json({ status: getIntegrationStatus(readConfig()) });
});

// Edits stay on this computer; they are layered over the feed on every sync.
app.post('/api/integrations/google/override', (req, res) => {
  try {
    setEventOverride(req.body?.id, req.body?.patch);
    res.json({ status: getIntegrationStatus(readConfig()) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not save that change.' });
  }
});

app.post('/api/integrations/google/override/clear', (req, res) => {
  try {
    clearEventOverride(req.body?.id);
    res.json({ status: getIntegrationStatus(readConfig()) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not reset that class.' });
  }
});

// Events created in the app stay on this computer, in config.json.
app.post('/api/calendar/local', (req, res) => {
  try {
    res.json({ event: createLocalEvent(req.body ?? {}) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not add that event.' });
  }
});

app.post('/api/calendar/local/update', (req, res) => {
  try {
    res.json({ event: updateLocalEvent(req.body?.id, req.body ?? {}) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not save that event.' });
  }
});

app.post('/api/calendar/local/remove', (req, res) => {
  try {
    removeLocalEvent(req.body?.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not delete that event.' });
  }
});

// Course outlines (syllabi): read the schedule table so its due dates can be
// added to the calendar without retyping them. The text stays on this computer
// so Study can use its chapters and textbook list later.
app.post('/api/course-form/parse', express.raw({ type: '*/*', limit: '16mb' }), async (req, res) => {
  try {
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const mime = typeof req.query.mime === 'string' ? req.query.mime : '';
    const fileName = typeof req.query.fileName === 'string' ? req.query.fileName : 'course outline';
    const parsed = await readCourseForm(buffer, mime);
    res.json({ fileName, deadlines: parsed.deadlines, text: parsed.text.slice(0, 60_000) });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Could not read that course outline.',
    });
  }
});

app.post('/api/course-form/import', (req, res) => {
  try {
    const result = importFormDeadlines(req.body?.courseCode, req.body?.deadlines);
    const outline = req.body?.outline as { fileName?: unknown; text?: unknown } | undefined;
    const courseCode = typeof req.body?.courseCode === 'string' ? req.body.courseCode.trim() : '';
    if (courseCode && typeof outline?.text === 'string' && outline.text.trim()) {
      saveOutline(
        courseCode,
        typeof outline.fileName === 'string' ? outline.fileName : 'Course outline',
        'saved',
        outline.text,
      );
    }
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Could not add those dates.',
    });
  }
});

// The user's own AI provider. The key is written to this computer's config and
// only ever travels to the provider they chose.
app.get('/api/ai', (_req, res) => {
  res.json(aiStatus());
});

app.post('/api/ai/settings', (req, res) => {
  try {
    res.json(saveAiSettings(req.body ?? {}));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not save those settings.' });
  }
});

app.post('/api/ai/test', async (_req, res) => {
  try {
    res.json(await testAi());
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'The AI test failed.' });
  }
});

app.post('/api/ai/forget', (_req, res) => {
  res.json(forgetAiKey());
});

// Ask about the page the student is looking at. Only that page's text and
// screenshot are sent, and the page is never stored by the app.
app.post('/api/ai/page', async (req, res) => {
  try {
    res.json(await askAiAboutPage(req.body ?? {}));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The AI could not answer.';
    const status = /Settings → AI|API key|question|page|image/i.test(message) ? 400 : 502;
    res.status(status).json({ error: message });
  }
});

// AI handwriting joins PdfCraft OCR in the same searchable sidecar.
app.post('/api/library/:id/ocr/handwriting', async (req, res) => {
  try {
    res.json(
      await transcribeHandwriting({
        ...(req.body ?? {}),
        id: req.params.id,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read the handwriting.';
    const status =
      /no longer in Content Space/i.test(message)
        ? 404
        : /Settings → AI|API key|page|image/i.test(message)
          ? 400
          : 502;
    res.status(status).json({ error: message });
  }
});

app.post('/api/outlines/scan', async (_req, res) => {
  try {
    res.json(await scanCourseOutlines());
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Could not scan your course outlines.',
    });
  }
});

app.post('/api/study', async (req, res) => {
  try {
    res.json(await buildStudyPlan(req.body ?? {}));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Could not build that study plan.',
    });
  }
});

// One lecture from the Content tab → a plan plus a video pick for each channel.
app.post('/api/study/lecture', async (req, res) => {
  try {
    res.json(await buildLecturePlan(req.body ?? {}));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Could not build that lecture plan.',
    });
  }
});

// One file + one channel → the AI's most useful video topic for it.
app.post('/api/study/video', async (req, res) => {
  try {
    res.json(await recommendStudyVideo(req.body ?? {}));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Could not pick a video for that file.',
    });
  }
});

app.post('/api/integrations/notion/databases', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  try {
    res.json(await listNotionDatabases(token));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not reach Notion.' });
  }
});

app.post('/api/integrations/notion', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const databaseId = typeof req.body?.databaseId === 'string' ? req.body.databaseId : '';
  try {
    const events = await connectNotion(token, databaseId);
    res.json({ events, status: getIntegrationStatus(readConfig()) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Could not read that database.' });
  }
});

app.post('/api/integrations/notion/remove', (_req, res) => {
  disconnectNotion();
  res.json({ status: getIntegrationStatus(readConfig()) });
});

// ---------------------------------------------------------------------------
// Content Space: files downloaded from D2L or the exam bank

app.get('/api/library', (_req, res) => {
  res.json({ files: listLibrary() });
});

app.post('/api/library/download', async (req, res) => {
  try {
    const file = await downloadTopic(req.body ?? {});
    res.json({ file, files: listLibrary() });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Could not download that file.',
    });
  }
});

// Own files arrive as the raw bytes with the details in the query string, so
// no multipart parser (or extra dependency) is involved.
app.post('/api/library/upload', express.raw({ type: '*/*', limit: '150mb' }), (req, res) => {
  try {
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const file = uploadLibraryFile({ ...(req.query as Record<string, unknown>), buffer });
    res.json({ file, files: listLibrary() });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Could not save that file.',
    });
  }
});

app.post('/api/library/download-drive', async (req, res) => {
  try {
    const file = await downloadDriveFile(req.body ?? {});
    res.json({ file, files: listLibrary() });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Could not download that exam-bank file.',
    });
  }
});

app.post('/api/library/reveal', async (req, res) => {
  if (!(await revealLibraryFile(req.body?.id))) {
    res.status(404).json({ error: 'That file is no longer in Content Space.' });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/library/remove', (req, res) => {
  try {
    if (!removeLibraryFile(req.body?.id)) {
      res.status(404).json({ error: 'That file is no longer in Content Space.' });
      return;
    }
    res.json({ files: listLibrary() });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Could not remove that file.',
    });
  }
});

app.get('/api/library/file/:id', (req, res) => {
  const found = libraryFilePath(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'That file is no longer in Content Space.' });
    return;
  }
  res.setHeader('content-type', found.file.mime || 'application/octet-stream');
  res.setHeader(
    'content-disposition',
    `inline; filename*=UTF-8''${encodeURIComponent(found.file.fileName)}`,
  );
  res.setHeader('cache-control', 'private, max-age=3600');
  // The dev data folder starts with a dot, which send() hides by default.
  res.sendFile(found.filePath, { dotfiles: 'allow' }, (error) => {
    if (error && !res.headersSent) res.status(404).json({ error: 'That file is missing on disk.' });
  });
});

// Freehand notes over a PDF, saved beside the file on this computer.
app.get('/api/library/:id/annotations', (req, res) => {
  try {
    // A stale cached copy would hide ink the viewer just saved.
    res.setHeader('cache-control', 'no-store');
    res.json(readPdfInk(req.params.id));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : 'Could not open annotations.' });
  }
});

app.put('/api/library/:id/annotations', (req, res) => {
  try {
    res.json(savePdfInk(req.params.id, req.body));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save annotations.';
    const status = /no longer in Content Space/i.test(message)
      ? 404
      : /too large/i.test(message)
        ? 413
        : 400;
    res.status(status).json({ error: message });
  }
});

// Scanned PDFs: PdfCraft reads one page and the text is kept in a sidecar so
// it can be searched again later. The PDF bytes are never rewritten.
app.get('/api/library/:id/ocr', (req, res) => {
  try {
    res.setHeader('cache-control', 'no-store');
    res.json({ pages: readOcrText(req.params.id) });
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : 'Could not open OCR text.' });
  }
});

app.post('/api/library/:id/ocr', async (req, res) => {
  try {
    res.json(await recognizePdfPage(req.params.id, req.body?.page));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read this page.';
    const status =
      error instanceof OcrUnavailableError
        ? 503
        : /no longer in Content Space/i.test(message)
          ? 404
          : /models|not available/i.test(message)
            ? 503
            : 400;
    res.status(status).json({ error: message });
  }
});

app.get('/api/exambank', async (req, res) => {
  try {
    const folder = typeof req.query.folder === 'string' ? req.query.folder : undefined;
    res.json(await loadExamBank(folder));
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Could not open the exam bank.',
    });
  }
});

// Custom exam banks: a public Drive folder link, browsed like the MUES archive.
app.post('/api/exambank/sources', async (req, res) => {
  try {
    const banks = await addExamBankSource(req.body ?? {});
    res.json({ banks });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Could not add that exam bank.',
    });
  }
});

app.post('/api/exambank/sources/remove', (req, res) => {
  try {
    res.json({ banks: removeExamBankSource(req.body?.id) });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Could not remove that exam bank.',
    });
  }
});

// The bell: D2L's own alerts feed, with read state kept on this computer.
app.get('/api/notifications', async (req, res) => {
  const limit = Number(req.query.limit);
  try {
    res.json(await getNotifications(Number.isFinite(limit) ? limit : undefined));
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Could not load notifications.',
    });
  }
});

app.post('/api/notifications/read', async (_req, res) => {
  try {
    res.json(await markNotificationsRead());
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Could not update notifications.',
    });
  }
});

app.post('/api/connect', (req, res) => {
  const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl : undefined;
  res.json(startConnect(baseUrl));
});

app.get('/api/connect/status', (_req, res) => {
  res.json(getConnectStatus());
});

app.post('/api/connect/cancel', (_req, res) => {
  res.json(cancelConnect());
});

app.post('/api/disconnect', (_req, res) => {
  disconnect();
  clearNotificationCache();
  res.json(appStatePayload());
});

app.get('/api/course-image/:id', async (req, res) => {
  try {
    const image = await getCourseImage(req.params.id);
    if (!image) {
      res.status(404).end();
      return;
    }
    res.setHeader('content-type', image.contentType);
    res.setHeader('cache-control', 'private, max-age=3600');
    res.end(image.body);
  } catch {
    res.status(404).end();
  }
});

app.get('/api/course/:id', async (req, res) => {
  try {
    const detail = await loadCourse(req.params.id, req.query.refresh === '1');
    if (!detail) {
      res.status(404).json({ error: 'That course could not be loaded. Reconnect to D2L and try again.' });
      return;
    }
    res.json(detail);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not load this course.',
    });
  }
});

app.get('/api/course/:id/content', async (req, res) => {
  try {
    const module = typeof req.query.module === 'string' ? req.query.module : undefined;
    const content = await loadCourseContent(req.params.id, module);
    if (!content) {
      res.status(404).json({ error: 'Course content could not be loaded. Reconnect to D2L and try again.' });
      return;
    }
    res.json(content);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not load the course content.',
    });
  }
});

app.get('/api/course/:id/grades', async (req, res) => {
  try {
    const grades = await loadCourseGrades(req.params.id);
    if (!grades) {
      res.status(404).json({ error: 'Grades could not be loaded. Reconnect to D2L and try again.' });
      return;
    }
    res.json(grades);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not load the grades.',
    });
  }
});

app.get('/api/dashboard', async (_req, res) => {
  try {
    if (DEMO_MODE) {
      res.json(demoDashboardPayload());
      return;
    }

    const dashboard = await loadDashboard();
    let synced: CalendarEvent[] = [];
    try {
      synced = await getExternalEvents();
    } catch {
      // A broken feed must not take the whole dashboard down.
      synced = [];
    }
    const events = mergeEvents(dashboard.data.events, synced);
    res.json({
      ...dashboard,
      data: {
        ...dashboard.data,
        events,
        notice: dashboard.data.notice ?? integrationNotice(),
      },
      integrations: getIntegrationStatus(readConfig()),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not load the dashboard.',
    });
  }
});

// Serve the built app when `npm run build` has been run; in dev Vite handles the UI.
// The desktop shell passes its bundled UI folder through D2L_HUB_DIST.
const distDir = process.env.D2L_HUB_DIST
  ? path.resolve(process.env.D2L_HUB_DIST)
  : path.resolve(process.cwd(), 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`D2L Hub API listening on http://127.0.0.1:${PORT}`);
});
