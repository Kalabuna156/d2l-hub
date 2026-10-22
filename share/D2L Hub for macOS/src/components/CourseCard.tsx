import { ChevronRight, Award, ClipboardList, FileText, MessageSquare } from 'lucide-react';
import { describeCourse, themeForSubject } from '../../shared/categorize';
import type { Course } from '../../shared/types';

interface CourseCardProps {
  course: Course;
  index?: number;
  /** Sample tiles have no real org unit ids, so they must not link anywhere. */
  preview?: boolean;
  /** Opens the in-app course page; D2L stays the fallback for new tabs. */
  onOpen?: (course: Course) => void;
}

function quickLinks(course: Course) {
  const base = course.url.replace(/\/d2l\/home\/.*$/, '');
  return [
    { label: 'Content', icon: FileText, href: `${base}/d2l/le/content/${course.id}/Home` },
    {
      label: 'Assignments',
      icon: ClipboardList,
      href: `${base}/d2l/lms/dropbox/user/folders_list.d2l?ou=${course.id}`,
    },
    { label: 'Grades', icon: Award, href: `${base}/d2l/lms/grades/my_grades/main.d2l?ou=${course.id}` },
    { label: 'Discussions', icon: MessageSquare, href: `${base}/d2l/le/${course.id}/discussions/List` },
  ];
}

export function CourseCard({ course, index = 0, preview = false, onOpen }: CourseCardProps) {
  const info = describeCourse(course);
  const theme = themeForSubject(info.subject);
  const href = preview ? undefined : course.url;
  const openInApp = (event: { preventDefault: () => void }) => {
    if (preview || !onOpen) return;
    event.preventDefault();
    onOpen(course);
  };

  return (
    <article
      className="animate-rise group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[color-mix(in_srgb,var(--chrome-solid)_90%,transparent)] transition duration-200 hover:-translate-y-0.5 hover:border-white/[0.16] hover:shadow-[0_18px_40px_-24px_rgba(109,94,252,0.7)]"
      style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
    >
      <a
        href={href}
        target={preview ? undefined : '_blank'}
        rel={preview ? undefined : 'noreferrer'}
        aria-hidden={preview || undefined}
        tabIndex={preview ? -1 : undefined}
        onClick={openInApp}
        className="focus-ring block"
      >
        <div
          className="relative h-[86px] overflow-hidden"
          style={{ backgroundImage: `linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 100%)` }}
        >
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 18% 20%, rgba(255,255,255,0.55), transparent 42%), linear-gradient(120deg, transparent 45%, rgba(0,0,0,0.28) 100%)',
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          />
          <span className="absolute bottom-1 right-3 select-none font-display text-[38px] font-black leading-none tracking-tight text-white/20">
            {info.initials}
          </span>
          <span className="absolute left-3 top-3 rounded-full bg-black/25 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur-sm">
            {info.kind === 'course' ? 'Course' : 'Resource'}
          </span>
          {course.imageUrl && (
            <img
              src={course.imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-45 mix-blend-luminosity"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          )}
        </div>
      </a>

      <div className="flex flex-1 flex-col p-3.5">
        <p className="truncate font-mono text-[10.5px] uppercase tracking-[0.08em] text-slate-500" title={course.code}>
          {course.code || 'D2L'}
        </p>
        <a
          href={href}
          target={preview ? undefined : '_blank'}
          rel={preview ? undefined : 'noreferrer'}
          tabIndex={preview ? -1 : undefined}
          onClick={openInApp}
          className="focus-ring mt-1.5 line-clamp-2 text-[13.5px] font-semibold leading-snug text-slate-100 transition group-hover:text-white"
          title={course.name}
        >
          {course.name}
        </a>
        <p className="mt-1 text-[11px] text-slate-500">
          {info.subjectLabel}
          {info.number ? ` · ${info.number}` : ''} · {info.termLabel}
        </p>

        <div className="mt-3 flex items-center gap-1 border-t border-white/[0.06] pt-2.5">
          {quickLinks(course).map((link) => {
            const Icon = link.icon;
            return (
              <a
                key={link.label}
                href={preview ? undefined : link.href}
                target={preview ? undefined : '_blank'}
                rel={preview ? undefined : 'noreferrer'}
                tabIndex={preview ? -1 : undefined}
                title={preview ? 'Connect D2L to open this' : link.label}
                aria-label={preview ? link.label : `Open ${link.label} in D2L`}
                aria-disabled={preview || undefined}
                className={`focus-ring grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition ${
                  preview ? 'opacity-40' : 'hover:bg-white/[0.08] hover:text-slate-100'
                }`}
              >
                <Icon className="h-[15px] w-[15px]" strokeWidth={1.8} />
              </a>
            );
          })}
          {preview ? (
            <span
              className="ml-auto rounded-lg px-1.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-slate-600"
              title="Connect your D2L account to open the real course"
            >
              Sample
            </span>
          ) : (
            <a
              href={course.url}
              target="_blank"
              rel="noreferrer"
              onClick={openInApp}
              aria-label={`Open ${course.name}`}
              className="focus-ring ml-auto flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/[0.08] hover:text-white"
            >
              View
              <ChevronRight className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
