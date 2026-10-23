export interface Course {
  /** Brightspace org unit id, e.g. "123456" */
  id: string;
  /** Display title, e.g. "MTH140 - Calculus I - F2026" */
  name: string;
  /** Enrollment code from D2L, e.g. "MTH140_F26_01" */
  code: string;
  /** Absolute URL to the course home in D2L */
  url: string;
  /** Optional course banner image discovered on the D2L page */
  imageUrl: string | null;
}

export type EventSource = 'd2l' | 'google' | 'notion' | 'local' | 'form';

export interface CalendarEvent {
  id: string;
  title: string;
  courseCode: string | null;
  /** ISO timestamp when known */
  startsAt: string | null;
  /** ISO timestamp the event ends; only timed calendar entries have one */
  endsAt?: string | null;
  /** Room or place from the source calendar, e.g. "KHE231A" */
  location?: string | null;
  /** Raw label from D2L, used when startsAt could not be parsed */
  whenLabel: string | null;
  url: string | null;
  /** Where the event came from; omitted means D2L. */
  source?: EventSource;
  /** Calendar or database name for synced events */
  calendarName?: string | null;
  /** Hidden locally, e.g. a class the school cancelled */
  hidden?: boolean;
  /** At least one field was changed in this app */
  edited?: boolean;
}

/** A due date read out of an uploaded course outline, before it is imported. */
export interface CourseFormDeadline {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  /** The outline line it was read from, shown while reviewing */
  raw: string;
}

/** Local changes applied on top of a synced event; Google itself is untouched. */
export interface EventOverride {
  title?: string;
  location?: string | null;
  startsAt?: string;
  endsAt?: string | null;
  hidden?: boolean;
}

export interface DashboardData {
  /** 'empty' means nothing is connected yet, so no courses are shown. */
  source: 'live' | 'sample' | 'empty';
  /** Human readable explanation, e.g. what to connect or why sample data is showing */
  notice: string | null;
  user: { name: string | null; baseUrl: string };
  courses: Course[];
  events: CalendarEvent[];
  fetchedAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  /** ISO timestamp of the announcement start date */
  publishedAt: string | null;
  /** Sanitised HTML body, already safe to render */
  bodyHtml: string;
  /** Plain text version, used for previews */
  bodyText: string;
  /** Absolute D2L link to the announcement */
  url: string;
}

export interface Assignment {
  id: string;
  name: string;
  /** Assignment group / category, e.g. "MATLAB" */
  category: string | null;
  /** ISO timestamp of the due date */
  dueAt: string | null;
  /** Raw due label when it could not be parsed */
  dueLabel: string | null;
  /** Score as D2L shows it, e.g. "100 %" */
  score: string | null;
  /** Submission / evaluation state, e.g. "1 Submission, 1 File" */
  status: string | null;
  /** Absolute D2L link to the assignment */
  url: string;
}

export interface CourseLink {
  label: string;
  href: string;
}

export interface ContentModule {
  id: string;
  name: string;
  /** 0 = top level, 1 = nested sub-module */
  depth: number;
  /** Topics D2L reports as still remaining */
  remaining: number | null;
  /** Total topics in the module */
  total: number | null;
}

export interface ContentTopic {
  id: string;
  title: string;
  /** "PDF document", "Excel Spreadsheet", "Web Page"… */
  type: string | null;
  url: string;
}

export interface CourseContent {
  modules: ContentModule[];
  moduleId: string | null;
  moduleTitle: string | null;
  topics: ContentTopic[];
  contentUrl: string;
  fetchedAt: string;
}

export interface GradeItem {
  id: string;
  name: string;
  /** 0 = grade item, 1 = item inside a grade category */
  depth: number;
  /** A category row that has items underneath it */
  kind: 'item' | 'group';
  /** Points column, e.g. "2 / 2" */
  points: string | null;
  /** Weight achieved column, e.g. "2 / 2" */
  achieved: string | null;
  /** Grade column, e.g. "100 %" */
  grade: string | null;
  /** Text in the comments / assessments column */
  comment: string | null;
  url: string | null;
}

export interface CourseGrades {
  items: GradeItem[];
  gradesUrl: string;
  fetchedAt: string;
}

export interface CourseDetail {
  course: Course;
  announcements: Announcement[];
  assignments: Assignment[];
  events: CalendarEvent[];
  links: CourseLink[];
  notice: string | null;
  fetchedAt: string;
}


export type AiProvider = 'gemini' | 'openai' | 'anthropic' | 'custom';

/** The AI key itself never leaves the server; the UI only sees this summary. */
export interface AiStatus {
  configured: boolean;
  provider: AiProvider;
  /** Model in use, already defaulted for the provider */
  model: string;
  customBaseUrl: string | null;
  /** The user allowed lecture-file text to be sent with a study request */
  allowCourseFiles: boolean;
  /** Last four characters, so a saved key is recognisable */
  keyHint: string | null;
}

/** Outline text kept on this computer so Study can read it later. */
export interface OutlineRecord {
  courseCode: string;
  fileName: string;
  source: 'd2l' | 'library' | 'saved';
  text: string;
  savedAt: string;
}

export interface StudyFocus {
  topic: string;
  detail: string;
}

export interface StudyBookPractice {
  source: string;
  problems: string[];
}

export interface StudyQuestion {
  question: string;
  answer: string;
  source: string;
}

export interface StudyPlan {
  overview: string;
  focus: StudyFocus[];
  checklist: string[];
  bookPractice: StudyBookPractice[];
  practice: StudyQuestion[];
}

/** Whether this plan came from the user's AI key or was assembled locally. */
export type StudyPlanSource = 'ai' | 'local';

export interface StudyGuideRecord {
  key: string;
  courseCode: string | null;
  title: string;
  startsAt: string | null;
  plan: StudyPlan;
  generatedAt: string;
  readByAi: string[];
}

/** A file Study can offer, from Content Space or the course's D2L content. */
export interface StudyFile {
  id: string;
  title: string;
  type: string | null;
  source: 'library' | 'd2l';
  /** Inline URL for Content Space files, D2L viewer URL otherwise */
  url: string | null;
  /** Content Space files can be viewed, downloaded and revealed */
  canOpen: boolean;
  /** D2L module or Content Space folder, used when saving the file */
  folder?: string | null;
  /** The text of this file was part of the AI request */
  readByAi: boolean;
}

export interface StudyPayload {
  title: string;
  courseCode: string | null;
  courseName: string | null;
  startsAt: string | null;
  courseId: string | null;
  plan: StudyPlan | null;
  /** 'local' means no AI was used: outline and file names built the plan. */
  planSource: StudyPlanSource | null;
  generatedAt: string | null;
  cached: boolean;
  ai: AiStatus;
  outlineFileName: string | null;
  /** Announcements that mention quiz or exam coverage, used for the plan. */
  announcements: StudyAnnouncement[];
  files: StudyFile[];
  readByAi: string[];
  notes: string[];
}

/** The part of a course announcement that Study shows and sends to the AI. */
export interface StudyAnnouncement {
  id: string;
  title: string;
  publishedAt: string | null;
  url: string;
  text: string;
}

/** A study plan for one lecture, with a video pick for each channel. */
export interface LectureStudyPayload {
  topicTitle: string;
  topicType: string | null;
  topicUrl: string;
  moduleTitle: string | null;
  courseCode: string | null;
  courseName: string | null;
  plan: StudyPlan | null;
  generatedAt: string | null;
  ai: AiStatus;
  videos: StudyVideoSuggestion[];
  readByAi: boolean;
  notes: string[];
}

export type StudyVideoChannel = '3blue1brown' | 'organic-chem-tutor';

/** One AI-picked study video, linked through a channel-scoped YouTube search. */
export interface StudyVideoSuggestion {
  channel: StudyVideoChannel;
  channelName: string;
  /** The specific topic or video the AI chose */
  title: string;
  /** Search phrase, kept short so the channel finds a match */
  query: string;
  /** Why this pick helps with the file at hand */
  reason: string;
  url: string;
  /** False when no key is configured and the query came from the file name */
  fromAi: boolean;
}

/** One course's outline scan result, before anything is added to the calendar. */
export interface OutlineScanCourse {
  courseId: string;
  courseCode: string;
  courseName: string;
  outlineFileName: string | null;
  outlineSource: 'd2l' | 'library' | 'saved' | null;
  deadlines: CourseFormDeadline[];
  undated: Array<{ title: string; when: string }>;
  error: string | null;
}

export interface OutlineScanResult {
  provider: string;
  model: string;
  courses: OutlineScanCourse[];
}

export interface AppState {
  baseUrl: string;
  connected: boolean;
  userName: string | null;
  savedAt: string | null;
  chromeAvailable: boolean;
  connect: ConnectStatus;
  preferences: Preferences;
  integrations: IntegrationStatus;
  ai: AiStatus;
  /** The built-in MUES archive plus any folders added in Settings */
  examBanks: ExamBankLink[];
}

export type AccentId = 'violet' | 'sky' | 'emerald' | 'amber' | 'rose' | 'fuchsia';
export type BackdropId = 'aurora' | 'noir' | 'sunset' | 'ocean' | 'meadow';

export interface Preferences {
  accent: AccentId;
  backdrop: BackdropId;
  /** Optional https image URL shown behind the app */
  backgroundImage: string | null;
  /** Opacity of that image, 0-100 */
  imageDim: number;
  /** Show the MUES exam bank section */
  examBank: boolean;
  /** The redesigned Overview. Read once per launch: changing it needs a restart. */
  newOverview: boolean;
}

/** A file downloaded into Content Space, either from D2L or the exam bank. */
export interface LibraryFile {
  id: string;
  courseId: string;
  courseCode: string | null;
  courseName: string;
  title: string;
  fileName: string;
  mime: string;
  size: number;
  /** "local" files were uploaded by the user, not downloaded from D2L or Drive */
  source: 'd2l' | 'drive' | 'local';
  sourceUrl: string | null;
  /** D2L module or Drive folder path, used when the name has no unit. */
  folder: string | null;
  /** The folder was chosen on purpose (dropped or typed), so it outranks the title. */
  folderPinned?: boolean;
  downloadedAt: string;
}

export interface LibraryDetail {
  files: LibraryFile[];
  totalSize: number;
}

/** Freehand ink a student adds over a PDF page. */
export type PdfInkTool = 'pen' | 'highlighter';

export interface PdfInkPoint {
  /** PDF points from the top-left of the unrotated page */
  x: number;
  y: number;
  /** Stylus pressure from 0 to 1; 0.5 for a mouse */
  pressure: number;
}

export interface PdfInkStroke {
  id: string;
  /** 1-based page number */
  page: number;
  tool: PdfInkTool;
  /** #rrggbb */
  color: string;
  /** Stroke width in PDF points */
  width: number;
  opacity: number;
  points: PdfInkPoint[];
}

/** Everything drawn over one Content Space PDF. */
export interface PdfInkAnnotations {
  version: 1;
  strokes: PdfInkStroke[];
}

/** One page read by OCR; the PDF itself is not rewritten. */
export interface PdfOcrResult {
  page: number;
  text: string;
  words: number;
  /** Set when PdfCraft skipped the page, e.g. it already has selectable text. */
  skipped: string | null;
}

/** OCR text kept between sessions, keyed by 1-based page number. */
export interface PdfOcrText {
  pages: Record<string, string>;
}

/** One AI reply about the PDF page the viewer currently shows. */
export interface AiPageReply {
  reply: string;
}

/** Handwriting read by the AI from the current page screenshot. */
export interface PdfHandwritingResult {
  page: number;
  /** Only the handwriting, with printed page text left out. */
  text: string;
  words: number;
  found: boolean;
  /** What was saved for search (existing OCR text plus the handwriting). */
  savedText: string;
}

export interface DriveEntry {
  id: string;
  name: string;
  kind: 'folder' | 'file';
  /** Google's description, e.g. "PDF" or "Folder" */
  type: string;
  modifiedAt: string | null;
  /** Bytes when Google reports a file size */
  size: number | null;
}

export interface ExamBankFolder {
  id: string;
  name: string | null;
  entries: DriveEntry[];
  fetchedAt: string;
}

/** A Google Drive folder the user added as their own exam bank. */
export interface ExamBankSource {
  id: string;
  /** Display name, e.g. "ECE past papers" */
  name: string;
  /** The link or folder id exactly as it was entered */
  url: string;
}

/** A bank the Exam bank page can browse, with its folder already resolved. */
export interface ExamBankLink {
  id: string;
  name: string;
  folderId: string;
  /** True for the MUES archive that ships with the app */
  builtin: boolean;
  url: string;
}

export interface IntegrationConnection {
  connected: boolean;
  /** Human readable name, e.g. the calendar or database title */
  label: string | null;
  lastSync: string | null;
  error: string | null;
  /** Number of upcoming events the last sync produced */
  count: number;
}

export interface IntegrationStatus {
  google: IntegrationConnection;
  notion: IntegrationConnection;
}

export interface NotionDatabaseOption {
  id: string;
  title: string;
  /** Date property used for due dates, when the database has one */
  dateProperty: string | null;
}

export interface IntegrationsPayload {
  status: IntegrationStatus;
  events: CalendarEvent[];
}

export interface NotionDatabaseList {
  databases: NotionDatabaseOption[];
  /** True when a token works but nothing has been shared with the integration */
  empty: boolean;
}

/** What a D2L alert is about, used to pick the icon in the bell panel. */
export type NotificationKind = 'grade' | 'content' | 'announcement' | 'message' | 'other';

/** One entry in the notification bell. */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  /** D2L's own label, e.g. "Grade Updated" or "Content Created" */
  categoryLabel: string;
  /** The line D2L shows in the bell, e.g. "“Quiz 3” updated." */
  title: string;
  courseId: string | null;
  courseName: string | null;
  courseCode: string | null;
  /** ISO timestamp, null when D2L did not date the alert */
  createdAt: string | null;
  /** Link back to the item in D2L */
  url: string | null;
  /** Compared against the last time the bell was cleared */
  read: boolean;
}

export interface NotificationFeed {
  items: AppNotification[];
  /** Unread alerts among everything fetched, not just the ones returned */
  unread: number;
  /** How many alerts D2L has for this account, capped */
  total: number;
  /** Set when D2L could not be read at all */
  error: string | null;
  fetchedAt: string;
}

export type ConnectPhase = 'idle' | 'waiting' | 'connected' | 'error';

export interface ConnectStatus {
  phase: ConnectPhase;
  message: string;
}
