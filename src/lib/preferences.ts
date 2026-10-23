import type { AccentId, BackdropId, Preferences } from '../../shared/types';

export const DEFAULT_PREFERENCES: Preferences = {
  accent: 'violet',
  backdrop: 'aurora',
  backgroundImage: null,
  imageDim: 55,
  examBank: true,
  newOverview: true,
};

export interface AccentOption {
  id: AccentId;
  label: string;
  /** Swatch colour shown in the picker */
  swatch: string;
}

export const ACCENTS: AccentOption[] = [
  { id: 'violet', label: 'Violet', swatch: '#8b7dff' },
  { id: 'sky', label: 'Sky', swatch: '#38bdf8' },
  { id: 'emerald', label: 'Emerald', swatch: '#34d399' },
  { id: 'amber', label: 'Amber', swatch: '#fbbf24' },
  { id: 'rose', label: 'Rose', swatch: '#fb7185' },
  { id: 'fuchsia', label: 'Fuchsia', swatch: '#e879f9' },
];

export interface BackdropOption {
  id: BackdropId;
  label: string;
  hint: string;
  /** Preview gradient for the picker card */
  preview: string;
}

export const BACKDROPS: BackdropOption[] = [
  {
    id: 'aurora',
    label: 'Aurora',
    hint: 'Indigo sky, accent bloom',
    preview:
      'radial-gradient(circle at 78% 12%, #7c5cf5 0%, transparent 58%), radial-gradient(circle at 14% 86%, #0ea5e9 0%, transparent 62%), linear-gradient(176deg, #0d1022 0%, #05060b 100%)',
  },
  {
    id: 'noir',
    label: 'Noir',
    hint: 'Lit ceiling, almost black floor',
    preview: 'radial-gradient(circle at 70% 8%, #2b3040 0%, transparent 60%), linear-gradient(176deg, #0b0d12 0%, #040507 100%)',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    hint: 'Rose and amber embers',
    preview:
      'radial-gradient(circle at 76% 10%, #e11d69 0%, transparent 58%), radial-gradient(circle at 16% 84%, #d97706 0%, transparent 62%), linear-gradient(176deg, #1d0d13 0%, #0a0507 100%)',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    hint: 'Teal and deep blue',
    preview:
      'radial-gradient(circle at 74% 10%, #0d9488 0%, transparent 58%), radial-gradient(circle at 18% 82%, #2563eb 0%, transparent 62%), linear-gradient(176deg, #06121c 0%, #03060b 100%)',
  },
  {
    id: 'meadow',
    label: 'Meadow',
    hint: 'Forest green and lime',
    preview:
      'radial-gradient(circle at 76% 12%, #16a34a 0%, transparent 58%), radial-gradient(circle at 16% 84%, #65a30d 0%, transparent 62%), linear-gradient(176deg, #09150e 0%, #040805 100%)',
  },
];

/**
 * Fill in anything an older server or a hand-edited config left out, so a
 * missing key never reads as `undefined` in the UI.
 */
export function normalizePreferences(raw: Partial<Preferences> | null | undefined): Preferences {
  return { ...DEFAULT_PREFERENCES, ...(raw ?? {}) };
}

/** Paint the theme onto <html>; the CSS does the rest via data attributes. */
export function applyPreferences(preferences: Preferences): void {
  const root = document.documentElement;
  root.dataset.accent = preferences.accent;
  root.dataset.backdrop = preferences.backdrop;
  root.style.setProperty('--backdrop-image-opacity', String(preferences.imageDim / 100));
}
