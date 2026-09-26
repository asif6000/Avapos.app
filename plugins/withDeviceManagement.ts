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
 *
 * `BIND_DEVICE_ADMIN` is the single entry that looks like power and is not. It is
 * what lets Android *ask* a user to grant device-admin rights — it grants nothing
 * by itself, it is a signature-level permission no other app can hold, and every
 * mutating call in the Kotlin agent is refused unless Android separately says this
 * app is the device owner. It is listed here because the receiver in
 * `modules/srabon-device-management` declares it in the library manifest and the
 * strip below runs over the merged result; leaving it out would delete the
 * receiver's ability to ever be enabled.
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
  'android.permission.BIND_DEVICE_ADMIN',
]);

/**
 * Permissions that must never appear, checked after the allow-list runs.
 *
 * The allow-list is the real control — anything not named is removed. This is a
 * second, louder line for the specific set that turns a device manager into a
 * surveillance tool, so that a future edit to the allow-list cannot quietly add one
 * without `npm run verify` failing and a person having to think about it.
 */
const FORBIDDEN_PERMISSIONS: ReadonlySet<string> = new Set([
  'android.permission.BIND_ACCESSIBILITY_SERVICE',
  'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
  'android.permission.BIND_VPN_SERVICE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.PACKAGE_USAGE_STATS',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.READ_SMS',
  'android.permission.READ_CONTACTS',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]);

const RECEIVER = 'io.paymently.srabontelecom.devicemanagement.SrabonDeviceAdminReceiver';

/**
 * withDeviceManagement
 *
 * Two jobs:
 *
 * 1. Lock the manifest down to `ALLOWED_PERMISSIONS`, so no plugin can introduce
 *    an accessibility service, overlay, usage-stats or install permission — and fail
 *    the build if one of the forbidden set shows up anyway.
 * 2. Verify that the device-admin receiver survived step 1.
 *
 * That second job is the one that matters here, and it exists because of what went
 * wrong the first time this list was written. The list did not contain
 * `BIND_DEVICE_ADMIN`, the strip below ran over the merged manifest, and it
 * removed the permission the policy agent needs to ever be enabled. Nothing failed:
 * the build succeeded, the app installed, the module loaded, and every call was
 * refused at runtime with `NOT_DEVICE_OWNER` on a phone that was correctly
 * provisioned. A missing capability that reports itself as "this phone is not
 * managed" is indistinguishable from a shop that never provisioned anything, which
 * is the worst possible failure for a device-management feature: it looks like
 * correct behaviour.
 *
 * So the receiver is now asserted rather than assumed. If the strip removes it, or
 * a rename breaks the name, prebuild fails loudly instead.
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

    // Second line of defence, and the one that shouts. A forbidden permission in the
    // *output* means the allow-list above is wrong, and that is a decision somebody
    // has to make deliberately.
    const present = new Set(
      (root['uses-permission'] ?? [])
        .map((permission) => permission.$?.['android:name'])
        .filter((name): name is string => typeof name === 'string'),
    );
    const offending = [...present].filter((name) => FORBIDDEN_PERMISSIONS.has(name));
    if (offending.length > 0) {
      throw new Error(
        `withDeviceManagement: refusing to build. The manifest declares ${offending.join(', ')}, `
          + 'which this app has no legitimate use for. Remove it at the source rather than '
          + 'widening ALLOWED_PERMISSIONS.',
      );
    }

    // `allowBackup=false` keeps app data out of cloud backups.
    application.$['android:allowBackup'] = 'false';
    application.$['android:fullBackupContent'] = 'false';

    return mod;
  });

/**
 * Asserts the policy agent is actually in the built manifest.
 *
 * Runs as a second, separate plugin so its failure names the receiver rather than a
 * permission, which is the thing a person debugging an unenrollable phone will go
 * looking for.
 */
const withDeviceAdminReceiver: ConfigPlugin = (config) =>
  withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const receivers = (application.receiver as Array<{ $?: { 'android:name'?: string } }> | undefined) ?? [];
    const present = receivers.some((receiver) => receiver.$?.['android:name'] === RECEIVER);

    if (!present) {
      throw new Error(
        `withDeviceManagement: ${RECEIVER} is missing from AndroidManifest.xml. Without it this `
          + 'app can never hold device-owner status, and every device command will be refused with '
          + 'NOT_DEVICE_OWNER — which looks identical to a phone the shop never provisioned. Check '
          + 'that modules/srabon-device-management/android/src/main/AndroidManifest.xml is being '
          + 'merged, and that BIND_DEVICE_ADMIN is still in ALLOWED_PERMISSIONS.',
      );
    }

    return mod;
  });

export default createRunOncePlugin(
  (config) => withDeviceAdminReceiver(withDeviceManagement(config)),
  PACKAGE,
  '1.0.0',
);
