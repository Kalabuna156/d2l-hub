import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Award, ExternalLink, RefreshCw } from 'lucide-react';
import type { CourseGrades, GradeItem } from '../../shared/types';
import { fetchCourseGrades } from '../lib/api';

interface CourseGradesPanelProps {
  courseId: string;
  refreshToken: number;
}

function gradeTone(grade: string | null): string {
  const percent = grade ? Number(/(\d+(?:\.\d+)?)\s*%/.exec(grade)?.[1]) : Number.NaN;
  if (!Number.isFinite(percent)) {
    return 'text-slate-400 bg-white/[0.05] ring-white/10';
  }
  if (percent >= 80) return 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/20';
  if (percent >= 60) return 'text-sky-300 bg-sky-400/10 ring-sky-400/20';
  if (percent >= 50) return 'text-amber-300 bg-amber-400/10 ring-amber-400/20';
  return 'text-rose-300 bg-rose-400/10 ring-rose-400/20';
}

function GradeRow({ item }: { item: GradeItem }) {
  const isGroup = item.kind === 'group';
  return (
    <li
      className={`flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.03] ${
        isGroup ? 'bg-white/[0.02]' : ''
      }`}
      style={{ paddingLeft: `${1 + (isGroup ? 0 : Math.min(item.depth, 3) * 1.1)}rem` }}
    >
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-[12.5px] ${
            isGroup ? 'font-semibold text-slate-100' : 'font-medium text-slate-300'
          }`}
          title={item.name}
        >
          {item.name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-slate-500">
          {item.achieved && <span className="font-mono">{item.achieved}</span>}
          {item.achieved && item.comment && <span className="text-slate-700">·</span>}
          {item.comment && <span className="truncate">{item.comment}</span>}
          {!item.achieved && !item.comment && <span>Not graded yet</span>}
        </p>
      </div>

      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${item.name} in D2L`}
          className="focus-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-600 transition hover:bg-white/[0.08] hover:text-slate-200"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}

      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${gradeTone(item.grade)}`}
      >
        {item.grade ?? '—'}
      </span>
    </li>
  );
}

export function CourseGradesPanel({ courseId, refreshToken }: CourseGradesPanelProps) {
  const [grades, setGrades] = useState<CourseGrades | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGrades(await fetchCourseGrades(courseId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load grades.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  if (loading) {
    return (
      <div className="panel overflow-hidden">
        <div className="h-12 animate-pulse border-b border-white/[0.06] bg-white/[0.02]" />
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="h-11 animate-pulse rounded-lg bg-white/[0.03]" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !grades) {
    return (
      <div className="panel mx-auto max-w-md px-6 py-10 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-400/20">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h3 className="mt-4 font-display text-base font-semibold text-white">Couldn’t load grades</h3>
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

  const items = grades?.items ?? [];
  const graded = items.filter((item) => item.grade && item.grade !== '—').length;

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
          <Award className="h-3.5 w-3.5" />
        </span>
        <h3 className="font-display text-[13px] font-semibold text-slate-100">Grades</h3>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-slate-400">
          {items.length}
        </span>
        {items.length > 0 && (
          <span className="hidden text-[10.5px] uppercase tracking-[0.12em] text-slate-600 sm:inline">
            {graded} graded
          </span>
        )}
        {grades?.gradesUrl && (
          <a
            href={grades.gradesUrl}
            target="_blank"
            rel="noreferrer"
            className="focus-ring ml-auto inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            Open in D2L
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-[13px] text-slate-400">No grade items are visible yet.</p>
          <p className="mt-1 text-[11.5px] text-slate-600">
            Once D2L publishes a grade, it appears here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.055]">
          {items.map((item) => (
            <GradeRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      <p className="border-t border-white/[0.06] px-4 py-2.5 text-[10.5px] text-slate-600">
        Read from D2L’s gradebook page. Final grades and feedback stay in D2L.
      </p>
    </section>
  );
}
