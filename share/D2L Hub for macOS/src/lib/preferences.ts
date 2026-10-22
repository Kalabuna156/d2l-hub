import type { AccentId, BackdropId, Preferences } from '../../shared/types';

export const DEFAULT_PREFERENCES: Preferences = {
  accent: 'violet',
  backdrop: 'aurora',
  backgroundImage: null,
  imageDim: 55,
  examBank: true,
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
    hint: 'Violet and sky glows',
    preview: 'radial-gradient(circle at 20% 20%, #6d28d9 0%, transparent 60%), radial-gradient(circle at 80% 40%, #0ea5e9 0%, transparent 55%), #07080d',
  },
  {
    id: 'noir',
    label: 'Noir',
    hint: 'Almost black, no glow',
    preview: 'linear-gradient(160deg, #0b0c10 0%, #050608 100%)',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    hint: 'Warm rose and amber',
    preview: 'radial-gradient(circle at 22% 18%, #b45309 0%, transparent 58%), radial-gradient(circle at 78% 30%, #be185d 0%, transparent 55%), #120b0d',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    hint: 'Teal and deep blue',
    preview: 'radial-gradient(circle at 25% 20%, #0f766e 0%, transparent 58%), radial-gradient(circle at 75% 45%, #1d4ed8 0%, transparent 55%), #06090f',
  },
  {
    id: 'meadow',
    label: 'Meadow',
    hint: 'Green and lime',
    preview: 'radial-gradient(circle at 20% 25%, #15803d 0%, transparent 58%), radial-gradient(circle at 80% 35%, #65a30d 0%, transparent 55%), #070b07',
  },
];

/** Paint the theme onto <html>; the CSS does the rest via data attributes. */
export function applyPreferences(preferences: Preferences): void {
  const root = document.documentElement;
  root.dataset.accent = preferences.accent;
  root.dataset.backdrop = preferences.backdrop;
  root.style.setProperty('--backdrop-image-opacity', String(preferences.imageDim / 100));
}
