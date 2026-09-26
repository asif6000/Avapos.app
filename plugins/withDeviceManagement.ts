import {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  type ConfigPlugin,
} from '@expo/config-plugins';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
const BIND_DEVICE_ADMIN = 'android.permission.BIND_DEVICE_ADMIN';

/**
 * The device-admin library's own manifest, relative to the project root.
 *
 * This is the file that has to declare the receiver, and the reason the check
 * below reads it rather than the generated app manifest is the whole subtlety:
 * `expo-modules-autolinking` adds this module as a Gradle dependency, and **Gradle's
 * manifest merger** is what folds the receiver and `BIND_DEVICE_ADMIN` into the
 * app — after prebuild has finished and the APK is being assembled. The manifest
 * `expo prebuild` writes to `android/app/src/main/` therefore never contains the
 * receiver, at any point, on any machine.
 *
 * An earlier version of this plugin asserted the receiver against that generated
 * manifest. It could not pass, and it took every native build down with it: EAS
 * reported "Unknown error. See logs of the Prebuild build phase", which reads like
 * a corrupt toolchain and is nothing of the kind.
 */
const MODULE_MANIFEST = 'modules/srabon-device-management/android/src/main/AndroidManifest.xml';

/**
 * Drops XML comments before anything is matched against the file.
 *
 * A commented-out `<receiver>` is a *commented-out* receiver, and a substring
 * search does not know the difference — so a declaration that has been disabled in
 * the source would pass a check whose entire job is to notice that it was
 * disabled.
 */
function withoutComments(manifest: string): string {
  return manifest.replace(/<!--[\s\S]*?-->/g, '');
}

/** Does this library manifest declare a `<receiver>` for the device admin? */
export function declaresReceiver(manifest: string): boolean {
  return withoutComments(manifest).includes(`android:name="${RECEIVER}"`);
}

/** Does it declare the permission the receiver's own enforcement depends on? */
export function declaresBindDeviceAdmin(manifest: string): boolean {
  return withoutComments(manifest).includes(`android:name="${BIND_DEVICE_ADMIN}"`);
}

/**
 * withDeviceManagement
 *
 * Two jobs:
 *
 * 1. Lock the manifest down to `ALLOWED_PERMISSIONS`, so no plugin can introduce
 *    an accessibility service, overlay, usage-stats or install permission — and fail
 *    the build if one of the forbidden set shows up anyway.
 * 2. Verify that the device-admin receiver and its permission are actually declared
 *    by the module that supplies them.
 *
 * That second job is the one that matters here, and it exists because of what went
 * wrong the first time this list was written. The list did not contain
 * `BIND_DEVICE_ADMIN`, and the build succeeded, the app installed, the module
 * loaded, and every call was refused at runtime with `NOT_DEVICE_OWNER` on a phone
 * that was correctly provisioned. A missing capability that reports itself as
 * "this phone is not managed" is indistinguishable from a shop that never
 * provisioned anything, which is the worst possible failure for a
 * device-management feature: it looks like correct behaviour.
 *
 * So it is asserted rather than assumed, at the only point where it is still
 * checkable. If the receiver is renamed, if the module's manifest stops declaring
 * it, or if `BIND_DEVICE_ADMIN` is ever dropped from the allow-list that runs over
 * the app manifest, prebuild fails loudly instead.
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
 * Asserts the policy agent is really declared by the module that supplies it.
 *
 * Reads the library manifest rather than the generated app manifest, because
 * Gradle is what merges the two and prebuild only ever sees the app's half. The
 * failure names the receiver rather than a permission, which is the thing a person
 * debugging an unenrollable phone will go looking for.
 */
const withDeviceAdminReceiver: ConfigPlugin = (config) =>
  withAndroidManifest(config, (mod) => {
    const projectRoot = (mod as unknown as { modRequest?: { projectRoot?: string } }).modRequest
      ?.projectRoot;

    if (!projectRoot) {
      throw new Error(
        'withDeviceManagement: no project root, so the device-admin module manifest could not '
          + 'be read. This plugin has to run as a mod.',
      );
    }

    const path = join(projectRoot, MODULE_MANIFEST);
    let xml: string;
    try {
      xml = readFileSync(path, 'utf8');
    } catch {
      throw new Error(
        `withDeviceManagement: cannot read ${MODULE_MANIFEST}. Without it this app can never hold `
          + 'device-owner status, and every device command will be refused with NOT_DEVICE_OWNER — '
          + 'which looks identical to a phone the shop never provisioned.',
      );
    }

    if (!declaresReceiver(xml)) {
      throw new Error(
        `withDeviceManagement: ${RECEIVER} is missing from ${MODULE_MANIFEST}. Without it this app `
          + 'can never hold device-owner status, and every device command will be refused with '
          + 'NOT_DEVICE_OWNER — which looks identical to a phone the shop never provisioned.',
      );
    }

    if (!declaresBindDeviceAdmin(xml)) {
      throw new Error(
        `withDeviceManagement: ${MODULE_MANIFEST} does not declare ${BIND_DEVICE_ADMIN}. The `
          + 'receiver cannot ever be enabled without it.',
      );
    }

    if (!ALLOWED_PERMISSIONS.has(BIND_DEVICE_ADMIN)) {
      throw new Error(
        `withDeviceManagement: ${BIND_DEVICE_ADMIN} has been removed from ALLOWED_PERMISSIONS. `
          + 'The allow-list runs over the app manifest and the strip is what this check is guarding, '
          + 'so it has to keep the permission even though today nothing app-side declares it.',
      );
    }

    return mod;
  });

export default createRunOncePlugin(
  (config) => withDeviceAdminReceiver(withDeviceManagement(config)),
  PACKAGE,
  '1.0.0',
);
