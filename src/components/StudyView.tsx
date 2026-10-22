import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  FolderSearch,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { describeCourse } from '../../shared/categorize';
import type {
  AiStatus,
  CalendarEvent,
  Course,
  LibraryFile,
  StudyFile,
  StudyPayload,
  StudyQuestion,
  StudyVideoChannel,
  StudyVideoSuggestion,
} from '../../shared/types';
import { buildStudyPlan, downloadCourseFile, recommendStudyVideo, revealLibraryFile } from '../lib/api';
import {
  courseShortCode,
  relativeLabel,
  shortDateParts,
  timeLabel,
  urgencyFor,
  urgencyStyles,
} from '../lib/format';
import { upcomingAssessments } from '../lib/priority';

interface StudyViewProps {
  events: CalendarEvent[];
  courses: Course[];
  ai: AiStatus | null;
  onRefresh: () => void;
  onOpenSettings: () => void;
}

/** A deadline's course code and the D2L course it belongs to. */
function courseFor(event: CalendarEvent, courses: Course[]): Course | null {
  if (!event.courseCode) return null;
  const exact = courses.find((course) => course.code === event.courseCode);
  if (exact) return exact;
  const info = describeCourse({ code: event.courseCode, name: event.courseCode });
  return (
    courses.find((course) => {
      const courseInfo = describeCourse(course);
      return (
        courseInfo.kind === 'course' &&
        courseInfo.number !== null &&
        `${courseInfo.subject}${courseInfo.number}` === `${info.subject}${info.number}`
      );
    }) ?? null
  );
}

const COURSE_LINKS_KEY = 'd2l-hub:study-course-links';

/** Assessments without a course code can be linked once and keep that link. */
function readCourseLinks(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(COURSE_LINKS_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === 'string' && typeof entry[1] === 'string' && entry[1].length > 0,
      ),
    );
  } catch {
    return {};
  }
}

/** The course's Content home in D2L, even when no file is saved locally. */
function courseContentUrl(course: Course | null): string | null {
  if (!course || !/^\d+$/.test(course.id)) return null;
  try {
    return `${new URL(course.url).origin}/d2l/le/content/${course.id}/Home`;
  } catch {
    return null;
  }
}

function teachingCourses(courses: Course[]): Course[] {
  return courses
    .filter((course) => describeCourse(course).kind === 'course')
    .sort((a, b) => a.name.localeCompare(b.name));
}

function QuestionCard({ question, index }: { question: StudyQuestion; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="focus-ring flex w-full items-start gap-2.5 px-3.5 py-3 text-left"
      >
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-500/[0.14] text-[10px] font-semibold text-violet-200">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-slate-200">{question.question}</span>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-white/[0.06] px-3.5 py-3 pl-[42px]">
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-slate-300">{question.answer}</p>
          {question.source && (
            <p className="mt-2 text-[10.5px] text-slate-600">From {question.source}</p>
          )}
        </div>
      )}
    </div>
  );
}

const VIDEO_CHANNELS: Array<{
  channel: StudyVideoChannel;
  short: string;
  name: string;
  aria: string;
  tone: string;
}> = [
  {
    channel: '3blue1brown',
    short: '3B1B',
    name: '3Blue1Brown',
    aria: 'Find a 3Blue1Brown video for this file',
    tone: 'border-sky-400/25 bg-sky-500/[0.12] text-sky-200 hover:border-sky-300/45 hover:bg-sky-500/[0.2] hover:text-white',
  },
  {
    channel: 'organic-chem-tutor',
    short: 'OCT',
    name: 'The Organic Chemistry Tutor',
    aria: 'Find an Organic Chemistry Tutor video for this file',
    tone: 'border-emerald-400/25 bg-emerald-500/[0.12] text-emerald-200 hover:border-emerald-300/45 hover:bg-emerald-500/[0.2] hover:text-white',
  },
];

function FileRow({
  file,
  payload,
  onSaved,
  onError,
}: {
  file: StudyFile;
  payload: StudyPayload;
  onSaved: (file: StudyFile, saved: LibraryFile) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState<StudyVideoChannel | null>(null);
  const [video, setVideo] = useState<StudyVideoSuggestion | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  const reveal = async () => {
    try {
      await revealLibraryFile(file.id);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not open that folder.');
    }
  };

  const findVideo = async (channel: StudyVideoChannel) => {
    if (videoBusy) return;
    setVideoBusy(channel);
    setVideoError(null);
    try {
      const suggestion = await recommendStudyVideo({
        channel,
        fileTitle: file.title,
        fileType: file.type,
        courseCode: payload.courseCode,
        courseName: payload.courseName,
        assessmentTitle: payload.title,
      });
      setVideo(suggestion);
    } catch (error) {
      setVideoError(error instanceof Error ? error.message : 'Could not pick a video for that file.');
    } finally {
      setVideoBusy(null);
    }
  };

  const save = async () => {
    if (!payload.courseId) return;
    setBusy(true);
    try {
      const result = await downloadCourseFile({
        courseId: payload.courseId,
        courseCode: payload.courseCode,
        courseName: payload.courseName ?? payload.courseCode ?? 'Course',
        title: file.title,
        url: file.url ?? '',
        folder: file.folder ?? null,
      });
      onSaved(file, result.file);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not save that file.');
    } finally {
      setBusy(false);
    }
  };

  const channelButtons = (
    <>
      {VIDEO_CHANNELS.map((item) => (
        <button
          key={item.channel}
          type="button"
          onClick={() => void findVideo(item.channel)}
          disabled={videoBusy !== null}
          title={`${item.name} — AI picks what to watch for this file`}
          aria-label={`${item.aria}: ${file.title}`}
          className={`focus-ring grid h-7 min-w-7 place-items-center rounded-lg border px-1 text-[8px] font-bold leading-none tracking-tight transition disabled:opacity-50 ${item.tone}`}
        >
          {videoBusy === item.channel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : item.short}
        </button>
      ))}
    </>
  );

  return (
    <div>
      <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
        <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] text-slate-200">{file.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-slate-600">
            <span>{file.source === 'd2l' ? 'D2L course content' : 'Content Space'}</span>
            {file.source === 'd2l' && (
              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9.5px] text-slate-500">
                not downloaded
              </span>
            )}
            {file.readByAi && (
              <span className="rounded bg-violet-500/[0.12] px-1.5 py-0.5 text-[9.5px] font-medium text-violet-200">
                read by AI
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {channelButtons}
          {file.source === 'library' ? (
            <>
              <a
                href={file.url ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10.5px] font-medium text-slate-300 transition hover:border-violet-400/30 hover:text-violet-100"
              >
                Open
              </a>
              <a
                href={file.url ?? '#'}
                download
                title="Save a copy"
                aria-label={`Download ${file.title}`}
                className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-white"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                onClick={() => void reveal()}
                title="Show in folder"
                aria-label="Show in folder"
                className="focus-ring grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-white"
              >
                <FolderSearch className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <a
                href={file.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10.5px] font-medium text-slate-300 transition hover:border-violet-400/30 hover:text-violet-100"
              >
                Open
                <ArrowUpRight className="h-3 w-3" />
              </a>
              {payload.courseId && (
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy}
                  title="Download this file to Content Space"
                  aria-label={`Download ${file.title} to Content Space`}
                  className="focus-ring inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 text-[10.5px] font-medium text-slate-300 transition hover:border-violet-400/30 hover:text-violet-100 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{busy ? 'Saving' : 'Download'}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {(video || videoError) && (
        <div
          role={videoError ? 'alert' : 'status'}
          className={`mt-1.5 rounded-xl border px-3 py-2.5 ${
            videoError
              ? 'border-rose-400/20 bg-rose-500/[0.06]'
              : 'border-violet-400/20 bg-violet-500/[0.06]'
          }`}
        >
          {videoError ? (
            <div className="flex items-start gap-2 text-[11px] leading-relaxed text-rose-200">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <p className="flex-1">{videoError}</p>
              <button
                type="button"
                onClick={() => setVideoError(null)}
                aria-label="Dismiss video error"
                className="focus-ring grid h-5 w-5 shrink-0 place-items-center rounded text-rose-300/70 hover:bg-white/10 hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : video ? (
            <>
              <div className="flex items-center gap-1.5">
                <span
                  className={`grid h-5 min-w-5 place-items-center rounded px-1 text-[7px] font-bold tracking-tight ${
                    video.channel === '3blue1brown'
                      ? 'bg-sky-500/20 text-sky-200'
                      : 'bg-emerald-500/20 text-emerald-200'
                  }`}
                >
                  {VIDEO_CHANNELS.find((item) => item.channel === video.channel)?.short}
                </span>
                <p className="text-[10.5px] font-medium text-slate-300">{video.channelName}</p>
                <span className="rounded-full bg-violet-500/[0.14] px-1.5 py-0.5 text-[9px] font-medium text-violet-200">
                  {video.fromAi ? 'AI pick' : 'Channel search'}
                </span>
                <button
                  type="button"
                  onClick={() => setVideo(null)}
                  aria-label="Close video suggestion"
                  className="focus-ring ml-auto grid h-5 w-5 place-items-center rounded text-slate-500 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <p className="mt-1.5 text-[12px] font-medium text-slate-100">{video.title}</p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">{video.reason}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a
                  href={video.url}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex items-center gap-1 rounded-lg border border-violet-400/25 bg-violet-500/[0.12] px-2.5 py-1 text-[10.5px] font-medium text-violet-100 transition hover:border-violet-300/45 hover:bg-violet-500/[0.2]"
                >
                  Watch on YouTube
                  <ArrowUpRight className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={() => void findVideo(video.channel)}
                  disabled={videoBusy !== null}
                  className="focus-ring rounded-lg border border-white/[0.08] px-2.5 py-1 text-[10.5px] text-slate-400 transition hover:border-white/20 hover:text-white disabled:opacity-50"
                >
                  Ask for another
                </button>
                <span className="text-[9.5px] text-slate-600">opens this channel's search</span>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function StudyView({
  events,
  courses,
  ai,
  onRefresh,
  onOpenSettings,
}: StudyViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [payload, setPayload] = useState<StudyPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFile, setSavedFile] = useState<string | null>(null);
  const [courseLinks, setCourseLinks] = useState<Record<string, string>>(readCourseLinks);
  // Only the newest plan request may write state, so switching assessments
  // mid-request cannot show the previous one's plan.
  const requestRef = useRef(0);

  // An exam stays here through its own day, then drops off; the nearest one
  // is always first and becomes the top-priority card below.
  const upcoming = useMemo(() => upcomingAssessments(events), [events]);

  useEffect(() => {
    if (selectedId && !upcoming.some((event) => event.id === selectedId)) {
      setSelectedId(null);
      setPayload(null);
    }
  }, [selectedId, upcoming]);

  const selected = upcoming.find((event) => event.id === selectedId) ?? null;
  const linkedCourseFor = (event: CalendarEvent): Course | null =>
    courses.find((course) => course.id === courseLinks[event.id]) ?? null;
  const selectedCourse = selected
    ? courseFor(selected, courses) ?? linkedCourseFor(selected)
    : null;

  const loadPlan = async (
    event: CalendarEvent,
    refresh = false,
    courseOverride: Course | null = null,
  ) => {
    const course = courseOverride ?? courseFor(event, courses) ?? linkedCourseFor(event);
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    setSavedFile(null);
    try {
      const result = await buildStudyPlan({
        title: event.title,
        courseCode: course?.code ?? event.courseCode ?? null,
        courseName: course?.name ?? null,
        startsAt: event.startsAt,
        courseId: course?.id ?? null,
        refresh,
      });
      if (request !== requestRef.current) return;
      setPayload(result);
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err instanceof Error ? err.message : 'Could not build that study plan.');
      setPayload(null);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };

  const choose = (event: CalendarEvent) => {
    setSelectedId(event.id);
    setPayload(null);
    setError(null);
    void loadPlan(event);
  };

  const linkCourse = (course: Course) => {
    if (!selected) return;
    const next = { ...courseLinks, [selected.id]: course.id };
    setCourseLinks(next);
    try {
      window.localStorage.setItem(COURSE_LINKS_KEY, JSON.stringify(next));
    } catch {
      // A locked-down browser profile still gets the link for this session.
    }
    setPayload(null);
    setError(null);
    void loadPlan(selected, false, course);
  };

  // The nearest deadline is the priority: show its plan without making the
  // student pick it again every time Study opens.
  useEffect(() => {
    if (!selectedId && upcoming.length > 0) choose(upcoming[0]);
  }, [selectedId, upcoming]);

  const plan = payload?.plan ?? null;
  const nextUp = upcoming[0] ?? null;
  const tone = selected ? urgencyStyles(urgencyFor(selected.startsAt)) : null;
  const contentHref = courseContentUrl(selectedCourse);
  const linkedCourses = teachingCourses(courses);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[19px] font-semibold tracking-tight text-white">Study</h2>
          <p className="mt-1 text-[12.5px] text-slate-500">
            Pick a quiz, midterm or assignment — Study turns your outline and files into a plan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 text-[11px] text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            <Sparkles className="h-3.5 w-3.5 text-violet-300" />
            {ai?.configured ? 'AI settings' : 'Connect API key'}
          </button>
        </div>
      </div>

      {ai && !ai.configured && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-400/20 bg-violet-500/[0.07] px-4 py-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/[0.14] text-violet-300 ring-1 ring-inset ring-violet-400/25">
            <KeyRound className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-violet-100">Connect your Gemini API key</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-400">
              Study builds a plan from your outline without one. With a key, the AI reads your course
              files and writes the plan for this assessment. OpenAI and Claude keys work too.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="focus-ring shrink-0 rounded-lg border border-violet-400/30 bg-violet-500/[0.14] px-3 py-1.5 text-[11.5px] font-medium text-violet-100 transition hover:border-violet-300/50 hover:bg-violet-500/[0.22] hover:text-white"
          >
            Connect Gemini API key
          </button>
        </div>
      )}

      {ai?.configured && ai.allowCourseFiles && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3.5 py-2.5 text-[11.5px] text-amber-100/85">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <p className="leading-relaxed">
            File reading is on. When you build a plan, the text of up to a few lecture files is sent to your AI
            provider ({ai.provider}). Turn it off in Settings → AI to send file names only.
          </p>
        </div>
      )}

      {nextUp && (
        <button
          type="button"
          onClick={() => choose(nextUp)}
          className="focus-ring group relative w-full overflow-hidden rounded-2xl border border-rose-400/25 bg-gradient-to-br from-rose-500/[0.14] via-violet-500/[0.08] to-transparent px-4 py-3.5 text-left transition hover:border-rose-300/40 hover:from-rose-500/[0.2]"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-rose-100 ring-1 ring-inset ring-rose-400/30">
              Top priority
            </span>
            <span className="text-[10.5px] text-rose-200/80">
              {relativeLabel(nextUp.startsAt)} · {timeLabel(nextUp.startsAt)}
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-rose-100/90">
              {nextUp.id === selectedId ? 'Showing below' : 'Open study plan'}
              <ArrowUpRight className="h-3 w-3" />
            </span>
          </div>
          <h3 className="mt-2 font-display text-[18px] font-semibold leading-snug text-white">
            {nextUp.title}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-rose-100/60">
            {(courseFor(nextUp, courses) ?? linkedCourseFor(nextUp))?.name ??
              nextUp.courseCode ??
              'No course linked'} ·{' '}
            {shortDateParts(nextUp.startsAt).weekday} {shortDateParts(nextUp.startsAt).month}{' '}
            {shortDateParts(nextUp.startsAt).day}
          </p>
        </button>
      )}

      {upcoming.length === 0 ? (
        <div className="panel grid place-items-center px-6 py-16 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.04] text-slate-500 ring-1 ring-inset ring-white/[0.07]">
            <BookOpenCheck className="h-5 w-5" />
          </span>
          <p className="mt-4 text-sm font-medium text-slate-300">Nothing due yet</p>
          <p className="mt-1 max-w-sm text-[12px] text-slate-600">
            Once your calendar has a quiz, midterm or assignment, it appears here with a plan.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-2">
            {upcoming.map((event) => {
              const date = shortDateParts(event.startsAt);
              const active = event.id === selectedId;
              const course = courseFor(event, courses) ?? linkedCourseFor(event);
              const rowTone = urgencyStyles(urgencyFor(event.startsAt));
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => choose(event)}
                  className={`focus-ring w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    active
                      ? 'border-violet-400/40 bg-violet-500/[0.1]'
                      : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="grid w-9 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.04] py-1 leading-none">
                      <span className="text-[8.5px] font-semibold tracking-[0.1em] text-slate-500">
                        {date.month}
                      </span>
                      <span className="mt-0.5 font-display text-[15px] font-semibold text-slate-100">
                        {date.day}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[12.5px] font-medium ${rowTone.title}`}>{event.title}</p>
                      <p className="mt-0.5 truncate text-[10.5px] text-slate-500">
                        {courseShortCode(event.courseCode) || course?.code || 'No course'} ·{' '}
                        {timeLabel(event.startsAt)} · {relativeLabel(event.startsAt)}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="min-w-0">
            {!selected ? (
              <div className="panel grid h-full min-h-[260px] place-items-center px-6 py-12 text-center">
                <div>
                  <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-violet-500/[0.1] text-violet-300 ring-1 ring-inset ring-violet-400/20">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <p className="mt-3 text-[13px] font-medium text-slate-300">Choose an assessment</p>
                  <p className="mt-1 max-w-[320px] text-[11.5px] leading-relaxed text-slate-600">
                    Study uses the outline's chapters and your course files to say what to review, what to
                    practise, and what to bring.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="panel px-4 py-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
                        {selectedCourse?.name ?? payload?.courseName ?? selected.courseCode ?? 'Assessment'}
                      </p>
                      <h3 className={`mt-1 font-display text-[17px] font-semibold leading-snug ${tone?.title ?? 'text-white'}`}>
                        {selected.title}
                      </h3>
                      <p className="mt-1 text-[11.5px] text-slate-500">
                        {shortDateParts(selected.startsAt).weekday} · {timeLabel(selected.startsAt)} ·{' '}
                        {relativeLabel(selected.startsAt)}
                        {payload?.outlineFileName ? ` · Outline: ${payload.outlineFileName}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {payload?.planSource === 'local' && (
                        <span
                          title="Built from your outline and file names — no AI used"
                          className="rounded-full bg-emerald-500/[0.12] px-2 py-1 text-[10px] font-medium text-emerald-200/90"
                        >
                          Local plan
                        </span>
                      )}
                      {payload?.generatedAt && (
                        <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] text-slate-500">
                          {payload.cached ? 'Saved plan' : 'New plan'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void loadPlan(selected, true)}
                        disabled={loading}
                        className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-500/[0.1] px-2.5 py-1.5 text-[11.5px] font-medium text-violet-100 transition hover:border-violet-400/40 hover:bg-violet-500/[0.16] disabled:opacity-50"
                      >
                        {loading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : payload?.plan ? (
                          <RefreshCw className="h-3.5 w-3.5" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {payload?.plan ? 'Rebuild' : 'Build study plan'}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2.5 text-[12px] text-rose-200">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <p className="leading-relaxed">{error}</p>
                    </div>
                  )}

                </div>

                {loading && !payload && (
                  <div className="panel grid place-items-center px-6 py-14 text-center">
                    <Loader2 className="h-5 w-5 animate-spin text-violet-300" />
                    <p className="mt-3 text-[13px] font-medium text-slate-200">Building your study plan…</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {ai?.configured
                        ? ai.allowCourseFiles
                          ? 'Using your outline, file names and the text of your files'
                          : 'Using your outline and file names'
                        : 'Using the outline and file names on this computer — no AI key needed'}
                    </p>
                  </div>
                )}

                {payload && !plan && !loading && (
                  <div className="panel px-4 py-4">
                    <p className="text-[12px] text-slate-400">
                      No plan could be built yet. Add the course or import its outline, then rebuild.
                    </p>
                  </div>
                )}

                {payload && payload.notes.length > 0 && (
                  <div className="space-y-1.5">
                    {payload.notes.map((note) => (
                      <p
                        key={note}
                        className="flex items-start gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] px-3 py-2 text-[11px] leading-relaxed text-amber-100/80"
                      >
                        <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-300/80" />
                        {note}
                      </p>
                    ))}
                  </div>
                )}

                {payload && plan && (
                  <>
                    {plan.overview && (
                      <section className="panel px-4 py-3.5">
                        <p className="text-[12.5px] leading-relaxed text-slate-300">{plan.overview}</p>
                      </section>
                    )}

                    {payload.announcements.length > 0 && (
                      <section className="panel overflow-hidden">
                        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
                          <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            Coverage from announcements
                          </h4>
                          <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-slate-500">
                            {payload.announcements.length}
                          </span>
                        </div>
                        <div className="divide-y divide-white/[0.055]">
                          {payload.announcements.map((announcement) => (
                            <a
                              key={announcement.id}
                              href={announcement.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block px-4 py-3 transition hover:bg-white/[0.03]"
                            >
                              <p className="flex items-center gap-1.5 text-[12px] font-medium text-slate-200">
                                {announcement.title}
                                <ArrowUpRight className="h-3 w-3 shrink-0 text-slate-600" />
                              </p>
                              {announcement.publishedAt && (
                                <p className="mt-0.5 text-[10px] text-slate-600">
                                  {new Date(announcement.publishedAt).toLocaleDateString('en-CA', {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </p>
                              )}
                              {announcement.text && (
                                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                                  {announcement.text}
                                </p>
                              )}
                            </a>
                          ))}
                        </div>
                      </section>
                    )}

                    {plan.focus.length > 0 && (
                      <section className="panel overflow-hidden">
                        <h4 className="border-b border-white/[0.06] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          What to review
                        </h4>
                        <div className="divide-y divide-white/[0.055]">
                          {plan.focus.map((item, index) => (
                            <div key={`${item.topic}-${index}`} className="px-4 py-3">
                              <p className="text-[12.5px] font-medium text-slate-100">{item.topic}</p>
                              {item.detail && (
                                <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">{item.detail}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {plan.checklist.length > 0 && (
                      <section className="panel px-4 py-3.5">
                        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Checklist
                        </h4>
                        <ul className="mt-2 space-y-1.5">
                          {plan.checklist.map((item) => (
                            <li key={item} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-300">
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {plan.bookPractice.length > 0 && (
                      <section className="panel px-4 py-3.5">
                        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          From the book
                        </h4>
                        <div className="mt-2 space-y-3">
                          {plan.bookPractice.map((item, index) => (
                            <div key={`${item.source}-${index}`}>
                              <p className="text-[12px] font-medium text-slate-200">{item.source}</p>
                              {item.problems.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  {item.problems.map((problem) => (
                                    <span
                                      key={problem}
                                      className="rounded-lg border border-white/[0.07] bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300"
                                    >
                                      {problem}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {plan.practice.length > 0 && (
                      <section className="panel px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            Practice questions
                          </h4>
                          <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-slate-500">
                            {plan.practice.length}
                          </span>
                          <span className="ml-auto text-[10px] text-slate-600">Tap to reveal the answer</span>
                        </div>
                        <div className="mt-2.5 space-y-2">
                          {plan.practice.map((question, index) => (
                            <QuestionCard key={`${index}-${question.question}`} question={question} index={index} />
                          ))}
                        </div>
                      </section>
                    )}

                  </>
                )}

                {payload && (
                  <section className="panel px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Files for this assessment
                      </h4>
                      <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-slate-500">
                        {payload.files.length}
                      </span>
                      {contentHref && (
                        <a
                          href={contentHref}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring ml-auto inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10.5px] font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
                        >
                          Course content
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-slate-600">
                      D2L files appear here before you save them. <span className="text-slate-400">Download</span>{' '}
                      adds one to Content Space; <span className="text-sky-300/80">3B1B</span> or{' '}
                      <span className="text-emerald-300/80">OCT</span> asks your AI what to watch for it.
                    </p>

                    {!selectedCourse && linkedCourses.length > 0 && (
                      <div className="mt-2.5 rounded-xl border border-violet-400/20 bg-violet-500/[0.05] px-3 py-2.5">
                        <label
                          htmlFor="study-course-link"
                          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-200/80"
                        >
                          <Link2 className="h-3 w-3" />
                          Link this assessment to a course
                        </label>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                          This event has no course code. Pick its course to list the D2L files you can study and
                          download.
                        </p>
                        <select
                          id="study-course-link"
                          value=""
                          onChange={(change) => {
                            const course = courses.find((item) => item.id === change.target.value);
                            if (course) linkCourse(course);
                          }}
                          className="focus-ring mt-2 h-9 w-full rounded-lg border border-white/[0.08] bg-[var(--chrome-solid)] px-2.5 text-[12px] text-slate-200"
                        >
                          <option value="">Choose a course…</option>
                          {linkedCourses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.code ? `${course.code} · ` : ''}
                              {course.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {savedFile && (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-200/80">
                        <CheckCircle2 className="h-3 w-3" />
                        “{savedFile}” is now in Content Space.
                      </p>
                    )}

                    {payload.files.length > 0 ? (
                      <div className="mt-2.5 space-y-1.5">
                        {payload.files.map((file) => (
                          <FileRow
                            key={`${file.source}-${file.id}`}
                            file={file}
                            payload={payload}
                            onSaved={(original, saved) => {
                              setSavedFile(original.title);
                              setPayload((current) =>
                                current
                                  ? {
                                      ...current,
                                      files: current.files.map((item) =>
                                        item.id === original.id
                                          ? {
                                              id: saved.id,
                                              title: saved.title || original.title,
                                              type: saved.mime,
                                              source: 'library' as const,
                                              url: `/api/library/file/${saved.id}`,
                                              canOpen: true,
                                              folder: saved.folder,
                                              readByAi: item.readByAi,
                                            }
                                          : item,
                                      ),
                                    }
                                  : current,
                              );
                              onRefresh();
                            }}
                            onError={(message) => setError(message)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-3">
                        <p className="text-[11.5px] leading-relaxed text-slate-500">
                          {selectedCourse
                            ? 'No files are saved and D2L did not return a downloadable file list for this course. Open the course content to find the lectures, or add a PDF in Content Space and rebuild.'
                            : linkedCourses.length > 0
                              ? 'No files are saved for this assessment yet. Link it to a course above to list that course’s D2L files and download them.'
                              : 'No files are saved for this assessment yet. Add a course or connect D2L to see its content here.'}
                        </p>
                        {contentHref && (
                          <a
                            href={contentHref}
                            target="_blank"
                            rel="noreferrer"
                            className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-violet-400/30 hover:text-violet-100"
                          >
                            Open course content in D2L
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {payload?.readByAi && payload.readByAi.length > 0 && (
                  <p className="px-1 text-[10.5px] leading-relaxed text-slate-600">
                    The AI read: {payload.readByAi.join(' · ')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
