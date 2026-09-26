import configFactory from '../app.config';
import type { ConfigContext } from 'expo/config';
import { palette } from '@/theme/theme';
import brand from '@/theme/brand.json';

/**
 * The colours a customer sees *around* the app, and the ones inside it.
 *
 * The splash screen, the adaptive icon, the notification LED and the header are
 * painted by two different pieces of code: `app.config.ts` at build time, and the
 * theme at runtime. They shipped teal for months after the app turned blue,
 * because nothing compared them — a customer opened the app from a teal splash
 * and could not tell where the brand ended.
 *
 * This is the cheapest place to catch that, because it is the only place the two
 * meet. Note what is *not* asserted: the icon PNGs in `assets/` are images and
 * are not checked here, so recolouring the brand means regenerating them too.
 */

// The config is a function of its context, and reads nothing from it: the test
// supplies the shape and no values, so what is asserted is the committed file and
// not anything a build would have injected.
const config = configFactory({ config: {} } as unknown as ConfigContext);

describe('the native config and the app theme', () => {
  it('agrees on the primary colour', () => {
    expect(config.primaryColor).toBe(palette.primary);
    expect(config.primaryColor).toBe(brand.primary);
  });

  it('paints the splash and the icon background from the page colour', () => {
    const splash = config.plugins?.find(
      (plugin): plugin is [string, { backgroundColor?: string }] =>
        Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    );
    const adaptive = config.android?.adaptiveIcon;

    expect(splash?.[1].backgroundColor).toBe(palette.surfaceLight);
    expect(adaptive?.backgroundColor).toBe(palette.surfaceLight);
  });

  it('uses the primary for the notification channel, not a colour of its own', () => {
    const notifications = config.plugins?.find(
      (plugin): plugin is [string, { color?: string }] =>
        Array.isArray(plugin) && plugin[0] === 'expo-notifications',
    );

    expect(notifications?.[1].color).toBe(palette.primary);
  });

  it('leaves no teal behind in the build config', () => {
    // The old brand hue, named directly, so this fails loudly rather than
    // becoming a comment nobody reads.
    expect(JSON.stringify(config)).not.toContain('0B6B5B');
  });

  it('states a versionCode, because EAS will not invent one', () => {
    // `appVersionSource: "local"` means an absent versionCode is a silent 1 for
    // every build ever made, which is how two APKs become indistinguishable.
    expect(typeof config.android?.versionCode).toBe('number');
  });

  it('keeps the package name, which is the identity on a phone', () => {
    // Changing this makes a *different* app, and the old one has to be
    // uninstalled first — the same install wall, for a different reason.
    expect(config.android?.package).toBe('io.paymently.srabontelecom');
    expect(config.ios?.bundleIdentifier).toBe('io.paymently.srabontelecom');
  });
});
