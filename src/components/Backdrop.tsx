import type { Preferences } from '../../shared/types';

interface BackdropProps {
  preferences: Preferences;
}

/**
 * Fixed page backdrop: colour and glows come from the active backdrop preset in
 * index.css, with an optional user image behind a dimming layer.
 */
export function Backdrop({ preferences }: BackdropProps) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {preferences.backgroundImage && (
        <>
          <img
            src={preferences.backgroundImage}
            alt=""
            aria-hidden="true"
            className="backdrop-image absolute inset-0 h-full w-full object-cover"
          />
          {/* Scrim follows the backdrop colour, so the image reads in every
              theme and the sidebar/top bar glass shows it too. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--bg-base) 42%, transparent), color-mix(in srgb, var(--bg-base) 76%, transparent))',
            }}
          />
        </>
      )}
      <div
        className="absolute -left-40 -top-48 h-[460px] w-[460px] rounded-full blur-[130px]"
        style={{ backgroundColor: 'var(--glow-1)' }}
      />
      <div
        className="absolute right-[-10%] top-[28%] h-[420px] w-[420px] rounded-full blur-[130px]"
        style={{ backgroundColor: 'var(--glow-2)' }}
      />
      <div
        className="absolute bottom-[-10%] left-[30%] h-[360px] w-[360px] rounded-full blur-[130px]"
        style={{ backgroundColor: 'var(--glow-3)' }}
      />
    </div>
  );
}
