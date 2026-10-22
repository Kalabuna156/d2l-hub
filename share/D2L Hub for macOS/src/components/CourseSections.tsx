import type { CourseGroup } from '../../shared/categorize';
import type { Course } from '../../shared/types';
import { CourseCard } from './CourseCard';

interface CourseSectionsProps {
  groups: CourseGroup[];
  emptyMessage: string;
  preview?: boolean;
  onOpen?: (course: Course) => void;
}

export function CourseSections({ groups, emptyMessage, preview = false, onOpen }: CourseSectionsProps) {
  if (groups.length === 0) {
    return (
      <div className="panel grid place-items-center px-6 py-16 text-center">
        <p className="text-sm text-slate-400">{emptyMessage}</p>
        <p className="mt-1 text-[12px] text-slate-600">Try clearing the search or picking another category.</p>
      </div>
    );
  }

  let offset = 0;
  return (
    <div className="space-y-8">
      {groups.map((group) => {
        const start = offset;
        offset += group.courses.length;
        return (
          <section key={group.key}>
            <div className="mb-3 flex items-center gap-2.5">
              <h2 className="font-display text-[13.5px] font-semibold tracking-tight text-slate-100">
                {group.label}
              </h2>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-medium text-slate-400">
                {group.courses.length}
              </span>
              <div className="ml-1 h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" />
              <span className="text-[10px] uppercase tracking-[0.16em] text-slate-600">{group.hint}</span>
            </div>
            <div className="course-grid">
              {group.courses.map((course, index) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  index={start + index}
                  preview={preview}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
