import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { declaresBindDeviceAdmin, declaresReceiver } from '../plugins/withDeviceManagement';

/**
 * The device-admin declaration, checked at the only point where it is checkable.
 *
 * The receiver and `BIND_DEVICE_ADMIN` live in the module's *library* manifest and
 * reach the app through Gradle's manifest merger, long after `expo prebuild`. A
 * prebuild-time assertion against the generated app manifest therefore could never
 * pass, and when one was written that way it took every native build down with an
 * "Unknown error. See logs of the Prebuild build phase" that reads like a corrupt
 * toolchain.
 *
 * So the invariants are asserted here, against the file that actually declares
 * them. This is the check that catches the failure the plugin's own comment is
 * about: the permission quietly disappearing, and an unenrollable phone reporting
 * itself as simply "not managed".
 */

const MODULE_MANIFEST = join(
  __dirname,
  '..',
  'modules',
  'srabon-device-management',
  'android',
  'src',
  'main',
  'AndroidManifest.xml',
);

describe('the device-admin library manifest', () => {
  const xml = readFileSync(MODULE_MANIFEST, 'utf8');

  it('declares the receiver', () => {
    expect(declaresReceiver(xml)).toBe(true);
  });

  it('declares the permission that receiver needs to ever be enabled', () => {
    expect(declaresBindDeviceAdmin(xml)).toBe(true);
  });

  it('exports the activity Android sends the provisioning intent to', () => {
    expect(xml).toContain('SrabonProvisioningActivity');
    expect(xml).toContain('android.app.action.PROVISIONING_DEVICE_ADMIN');
  });

  it('keeps the device_admin policy metadata the receiver is recognised by', () => {
    expect(xml).toContain('android.app.device_admin');
  });
});

describe('the checks themselves', () => {
  it('fail when the receiver is renamed away', () => {
    // The exact shape of a careless rename: the class is still there, under a
    // name no other code refers to.
    expect(declaresReceiver(xmlWith('SrabonDeviceAdminReceiver2'))).toBe(false);
  });

  it('fail when the permission is removed from the receiver', () => {
    expect(declaresBindDeviceAdmin(xmlWith(null))).toBe(false);
  });

  it('do not mistake a commented-out declaration for a real one', () => {
    // The failure this exists to catch is somebody disabling the receiver in the
    // source. A plain substring search would happily accept the commented-out
    // version, which is why the predicates strip comments first.
    const commented = [
      '<manifest>',
      '  <!-- <receiver android:name="io.paymently.srabontelecom.devicemanagement.SrabonDeviceAdminReceiver" /> -->',
      '  <!-- <uses-permission android:name="android.permission.BIND_DEVICE_ADMIN" /> -->',
      '</manifest>',
    ].join('\n');

    expect(commented).toContain('SrabonDeviceAdminReceiver');
    expect(declaresReceiver(commented)).toBe(false);
    expect(declaresBindDeviceAdmin(commented)).toBe(false);
  });
});

/** The real manifest, with one name swapped, so the predicates get a real input. */
function xmlWith(replacement: string | null): string {
  const xml = readFileSync(MODULE_MANIFEST, 'utf8');
  const stripped = replacement === null
    ? xml.replace(/^\s*<uses-permission android:name="android\.permission\.BIND_DEVICE_ADMIN" \/>$/m, '')
    : xml.replaceAll('SrabonDeviceAdminReceiver', replacement);
  return stripped;
}
