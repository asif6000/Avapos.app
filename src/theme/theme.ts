import { MD3DarkTheme, MD3LightTheme, configureFonts, type MD3Theme } from 'react-native-paper';

import brand from './brand.json';

/**
 * One blue, used everywhere.
 *
 * The app is read by a customer who is worried about money, so the palette is a
 * single professional blue on a cool near-white page, with green reserved for
 * "paid", amber for "due" and red for "overdue". A screen of mixed brand colours
 * reads as a shop window; one hue with three state colours reads as a bank
 * statement, which is what this is.
 *
 * The three values `brand` owns are shared with `app.config.ts` — see the note
 * there — so the splash screen, the adaptive icon and the in-app header cannot
 * end up different colours.
 */
export const palette = {
  primary: brand.primary,
  primaryDark: brand.primaryDark,
  primarySoft: '#E4EDFF',
  accent: '#0EA5E9',
  success: '#15803D',
  successSoft: '#DCFCE7',
  danger: '#D92D20',
  dangerSoft: '#FDE7E6',
  warning: '#B45309',
  warningSoft: '#FDF0DC',
  info: brand.primary,
  infoSoft: '#E4EDFF',
  /** Page background: cool, not grey, so the white cards sit on it. */
  surfaceLight: brand.surface,
  surfaceDark: '#0A1220',
} as const;

/**
 * State colours MD3 has no slot for.
 *
 * `success` is not the brand colour. A paid installment and an active device are
 * two different facts, and both want green; borrowing `primaryContainer` for
 * "paid" made a paid row look like a selected tab.
 */
export interface StatusColors {
  success: string;
  onSuccess: string;
  successContainer: string;
  onSuccessContainer: string;
}

export type AppTheme = Omit<MD3Theme, 'colors'> & { colors: MD3Theme['colors'] & StatusColors };

const fontConfig = {
  fontFamily: 'System',
};

export const fonts = configureFonts({
  config: {
    ...fontConfig,
  },
  isV3: true,
});

export const lightTheme: AppTheme = {
  ...MD3LightTheme,
  roundness: 4,
  fonts,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.primary,
    onPrimary: '#FFFFFF',
    primaryContainer: palette.primarySoft,
    onPrimaryContainer: palette.primaryDark,
    secondary: palette.warning,
    onSecondary: '#FFFFFF',
    secondaryContainer: palette.warningSoft,
    onSecondaryContainer: '#8A4708',
    tertiary: palette.accent,
    onTertiary: '#FFFFFF',
    tertiaryContainer: palette.infoSoft,
    onTertiaryContainer: palette.primaryDark,
    error: palette.danger,
    onError: '#FFFFFF',
    errorContainer: palette.dangerSoft,
    onErrorContainer: '#9A1B12',
    success: palette.success,
    onSuccess: '#FFFFFF',
    successContainer: palette.successSoft,
    onSuccessContainer: '#166534',
    surface: '#FFFFFF',
    onSurface: '#0B1A33',
    surfaceVariant: '#EDF2FA',
    onSurfaceVariant: '#5A6B85',
    background: palette.surfaceLight,
    onBackground: '#0B1A33',
    outline: '#8FA1BC',
    outlineVariant: '#E2E9F4',
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level0: 'transparent',
      level1: '#F6F9FE',
      level2: '#F1F5FB',
      level3: '#ECF2FA',
      level4: '#E9F0FA',
      level5: '#E4EDF8',
    },
  },
};

export const darkTheme: AppTheme = {
  ...MD3DarkTheme,
  roundness: 4,
  fonts,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#6C9BFF',
    onPrimary: '#08183C',
    primaryContainer: '#1B3A8F',
    onPrimaryContainer: '#D8E5FF',
    secondary: '#F5B14C',
    onSecondary: '#3B2503',
    secondaryContainer: '#6B3F0B',
    onSecondaryContainer: '#FFE6C2',
    tertiary: '#38BDF8',
    onTertiary: '#04283A',
    tertiaryContainer: '#0C4A6E',
    onTertiaryContainer: '#CDEBFB',
    error: '#F97066',
    onError: '#450A0A',
    errorContainer: '#7A1B14',
    onErrorContainer: '#FFDAD5',
    success: '#4ADE80',
    onSuccess: '#052E16',
    successContainer: '#14532D',
    onSuccessContainer: '#BBF7D0',
    surface: '#111C31',
    onSurface: '#E8EEF9',
    surfaceVariant: '#1A2740',
    onSurfaceVariant: '#A3B3CC',
    background: palette.surfaceDark,
    onBackground: '#E8EEF9',
    outline: '#64748B',
    outlineVariant: '#26344D',
  },
};

export type ThemePreference = 'system' | 'light' | 'dark';
