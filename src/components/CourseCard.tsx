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
      className="animate-rise group relative flex flex-col overflow-hidden rounded-[15px] border border-line shadow-[0_1px_0_rgba(255,255,255,0.05),0_20px_40px_-30px_rgba(0,0,0,0.9)] transition-[transform,border-color,box-shadow] duration-200 ease-[var(--ease-out)] hover:-translate-y-[2px] hover:border-line-strong hover:shadow-[0_1px_0_rgba(255,255,255,0.08),0_26px_50px_-28px_rgba(0,0,0,1),0_0_0_1px_color-mix(in_srgb,var(--color-violet-400)_16%,transparent)]"
      style={{
        animationDelay: `${Math.min(index, 12) * 26}ms`,
        // The body carries a whisper of the band's hue, so a card is one object
        // instead of a colour swatch glued to a grey box.
        backgroundColor: `color-mix(in oklab, ${theme.from} 7%, color-mix(in srgb, var(--chrome-solid) 72%, transparent))`,
      }}
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
          className="relative h-[78px] overflow-hidden"
          style={{
            // oklab keeps the hue's chroma when mixed into near-black; in srgb
            // the same mix drifts towards mud.
            backgroundImage: `linear-gradient(150deg, color-mix(in oklab, ${theme.from} 84%, #080a12) 0%, color-mix(in oklab, ${theme.to} 96%, #080a12) 100%)`,
          }}
        >
          {/* Light rakes across the band from the top-left, and the subject
              initials sit half-lit in the corner like a watermark. */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(120% 140% at 6% -24%, rgba(255,255,255,0.26), transparent 46%), linear-gradient(115deg, transparent 42%, rgba(0,0,0,0.46) 100%)',
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.13]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.55) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />
          {/* A dark wash keeps the subject hue as a tint, not a sticker. */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/5 to-black/60" />
          <span className="absolute -bottom-1 right-2.5 select-none font-display text-[40px] font-black leading-none tracking-[-0.04em] text-white/[0.22] [text-shadow:0_1px_0_rgba(255,255,255,0.18)]">
            {info.initials}
          </span>
          <span className="absolute left-2.5 top-2.5 rounded-full border border-white/15 bg-black/30 px-2 py-[2px] text-[8.5px] font-semibold uppercase tracking-[0.14em] text-white/90 backdrop-blur-md">
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
        <p
          className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-ink-4"
          title={course.code}
        >
          {course.code || 'D2L'}
        </p>
        <a
          href={href}
          target={preview ? undefined : '_blank'}
          rel={preview ? undefined : 'noreferrer'}
          tabIndex={preview ? -1 : undefined}
          onClick={openInApp}
          className="focus-ring mt-1.5 line-clamp-2 text-[13px] font-semibold leading-snug tracking-[-0.012em] text-ink-1 transition-colors duration-150 group-hover:text-white"
          title={course.name}
        >
          {course.name}
        </a>
        <p className="mt-1 truncate text-[10.5px] text-ink-3">
          {info.subjectLabel}
          {info.number ? ` · ${info.number}` : ''} · {info.termLabel}
        </p>

        <div className="mt-3 flex items-center gap-0.5 border-t border-line pt-2">
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
                className={`focus-ring grid h-[26px] w-[26px] place-items-center rounded-[7px] transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] ${
                  preview
                    ? 'text-ink-4 opacity-40'
                    : 'text-ink-4 hover:bg-surface-2 hover:text-ink-1 active:scale-95'
                }`}
              >
                <Icon className="h-[14.5px] w-[14.5px]" strokeWidth={1.8} />
              </a>
            );
          })}
          {preview ? (
            <span
              className="ml-auto rounded-[6px] px-1.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ink-4"
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
              className="focus-ring ml-auto flex items-center gap-0.5 rounded-[7px] px-1.5 py-1 text-[10.5px] font-medium text-ink-3 transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] hover:bg-surface-2 hover:text-ink-1 active:scale-95"
            >
              View
              <ChevronRight className="h-3 w-3 transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
