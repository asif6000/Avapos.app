import type { ExpoConfig, ConfigContext } from 'expo/config';

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
    primaryColor: '#0B6B5B',
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'io.paymently.srabontelecom',
    },
    android: {
      package: 'io.paymently.srabontelecom',
      predictiveBackGestureEnabled: false,
      adaptiveIcon: {
        backgroundColor: '#0B6B5B',
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
          backgroundColor: '#0B6B5B',
        },
      ],
      'expo-secure-store',
      'expo-web-browser',
      'expo-localization',
      [
        'expo-notifications',
        {
          icon: './assets/android-icon-foreground.png',
          color: '#0B6B5B',
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
