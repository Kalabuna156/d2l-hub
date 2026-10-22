import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import type { ContentModule, ContentTopic, Course, LectureStudyPayload } from '../../shared/types';
import { buildLectureStudy, downloadCourseFile, fetchCourseContent } from '../lib/api';

interface CourseContentPanelProps {
  course: Course;
  refreshToken: number;
}

function moduleCountLabel(module: ContentModule): string | null {
  if (module.total === null) return null;
  return `${module.total}`;
}

/** The plan, practice and two video picks for one lecture. */
function LectureStudyBody({ payload }: { payload: LectureStudyPayload }) {
  const plan = payload.plan;
  return (
    <div className="space-y-3">
      {payload.notes.length > 0 && (
        <div className="space-y-1.5">
          {payload.notes.map((note) => (
            <p
              key={note}
              className="flex items-start gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] px-3 py-2 text-[11px] leading-relaxed text-amber-100/80"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-300/80" />
              {note}
            </p>
          ))}
        </div>
      )}

      {!plan ? (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-5 text-center">
          <p className="text-[12px] text-slate-400">No lecture plan was generated.</p>
          <p className="mt-1 text-[11px] text-slate-600">
            The two channel links below still work.
          </p>
        </div>
      ) : (
        <>
          {plan.overview && (
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
              <p className="text-[12.5px] leading-relaxed text-slate-300">{plan.overview}</p>
            </section>
          )}

          {plan.focus.length > 0 && (
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
              <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                What to know
              </h4>
              <div className="mt-2 space-y-2.5">
                {plan.focus.map((item, index) => (
                  <div key={`${item.topic}-${index}`}>
                    <p className="text-[12px] font-medium text-slate-100">{item.topic}</p>
                    {item.detail && (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{item.detail}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {plan.checklist.length > 0 && (
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
              <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Checklist
              </h4>
              <ul className="mt-2 space-y-1.5">
                {plan.checklist.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-300"
                  >
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.bookPractice.length > 0 && (
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
              <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                From the book
              </h4>
              <div className="mt-2 space-y-2">
                {plan.bookPractice.map((item, index) => (
                  <div key={`${item.source}-${index}`}>
                    <p className="text-[11.5px] font-medium text-slate-200">{item.source}</p>
                    {item.problems.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-slate-500">{item.problems.join(' · ')}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {plan.practice.length > 0 && (
            <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
              <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Practice
              </h4>
              <div className="mt-2 space-y-1.5">
                {plan.practice.map((item, index) => (
                  <details
                    key={`${index}-${item.question}`}
                    className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2"
                  >
                    <summary className="cursor-pointer text-[11.5px] leading-relaxed text-slate-200">
                      {item.question}
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap border-t border-white/[0.06] pt-2 text-[11.5px] leading-relaxed text-slate-400">
                      {item.answer}
                    </p>
                    {item.source && (
                      <p className="mt-1 text-[10px] text-slate-600">From {item.source}</p>
                    )}
                  </details>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
        <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Watch for this lecture
        </h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {payload.videos.map((video) => (
            <a
              key={video.channel}
              href={video.url}
              target="_blank"
              rel="noreferrer"
              className="focus-ring rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 transition hover:border-violet-400/30 hover:bg-violet-500/[0.06]"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`grid h-5 min-w-5 place-items-center rounded px-1 text-[7px] font-bold tracking-tight ${
                    video.channel === '3blue1brown'
                      ? 'bg-sky-500/20 text-sky-200'
                      : 'bg-emerald-500/20 text-emerald-200'
                  }`}
                >
                  {video.channel === '3blue1brown' ? '3B1B' : 'OCT'}
                </span>
                <span className="text-[10.5px] font-medium text-slate-300">{video.channelName}</span>
                <span className="ml-auto rounded-full bg-violet-500/[0.14] px-1.5 py-0.5 text-[9px] font-medium text-violet-200">
                  {video.fromAi ? 'AI pick' : 'Channel search'}
                </span>
              </div>
              <p className="mt-1.5 text-[11.5px] font-medium text-slate-100">{video.title}</p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">{video.reason}</p>
              <span className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-medium text-violet-200">
                Watch on YouTube
                <ArrowUpRight className="h-3 w-3" />
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

export function CourseContentPanel({ course, refreshToken }: CourseContentPanelProps) {
  const courseId = course.id;
  const [modules, setModules] = useState<ContentModule[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moduleTitle, setModuleTitle] = useState<string | null>(null);
  const [topics, setTopics] = useState<ContentTopic[]>([]);
  const [contentUrl, setContentUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [topicLoading, setTopicLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<Set<string>>(() => new Set());
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [studyTopic, setStudyTopic] = useState<ContentTopic | null>(null);
  const [studyPayload, setStudyPayload] = useState<LectureStudyPayload | null>(null);
  const [studyLoading, setStudyLoading] = useState(false);
  const [studyError, setStudyError] = useState<string | null>(null);
  const studyRequest = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const content = await fetchCourseContent(courseId);
      setModules(content.modules);
      setActiveId(content.moduleId ?? content.modules[0]?.id ?? null);
      setModuleTitle(content.moduleTitle);
      setTopics(content.topics);
      setContentUrl(content.contentUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load course content.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const selectModule = async (module: ContentModule) => {
    if (module.id === activeId) return;
    setActiveId(module.id);
    setTopicLoading(true);
    setError(null);
    try {
      const content = await fetchCourseContent(courseId, module.id);
      setTopics(content.topics);
      setModuleTitle(content.moduleTitle ?? module.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that module.');
      setTopics([]);
    } finally {
      setTopicLoading(false);
    }
  };

  const activeModule = useMemo(
    () => modules.find((module) => module.id === activeId) ?? null,
    [modules, activeId],
  );

  const closeStudy = () => {
    studyRequest.current += 1;
    setStudyTopic(null);
    setStudyPayload(null);
    setStudyError(null);
    setStudyLoading(false);
  };

  const openStudy = async (topic: ContentTopic, refresh = false) => {
    const request = studyRequest.current + 1;
    studyRequest.current = request;
    setStudyTopic(topic);
    setStudyPayload(null);
    setStudyError(null);
    setStudyLoading(true);
    try {
      const result = await buildLectureStudy({
        courseId,
        courseCode: course.code || null,
        courseName: course.name,
        topicTitle: topic.title,
        topicType: topic.type,
        topicUrl: topic.url,
        moduleTitle: moduleTitle ?? activeModule?.name ?? null,
        refresh,
      });
      if (request !== studyRequest.current) return;
      setStudyPayload(result);
    } catch (err) {
      if (request !== studyRequest.current) return;
      setStudyError(err instanceof Error ? err.message : 'Could not build a plan for this lecture.');
    } finally {
      if (request === studyRequest.current) setStudyLoading(false);
    }
  };

  const download = async (topic: ContentTopic) => {
    setDownloading(topic.id);
    setDownloadError(null);
    try {
      await downloadCourseFile({
        courseId,
        courseCode: course.code || null,
        courseName: course.name,
        title: topic.title,
        url: topic.url,
        folder: moduleTitle ?? activeModule?.name ?? null,
      });
      setDownloaded((current) => new Set(current).add(topic.id));
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Could not download that file.');
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(200px,268px)_minmax(0,1fr)]">
        <div className="panel h-[320px] animate-pulse" />
        <div className="panel h-[320px] animate-pulse" />
      </div>
    );
  }

  if (error && modules.length === 0) {
    return (
      <div className="panel mx-auto max-w-md px-6 py-10 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-400/20">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h3 className="mt-4 font-display text-base font-semibold text-white">Couldn’t load content</h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="focus-ring mx-auto mt-5 flex items-center gap-2 rounded-xl bg-white/[0.08] px-3.5 py-2 text-[12.5px] font-medium text-white transition hover:bg-white/[0.13]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(200px,268px)_minmax(0,1fr)]">
      <section className="panel self-start overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-400/20">
            <FolderOpen className="h-3.5 w-3.5" />
          </span>
          <h3 className="font-display text-[13px] font-semibold text-slate-100">Modules</h3>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-slate-400">
            {modules.length}
          </span>
        </div>

        {modules.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-slate-500">
            This course has no content modules.
          </p>
        ) : (
          <ul className="max-h-[520px] overflow-y-auto py-1">
            {modules.map((module) => {
              const active = module.id === activeId;
              return (
                <li key={module.id}>
                  <button
                    type="button"
                    onClick={() => void selectModule(module)}
                    style={{ paddingLeft: `${0.75 + Math.min(module.depth, 3) * 0.85}rem` }}
                    className={`focus-ring flex w-full items-center gap-2 py-2 pr-3 text-left text-[12.5px] transition ${
                      active
                        ? 'bg-violet-500/[0.12] text-violet-100'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                    }`}
                  >
                    <span
                      className={`h-1 w-1 shrink-0 rounded-full ${active ? 'bg-violet-300' : 'bg-slate-600'}`}
                    />
                    <span className="min-w-0 flex-1 truncate" title={module.name}>
                      {module.name}
                    </span>
                    {moduleCountLabel(module) && (
                      <span
                        className="shrink-0 text-[10.5px] text-slate-600"
                        title={
                          module.remaining !== null && module.total !== null
                            ? `${module.remaining} of ${module.total} topics remaining`
                            : `${module.total} topics`
                        }
                      >
                        {moduleCountLabel(module)}
                      </span>
                    )}
                    {active && <ChevronRight className="h-3 w-3 shrink-0 text-violet-300" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/20">
            <FileText className="h-3.5 w-3.5" />
          </span>
          <h3 className="font-display text-[13px] font-semibold text-slate-100">
            {moduleTitle ?? activeModule?.name ?? 'Topics'}
          </h3>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-slate-400">
            {topics.length}
          </span>
          {contentUrl && (
            <a
              href={contentUrl}
              target="_blank"
              rel="noreferrer"
              className="focus-ring ml-auto inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
            >
              Open in D2L
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {error && modules.length > 0 && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2 text-[11.5px] text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="leading-relaxed">{error}</p>
          </div>
        )}

        {downloadError && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2 text-[11.5px] text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="flex-1 leading-relaxed">{downloadError}</p>
            <button
              type="button"
              onClick={() => setDownloadError(null)}
              className="text-[10.5px] text-rose-300/70 hover:text-rose-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {topicLoading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-14 text-[12px] text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading this module…
          </div>
        ) : topics.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[13px] text-slate-400">No topics in this module.</p>
            <p className="mt-1 text-[11.5px] text-slate-600">
              Sub-modules and files open in D2L from the module list.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.055]">
            {topics.map((topic) => {
              const isPdf = /pdf/i.test(topic.type ?? '') || /\.pdf/i.test(topic.title);
              const saved = downloaded.has(topic.id);
              return (
                <li
                  key={topic.id}
                  className="group flex items-center gap-2 px-4 py-3 transition hover:bg-white/[0.03]"
                >
                  <a
                    href={topic.url}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-ring flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-slate-500 transition group-hover:text-slate-300">
                      <FileText className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-slate-200 group-hover:text-white">
                        {topic.title}
                      </span>
                      {topic.type && (
                        <span className="mt-0.5 block text-[10.5px] text-slate-500">{topic.type}</span>
                      )}
                    </span>
                  </a>
                  <button
                    type="button"
                    onClick={() => void openStudy(topic)}
                    title="Build a study plan for this lecture"
                    aria-label={`Build a study plan for ${topic.title}`}
                    className="focus-ring inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-violet-400/20 bg-violet-500/[0.08] px-2 text-[10.5px] font-medium text-violet-200 transition hover:border-violet-300/40 hover:bg-violet-500/[0.16] hover:text-white"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Study</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void download(topic)}
                    disabled={downloading === topic.id}
                    title={
                      saved
                        ? 'Saved in Content Space'
                        : isPdf
                          ? 'Download PDF to Content Space'
                          : 'Download to Content Space'
                    }
                    aria-label={saved ? 'Saved in Content Space' : 'Download to Content Space'}
                    className={`focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition disabled:opacity-60 ${
                      saved
                        ? 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-300'
                        : 'border-transparent text-slate-600 opacity-0 hover:border-white/10 hover:bg-white/[0.07] hover:text-white focus:opacity-100 group-hover:opacity-100'
                    }`}
                  >
                    {downloading === topic.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : saved ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <a
                    href={topic.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open in D2L"
                    className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-600 transition hover:bg-white/[0.07] hover:text-slate-200"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {studyTopic && (
        <div
          className="fixed inset-0 z-[90] overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Study plan for ${studyTopic.title}`}
        >
          <div className="panel mx-auto my-4 w-full max-w-3xl overflow-hidden sm:my-8">
            <div className="flex items-start gap-3 border-b border-white/[0.06] px-5 py-4">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/[0.12] text-violet-300 ring-1 ring-inset ring-violet-400/20">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                  {course.code || 'Lecture'} · {moduleTitle ?? activeModule?.name ?? 'Content'}
                </p>
                <h3 className="mt-0.5 font-display text-[16px] font-semibold leading-snug text-white">
                  {studyTopic.title}
                </h3>
              </div>
              {studyPayload && (
                <button
                  type="button"
                  onClick={() => void openStudy(studyTopic, true)}
                  disabled={studyLoading}
                  className="focus-ring inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] px-2.5 text-[11px] font-medium text-slate-400 transition hover:border-white/20 hover:text-white disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${studyLoading ? 'animate-spin' : ''}`} />
                  Rebuild
                </button>
              )}
              <button
                type="button"
                onClick={closeStudy}
                aria-label="Close lecture study plan"
                className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[76vh] overflow-y-auto px-5 py-4">
              {studyLoading && !studyPayload ? (
                <div className="grid place-items-center py-14 text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-violet-300" />
                  <p className="mt-3 text-[13px] font-medium text-slate-200">Reading this lecture…</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Building the plan and picking a video for each channel.
                  </p>
                </div>
              ) : studyError ? (
                <div className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/[0.07] px-4 py-3 text-[12px] text-rose-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p className="leading-relaxed">{studyError}</p>
                </div>
              ) : studyPayload ? (
                <LectureStudyBody payload={studyPayload} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
