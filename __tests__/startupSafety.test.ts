/**
 * The startup module graph must survive a native module that misbehaves.
 *
 * WHY THIS FILE EXISTS
 *
 * `jest.setup.js` mocks every native module with a healthy answer, which is what
 * you want for testing behaviour and exactly what hides this class of bug. The
 * real `expo-localization` export is `ExpoLocalization.getLocales` — the native
 * module's own function, handed to JavaScript, returning whatever the platform's
 * `Resources` layer gave it. That is `null` on some devices and it throws on
 * others, and neither happens in CI.
 *
 * WHY A THROW THERE IS FATAL
 *
 * `detectLanguage()` is not called from a screen. It runs while
 * `preferencesStore` is being evaluated (`create(...)` → `language:
 * detectLanguage()`), and `preferencesStore` is in the startup import graph:
 *
 *   app/_layout → @/hooks/useTheme → @/store/preferencesStore → @/i18n
 *
 * A throw during module evaluation happens *before* `AppRegistry.registerComponent`
 * runs. There is no React tree yet, so no error boundary exists anywhere in the
 * app that could catch it — the boundary added in `AppErrorBoundary` is itself
 * unreachable at that point. The splash screen is still up, nothing replaces it,
 * and Android kills the process. The customer sees the splash, then the app is
 * simply gone, and the reason is in logcat on a shop counter.
 *
 * These tests therefore pin the property, not the implementation: whatever the
 * platform says about the locale, this app starts.
 */

const mockGetLocales = jest.fn<unknown, []>();

jest.mock('expo-localization', () => ({
  getLocales: () => mockGetLocales(),
}));

// Imported after the mock is in place, exactly as the bundler would evaluate it.
/* eslint-disable import/first --
   `jest.mock` is hoisted above imports by babel-plugin-jest-hoist, so this
   position documents an order that actually holds at runtime: the mock is
   registered before these two modules are evaluated, which is the whole point
   of the test. Moving them to the top would not change what runs, only the
   claim this file makes. */
import { detectLanguage } from '@/i18n';
import { usePreferencesStore } from '@/store/preferencesStore';
/* eslint-enable import/first */

beforeEach(() => {
  mockGetLocales.mockReset();
  mockGetLocales.mockReturnValue([{ languageCode: 'en', languageTag: 'en-US' }]);
});

afterEach(() => {
  mockGetLocales.mockReturnValue([{ languageCode: 'en', languageTag: 'en-US' }]);
});

describe('the language the app starts in', () => {
  it('uses Bengali when the phone asks for Bengali', () => {
    mockGetLocales.mockReturnValue([{ languageCode: 'bn', languageTag: 'bn-BD' }]);

    expect(detectLanguage()).toBe('bn');
  });

  it('uses English for every other language', () => {
    mockGetLocales.mockReturnValue([{ languageCode: 'fr', languageTag: 'fr-FR' }]);

    expect(detectLanguage()).toBe('en');
  });

  it('falls back to English when the platform reports no locales at all', () => {
    // What `getLocales` actually returns on a device whose resource configuration
    // has no locale entry. Indexing this unguarded is a TypeError.
    mockGetLocales.mockReturnValue(null);

    expect(detectLanguage()).toBe('en');
  });

  it('falls back to English when the locale list is empty', () => {
    mockGetLocales.mockReturnValue([]);

    expect(detectLanguage()).toBe('en');
  });

  it('falls back to English when the native call throws', () => {
    // A missing or unloaded native module throws rather than returning nothing.
    mockGetLocales.mockImplementation(() => {
      throw new Error('ExpoLocalization.getLocales: null Expo module');
    });

    expect(detectLanguage()).toBe('en');
  });

  it('falls back to English when the first locale has no language code', () => {
    mockGetLocales.mockReturnValue([{ languageTag: 'und' }]);

    expect(detectLanguage()).toBe('en');
  });
});

describe('the preferences store', () => {
  it('is constructed even when the platform reports no locales', () => {
    // This is the import-time call. If it throws, the app never starts — so the
    // assertion is that reaching this line at all is the point.
    mockGetLocales.mockReturnValue(null);

    expect(() => jest.isolateModules(() => require('@/store/preferencesStore'))).not.toThrow();
  });

  it('is constructed even when the native locale call throws', () => {
    mockGetLocales.mockImplementation(() => {
      throw new Error('ExpoLocalization.getLocales: null Expo module');
    });

    expect(() => jest.isolateModules(() => require('@/store/preferencesStore'))).not.toThrow();
  });

  it('starts in English when the platform says nothing usable', () => {
    expect(usePreferencesStore.getState().language).toBe('en');
  });
});
