import { Platform, StyleSheet, useWindowDimensions, type ViewStyle } from 'react-native';

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

/**
 * Depth.
 *
 * A hairline border alone leaves a page of white cards looking like a form. One
 * very soft shadow under each card, and a slightly stronger one under a filled
 * button, is what makes a screen read as layered paper rather than as boxes —
 * and "very soft" is the operative word: a hard shadow is the fastest way to make
 * a clean screen look cheap. Kept here so every surface is lit from the same
 * place.
 */
function depth(y: number, blur: number, opacity: number): ViewStyle {
  if (Platform.OS === 'android') return { elevation: Math.round(opacity * 12) };
  if (Platform.OS === 'ios') {
    return {
      shadowColor: '#0B1A33',
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur,
    };
  }
  return { boxShadow: `0px ${y}px ${blur}px rgba(11, 26, 51, ${opacity})` };
}

/** Cards, banners and sheets. */
export const cardShadow = depth(4, 12, 0.06);

/** Filled buttons and anything that floats above a card. */
export const raisedShadow = depth(5, 14, 0.1);

/** The border every surface carries, so depth is not shadow alone. */
export const hairline = StyleSheet.hairlineWidth;

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
