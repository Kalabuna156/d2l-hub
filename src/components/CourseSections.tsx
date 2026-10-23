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
        <p className="text-[13px] text-ink-2">{emptyMessage}</p>
        <p className="mt-1 text-[11.5px] text-ink-4">Try clearing the search or picking another category.</p>
      </div>
    );
  }

  let offset = 0;
  return (
    <div className="space-y-7">
      {groups.map((group) => {
        const start = offset;
        offset += group.courses.length;
        return (
          <section key={group.key}>
            <div className="mb-3 flex items-center gap-2.5">
              <h2 className="font-display text-[13px] font-semibold tracking-[-0.015em] text-ink-1">{group.label}</h2>
              <span className="chip font-mono tabular-nums">{group.courses.length}</span>
              <div className="ml-0.5 h-px flex-1 bg-gradient-to-r from-white/[0.09] to-transparent" />
              <span className="text-[9.5px] font-medium uppercase tracking-[0.16em] text-ink-4">{group.hint}</span>
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
