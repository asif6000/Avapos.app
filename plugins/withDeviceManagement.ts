import {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  type ConfigPlugin,
} from '@expo/config-plugins';

const PACKAGE = 'io.paymently.srabontelecom';

type UsesPermission = {
  $?: Record<string, string | number | boolean | undefined> & {
    'android:name'?: string;
  };
};

type RootManifest = {
  'uses-permission'?: UsesPermission[];
  'uses-permission-sdk-23'?: UsesPermission[];
};

/**
 * Permissions this app is allowed to declare. Anything outside this list is
 * stripped from the generated AndroidManifest.xml.
 *
 * The app is a customer app for a financed phone. It has no legitimate need for
 * accessibility, notification-listener, overlay, usage-stats, install-unknown-
 * apps, external-storage or location permissions. Enforcing the list at prebuild
 * time also stops a transitive config plugin from quietly adding one.
 */
const ALLOWED_PERMISSIONS = new Set([
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.VIBRATE',
  'android.permission.USE_BLUETOOTH_CONNECT',
  'android.permission.REQUEST_COMPANION_PROFILE_WATCH',
  'android.permission.REQUEST_COMPANION_RUN_IN_BACKGROUND',
  'android.permission.REQUEST_COMPANION_USE_DATA_IN_BACKGROUND',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.WAKE_LOCK',
]);

/**
 * withDeviceManagement
 *
 * Two jobs:
 *
 * 1. Lock the manifest down to `ALLOWED_PERMISSIONS`, so no plugin can introduce
 *    an accessibility service, overlay, usage-stats or install permission.
 * 2. Keep the device-management capability read-only. Android only grants device
 *    owner / profile owner status to an app that an enterprise DPC (test harness,
 *    fully-managed device) or the user has explicitly provisioned. A customer app
 *    installed from a store can never obtain it, and the app must not try. The
 *    Kotlin module in `modules/srabon-device-management` therefore only *reports*
 *    what Android reports, and this plugin deliberately adds no device-admin
 *    receiver, no lock/wipe code, and no permission that would imply otherwise.
 */
const withDeviceManagement: ConfigPlugin = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    const root = manifest as unknown as RootManifest;

    const declared = [...(root['uses-permission'] ?? []), ...(root['uses-permission-sdk-23'] ?? [])];
    const kept = declared.filter((permission) => {
      const name = permission.$?.['android:name'];
      return name === undefined || ALLOWED_PERMISSIONS.has(name);
    });

    if (kept.length !== declared.length) {
      root['uses-permission'] = kept.filter((permission) =>
        !permission.$?.['android:maxSdkVersion'],
      );
      root['uses-permission-sdk-23'] = kept.filter((permission) =>
        permission.$?.['android:maxSdkVersion'],
      );
    }

    // `allowBackup=false` keeps app data out of cloud backups.
    application.$['android:allowBackup'] = 'false';
    application.$['android:fullBackupContent'] = 'false';

    return mod;
  });

export default createRunOncePlugin(withDeviceManagement, PACKAGE, '1.0.0');
