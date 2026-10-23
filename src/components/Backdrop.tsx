import type { Preferences } from '../../shared/types';

interface BackdropProps {
  preferences: Preferences;
}

/**
 * Fine film grain over the whole room. Large blurred gradients band badly on
 * 8-bit displays; a little noise dithers the steps away and gives the glass
 * something to sit on. 160px tile, no external asset.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

/**
 * Fixed page backdrop: colour and glows come from the active backdrop preset in
 * index.css, with an optional user image behind a dimming layer.
 *
 * The room has a lit ceiling and a dark floor, three long soft glows at
 * different depths, a whisper of grain and a vignette pulling the edges down.
 * Nothing here reads as a shape — it is light in the room, which is what the
 * glass panes above need in order to look like glass.
 */
export function Backdrop({ preferences }: BackdropProps) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Canvas: the ceiling catches light, the floor falls away. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(178deg, var(--canvas-top) 0%, var(--bg-base) 32%, var(--canvas-bottom) 100%)',
        }}
      />

      {preferences.backgroundImage && (
        <>
          <img
            src={preferences.backgroundImage}
            alt=""
            aria-hidden="true"
            className="backdrop-image absolute inset-0 h-full w-full scale-105 object-cover"
          />
          {/* Scrim follows the backdrop colour, so the image reads in every
              theme and the sidebar/top bar glass shows it too. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--bg-base) 40%, transparent), color-mix(in srgb, var(--bg-base) 78%, transparent))',
            }}
          />
        </>
      )}

      {/* Lead bloom: a wide sheet of accent light across the ceiling, so the
          top bar and the hero share one glow instead of two stamps. */}
      <div
        className="absolute left-[42%] -top-[40%] h-[620px] w-[860px] rounded-full blur-[180px]"
        style={{ backgroundColor: 'var(--glow-1)' }}
      />
      {/* Cool counterweight low on the left, so the page is not one hue. */}
      <div
        className="absolute -left-[18%] bottom-[-6%] h-[580px] w-[580px] rounded-full blur-[170px]"
        style={{ backgroundColor: 'var(--glow-2)' }}
      />
      {/* A third, smaller ember keeps the floor from going flat. */}
      <div
        className="absolute bottom-[4%] right-[-12%] h-[520px] w-[520px] rounded-full blur-[170px]"
        style={{ backgroundColor: 'var(--glow-3)' }}
      />

      <div
        className="absolute inset-0 opacity-[0.07] mix-blend-soft-light"
        style={{ backgroundImage: GRAIN, backgroundRepeat: 'repeat' }}
      />

      {/* Vignette: the room gets darker toward the walls. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(125% 95% at 50% -5%, transparent 34%, color-mix(in srgb, var(--bg-base) 66%, transparent) 100%)',
        }}
      />
      {/* A single bright edge at the very top, like light catching a glass rim. */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.16) 30%, rgb(255 255 255 / 0.16) 70%, transparent)',
        }}
      />
    </div>
  );
}
