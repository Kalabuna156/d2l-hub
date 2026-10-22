import type {
  AiProvider,
  AiStatus,
  AppState,
  CalendarEvent,
  ConnectStatus,
  CourseFormDeadline,
  CourseContent,
  CourseDetail,
  CourseGrades,
  DashboardData,
  EventOverride,
  ExamBankFolder,
  ExamBankLink,
  IntegrationStatus,
  IntegrationsPayload,
  LectureStudyPayload,
  LibraryFile,
  NotificationFeed,
  NotionDatabaseList,
  OutlineScanResult,
  Preferences,
  StudyPayload,
  StudyVideoChannel,
  StudyVideoSuggestion,
} from '../../shared/types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* keep the status message */
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export function fetchState(): Promise<AppState> {
  return request<AppState>('/api/state');
}

export function fetchDashboard(): Promise<{ data: DashboardData; connected: boolean }> {
  return request<{ data: DashboardData; connected: boolean }>('/api/dashboard');
}

export function fetchCourse(courseId: string, fresh = false): Promise<CourseDetail> {
  return request<CourseDetail>(`/api/course/${courseId}${fresh ? '?refresh=1' : ''}`);
}

export function fetchCourseContent(courseId: string, moduleId?: string): Promise<CourseContent> {
  const query = moduleId ? `?module=${encodeURIComponent(moduleId)}` : '';
  return request<CourseContent>(`/api/course/${courseId}/content${query}`);
}

export function fetchCourseGrades(courseId: string): Promise<CourseGrades> {
  return request<CourseGrades>(`/api/course/${courseId}/grades`);
}

export function connectD2L(baseUrl: string): Promise<ConnectStatus> {
  return request<ConnectStatus>('/api/connect', {
    method: 'POST',
    body: JSON.stringify({ baseUrl }),
  });
}

export function fetchConnectStatus(): Promise<ConnectStatus> {
  return request<ConnectStatus>('/api/connect/status');
}

export function cancelConnect(): Promise<ConnectStatus> {
  return request<ConnectStatus>('/api/connect/cancel', { method: 'POST' });
}

export function disconnectD2L(): Promise<AppState> {
  return request<AppState>('/api/disconnect', { method: 'POST' });
}

export function saveBaseUrl(baseUrl: string): Promise<AppState> {
  return request<AppState>('/api/settings', {
    method: 'POST',
    body: JSON.stringify({ baseUrl }),
  });
}

export function savePreferences(preferences: Preferences): Promise<AppState> {
  return request<AppState>('/api/preferences', {
    method: 'POST',
    body: JSON.stringify({ preferences }),
  });
}

export function fetchIntegrations(): Promise<IntegrationsPayload> {
  return request<IntegrationsPayload>('/api/integrations');
}

export function syncIntegrations(): Promise<IntegrationsPayload> {
  return request<IntegrationsPayload>('/api/integrations/sync', { method: 'POST' });
}

export function connectGoogleFeed(url: string): Promise<{ events: unknown[]; status: IntegrationStatus }> {
  return request<{ events: unknown[]; status: IntegrationStatus }>('/api/integrations/google', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function removeGoogleFeed(): Promise<{ status: IntegrationStatus }> {
  return request<{ status: IntegrationStatus }>('/api/integrations/google/remove', { method: 'POST' });
}

export function fetchNotionDatabases(token: string): Promise<NotionDatabaseList> {
  return request<NotionDatabaseList>('/api/integrations/notion/databases', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function connectNotionDatabase(
  token: string,
  databaseId: string,
): Promise<{ events: unknown[]; status: IntegrationStatus }> {
  return request<{ events: unknown[]; status: IntegrationStatus }>('/api/integrations/notion', {
    method: 'POST',
    body: JSON.stringify({ token, databaseId }),
  });
}

export function removeNotionDatabase(): Promise<{ status: IntegrationStatus }> {
  return request<{ status: IntegrationStatus }>('/api/integrations/notion/remove', { method: 'POST' });
}

/** Save local changes for one Google class. */
export function saveEventOverride(id: string, patch: EventOverride): Promise<{ status: IntegrationStatus }> {
  return request<{ status: IntegrationStatus }>('/api/integrations/google/override', {
    method: 'POST',
    body: JSON.stringify({ id, patch }),
  });
}

/** Go back to exactly what the calendar feed says. */
export function resetEventOverride(id: string): Promise<{ status: IntegrationStatus }> {
  return request<{ status: IntegrationStatus }>('/api/integrations/google/override/clear', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

interface LocalEventFields {
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
}

/** Add an event that only exists in this app. */
export function createLocalEvent(input: LocalEventFields): Promise<{ event: CalendarEvent }> {
  return request<{ event: CalendarEvent }>('/api/calendar/local', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateLocalEvent(id: string, input: LocalEventFields): Promise<{ event: CalendarEvent }> {
  return request<{ event: CalendarEvent }>('/api/calendar/local/update', {
    method: 'POST',
    body: JSON.stringify({ id, ...input }),
  });
}

export function deleteLocalEvent(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/calendar/local/remove', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

/** Read the due dates out of an uploaded course outline (PDF or text). */
export async function parseCourseForm(
  file: File,
): Promise<{ fileName: string; deadlines: CourseFormDeadline[]; text: string }> {
  const params = new URLSearchParams({
    fileName: file.name,
    mime: file.type || 'application/octet-stream',
  });
  const response = await fetch(`/api/course-form/parse?${params.toString()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: file,
  });
  if (!response.ok) {
    let message = `Could not read that outline (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* keep the status message */
    }
    throw new Error(message);
  }
  return (await response.json()) as {
    fileName: string;
    deadlines: CourseFormDeadline[];
    text: string;
  };
}

/** Save reviewed outline dates, plus its text for Study, to this computer. */
export function importCourseForm(input: {
  courseCode: string | null;
  deadlines: Array<{ title: string; startsAt: string; endsAt: string }>;
  outline?: { fileName: string; text: string } | null;
}): Promise<{ added: number; skipped: number; events: CalendarEvent[] }> {
  return request<{ added: number; skipped: number; events: CalendarEvent[] }>('/api/course-form/import', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Files downloaded into Content Space. */
export function fetchLibrary(): Promise<{ files: LibraryFile[] }> {
  return request<{ files: LibraryFile[] }>('/api/library');
}

export interface TopicDownloadFields {
  courseId: string;
  courseCode: string | null;
  courseName: string;
  title: string;
  url: string;
  folder: string | null;
}

export function downloadCourseFile(
  input: TopicDownloadFields,
): Promise<{ file: LibraryFile; files: LibraryFile[] }> {
  return request<{ file: LibraryFile; files: LibraryFile[] }>('/api/library/download', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function downloadExamBankFile(input: {
  fileId: string;
  name: string;
  folder: string;
  bankId: string;
  bankName: string;
}): Promise<{ file: LibraryFile; files: LibraryFile[] }> {
  return request<{ file: LibraryFile; files: LibraryFile[] }>('/api/library/download-drive', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * Send a file from the user's computer into a Content Space shelf. The bytes
 * go up as the raw request body; the details ride in the query string.
 */
export async function uploadLibraryFile(input: {
  courseId: string;
  courseCode: string | null;
  courseName: string;
  title: string;
  folder: string | null;
  file: File;
}): Promise<{ file: LibraryFile; files: LibraryFile[] }> {
  const params = new URLSearchParams({
    courseId: input.courseId,
    courseCode: input.courseCode ?? '',
    courseName: input.courseName,
    title: input.title,
    folder: input.folder ?? '',
    fileName: input.file.name,
    mime: input.file.type || 'application/octet-stream',
  });

  const response = await fetch(`/api/library/upload?${params.toString()}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: input.file,
  });
  if (!response.ok) {
    let message = `Upload failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* keep the status message */
    }
    throw new Error(message);
  }
  return (await response.json()) as { file: LibraryFile; files: LibraryFile[] };
}

export function revealLibraryFile(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/library/reveal', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

/** The user's own AI provider, saved on this computer. */
export function saveAiSettings(input: {
  provider: AiProvider;
  apiKey?: string;
  model?: string;
  customBaseUrl?: string;
  allowCourseFiles?: boolean;
  clearKey?: boolean;
}): Promise<AiStatus> {
  return request<AiStatus>('/api/ai/settings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function testAi(): Promise<{ provider: string; model: string }> {
  return request<{ provider: string; model: string }>('/api/ai/test', { method: 'POST' });
}

export function forgetAiKey(): Promise<AiStatus> {
  return request<AiStatus>('/api/ai/forget', { method: 'POST' });
}

/** Find every course outline and let the AI read its dates. */
export function scanCourseOutlines(): Promise<OutlineScanResult> {
  return request<OutlineScanResult>('/api/outlines/scan', { method: 'POST' });
}

/** A study plan for one assessment, cached until regenerated. */
export function buildStudyPlan(input: {
  title: string;
  courseCode: string | null;
  courseName: string | null;
  startsAt: string | null;
  courseId: string | null;
  refresh?: boolean;
}): Promise<StudyPayload> {
  return request<StudyPayload>('/api/study', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function buildLectureStudy(input: {
  courseId: string | null;
  courseCode: string | null;
  courseName: string;
  topicTitle: string;
  topicType: string | null;
  topicUrl: string;
  moduleTitle: string | null;
  refresh?: boolean;
}): Promise<LectureStudyPayload> {
  return request<LectureStudyPayload>('/api/study/lecture', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function recommendStudyVideo(input: {
  channel: StudyVideoChannel;
  fileTitle: string;
  fileName?: string;
  fileType?: string | null;
  courseCode: string | null;
  courseName: string | null;
  assessmentTitle: string;
}): Promise<StudyVideoSuggestion> {
  return request<StudyVideoSuggestion>('/api/study/video', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function removeLibraryFile(id: string): Promise<{ files: LibraryFile[] }> {
  return request<{ files: LibraryFile[] }>('/api/library/remove', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

/** The notification bell: D2L's alerts feed, newest first. */
export function fetchNotifications(limit?: number): Promise<NotificationFeed> {
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : '';
  return request<NotificationFeed>(`/api/notifications${query}`);
}

/** Everything currently in the bell becomes read. */
export function markNotificationsRead(): Promise<NotificationFeed> {
  return request<NotificationFeed>('/api/notifications/read', { method: 'POST' });
}

/** The public MUES exam bank folder, rendered as an in-app listing. */
export function fetchExamBank(folderId?: string): Promise<ExamBankFolder> {
  const query = folderId ? `?folder=${encodeURIComponent(folderId)}` : '';
  return request<ExamBankFolder>(`/api/exambank${query}`);
}

/** Add a Drive folder as another exam bank; the folder title is used if unnamed. */
export function addExamBankSource(input: { name: string; url: string }): Promise<{ banks: ExamBankLink[] }> {
  return request<{ banks: ExamBankLink[] }>('/api/exambank/sources', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function removeExamBankSource(id: string): Promise<{ banks: ExamBankLink[] }> {
  return request<{ banks: ExamBankLink[] }>('/api/exambank/sources/remove', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}
