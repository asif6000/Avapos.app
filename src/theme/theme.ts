import { MD3DarkTheme, MD3LightTheme, configureFonts, type MD3Theme } from 'react-native-paper';

export const palette = {
  primary: '#0B6B5B',
  primaryDark: '#075146',
  accent: '#F2A007',
  danger: '#C62828',
  success: '#2E7D32',
  warning: '#ED6C02',
  info: '#1565C0',
  surfaceLight: '#F6F8F8',
  surfaceDark: '#101414',
} as const;

const fontConfig = {
  fontFamily: 'System',
};

export const fonts = configureFonts({
  config: {
    ...fontConfig,
  },
  isV3: true,
});

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: 3,
  fonts,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.primary,
    onPrimary: '#FFFFFF',
    primaryContainer: '#CDEFE7',
    onPrimaryContainer: palette.primaryDark,
    secondary: palette.accent,
    onSecondary: '#241A00',
    secondaryContainer: '#FFE6B0',
    onSecondaryContainer: '#4A3500',
    error: palette.danger,
    onError: '#FFFFFF',
    errorContainer: '#FFDAD6',
    onErrorContainer: '#410002',
    surface: '#FFFFFF',
    onSurface: '#131918',
    surfaceVariant: '#E4EDEA',
    onSurfaceVariant: '#3F4947',
    background: palette.surfaceLight,
    onBackground: '#131918',
    outline: '#6F7977',
    outlineVariant: '#BEC9C6',
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  roundness: 3,
  fonts,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#6DDBC5',
    onPrimary: '#00382F',
    primaryContainer: '#005143',
    onPrimaryContainer: '#8AF8E1',
    secondary: '#FFD180',
    onSecondary: '#3F2E00',
    secondaryContainer: '#5B4300',
    onSecondaryContainer: '#FFE6B0',
    error: '#FFB4AB',
    onError: '#690005',
    errorContainer: '#93000A',
    onErrorContainer: '#FFDAD6',
    surface: palette.surfaceDark,
    onSurface: '#E1E3E1',
    surfaceVariant: '#3F4947',
    onSurfaceVariant: '#BEC9C6',
    background: '#0A0F0E',
    onBackground: '#E1E3E1',
    outline: '#899391',
    outlineVariant: '#3F4947',
  },
};

export type ThemePreference = 'system' | 'light' | 'dark';
