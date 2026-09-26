import type { ExpoConfig, ConfigContext } from 'expo/config';

// JSON, and a relative path, on purpose. This file is evaluated by Node during
// `eas build`, outside React Native, so it cannot import a `.ts` module — Expo
// transpiles `app.config.ts` on its own and the relative `.ts` it names is not
// there to be required. A `.json` file is readable from both sides, which is
// what makes it impossible for the splash screen and the in-app header to be
// different colours. See `src/theme/theme.ts` for what the palette does with it.
import brand from './src/theme/brand.json';

/**
 * Public (non-secret) build-time configuration.
 *
 * SECURITY: only `EXPO_PUBLIC_*` values are inlined into the JS bundle. Never add
 * gateway secrets, Supabase service-role keys, admin credentials or database
 * credentials to this file. All privileged credentials live on the backend.
 */
const config = ({ config }: ConfigContext): ExpoConfig => {
  const apiBaseUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://srabontelecom.paymently.io/customer';

  // The EAS project this app builds under, `@asif26s-team/ava-pos` — the only
  // project on the account. EAS refuses a build whose `extra.eas.projectId`
  // resolves to a project with a different `slug`, so the slug below is that
  // project's and not a name of our choosing. Nothing else reads it.
  //
  // What actually identifies the app on a phone is `android.package` and
  // `scheme`, and those are unchanged: an APK built from here installs as
  // `io.paymently.srabontelecom`. What the project id decides is which account
  // holds the build, the signing credentials and the channels.
  const UNLINKED = '00000000-0000-0000-0000-000000000000';
  const projectId = process.env.EAS_PROJECT_ID ?? '43d0b5bb-580a-4c45-82ae-51e85fda545e';

  if (projectId === UNLINKED) {
    console.warn(
      '\n[eas] projectId is still the placeholder, so this build belongs to no EAS project.\n' +
        '      Run `npx eas login` then `npx eas init` once, and the real id is written to\n' +
        '      app.config.ts. A local dev build is unaffected.\n',
    );
  }

  return {
    ...config,
    name: 'Customer',
    slug: 'ava-pos',
    scheme: 'srabontelecom',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    primaryColor: brand.primary,
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'io.paymently.srabontelecom',
    },
    android: {
      package: 'io.paymently.srabontelecom',
      /**
       * Bumped for **every** build, by hand.
       *
       * `eas.json` sets `appVersionSource: "local"`, so EAS will not invent one:
       * with no value here every build since the project was created is
       * `appBuildVersion 1`, which was the case for both `1b429c11` and
       * `fe150752`. Android will still accept a same-versionCode install, so this
       * is not what broke the last install — but it makes two APKs
       * indistinguishable, and it means an older APK can never be installed over
       * a newer one (`INSTALL_FAILED_VERSION_DOWNGRADE`), which is the same
       * "app not installed" wall with the same fix: uninstall first.
       *
       * Raise it by one for each build you push.
       */
      versionCode: 6,
      predictiveBackGestureEnabled: false,
      adaptiveIcon: {
        backgroundColor: brand.surface,
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      // Only permissions that are genuinely required by a documented feature.
      permissions: [
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.VIBRATE',
        // Android Enterprise: only consulted when the device is already enrolled
        // by an enterprise DPC / device owner. Never a bypass mechanism.
        'android.permission.USE_BLUETOOTH_CONNECT',
        'android.permission.REQUEST_COMPANION_PROFILE_WATCH',
        'android.permission.REQUEST_COMPANION_RUN_IN_BACKGROUND',
        'android.permission.REQUEST_COMPANION_USE_DATA_IN_BACKGROUND',
      ],
      blockedPermissions: [
        'android.permission.BIND_ACCESSIBILITY_SERVICE',
        'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        'android.permission.MANAGE_EXTERNAL_STORAGE',
        'android.permission.REQUEST_INSTALL_PACKAGES',
        'android.permission.PACKAGE_USAGE_STATS',
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.WRITE_SETTINGS',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.READ_SMS',
        'android.permission.READ_CONTACTS',
        'android.permission.RECORD_AUDIO',
        'android.permission.CAMERA',
        'android.permission.READ_CALL_LOG',
        'android.permission.READ_EXTERNAL_STORAGE',
      ],
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            { scheme: 'https', host: 'app.srabontelecom.com', pathPrefix: '/' },
            { scheme: 'srabontelecom' },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          resizeMode: 'contain',
          backgroundColor: brand.surface,
        },
      ],
      'expo-secure-store',
      'expo-web-browser',
      'expo-localization',
      [
        'expo-notifications',
        {
          icon: './assets/android-icon-foreground.png',
          color: brand.primary,
          defaultChannel: 'customer-alerts',
        },
      ],
      [
        'expo-background-task',
        {
          minimumInterval: 15,
        },
      ],
      './plugins/withDeviceManagement',
    ],
    experiments: {
      typedRoutes: true,
      tsconfigPaths: true,
    },
    extra: {
      apiBaseUrl,
      eas: {
        projectId,
      },
    },
  } satisfies ExpoConfig;
};

export default config;
