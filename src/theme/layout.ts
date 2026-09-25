import { useWindowDimensions } from 'react-native';

/**
 * Layout tokens.
 *
 * Every gap, radius and minimum touch target in the app comes from here, so a
 * screen cannot drift into its own idea of spacing. Eight-point rhythm, because
 * that is what a phone's pixels divide into without looking accidental.
 */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/**
 * Content stops growing past this and centres instead.
 *
 * A customer app is read on a phone, but it is also read on a folded phone in
 * landscape and on a tablet in a shop. Left alone, a full-width card on a tablet
 * stretches a line of text to a length nobody can read comfortably.
 */
export const CONTENT_MAX_WIDTH = 720;

/** Below this, two columns stop being two columns. */
export const COMPACT_WIDTH = 360;
export const WIDE_WIDTH = 600;

/** Nobody can reliably hit a target smaller than this with a thumb. */
export const MIN_TAP_TARGET = 48;

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

export interface AppLayout {
  width: number;
  height: number;
  /** Small enough that side-by-side content has to stack. */
  isCompact: boolean;
  /** Room for a two-column layout without cramping. */
  isWide: boolean;
  /** How many tiles fit in a row at this width. */
  columns: 1 | 2;
  /** Horizontal screen padding, which tightens on small phones. */
  gutter: number;
}

export function useLayout(): AppLayout {
  const { width, height } = useWindowDimensions();
  const gutter = width < COMPACT_WIDTH ? spacing.lg : spacing.xl;
  return {
    width,
    height,
    isCompact: width < COMPACT_WIDTH,
    isWide: width >= WIDE_WIDTH,
    columns: width >= WIDE_WIDTH ? 2 : 1,
    gutter,
  };
}
