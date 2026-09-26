import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { logRequestStart, logResponse } from '@/api/devLog';
import { queryClient } from '@/api/queryClient';
import { useSyncDevice } from '@/hooks/queries';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/store/networkStore';

/**
 * Tells the server what this phone is, once, as soon as there is a session to
 * tell it with.
 *
 * WHY IT IS AUTOMATIC
 *
 * The store sells a phone and the customer's app is the only thing on it that
 * knows the handset's real model, Android version and install identity. Without
 * this, an operator looking at that customer in the panel is looking at a
 * `DEMO` row that was typed into a seeder — the panel marks those rows as demo
 * precisely so nobody mistakes one for a real device, which means the alternative
 * to syncing is a panel full of rows nobody can act on.
 *
 * So it happens on its own, without a customer pressing "Sync now", and it
 * happens again after a restart, a fresh install, or a new sign-in.
 *
 * WHAT IT STILL CANNOT DO
 *
 * It grants nothing. This is the phone speaking first and the server answering
 * second: the report is model, manufacturer, Android version, API level, the
 * install's non-sensitive `androidId`, and what Android reports about management
 * status — none of which decides anything. `state`, `contract_id` and access are
 * absent from the request by construction (`CustomerDeviceController::sync()`),
 * so a handset cannot mark itself paid, unlocked or enrolled, and a phone that
 * claims to be enrolled has still not thereby been enrolled.
 *
 * `syncDeviceStatus()` returns null rather than throwing, so a customer who opens
 * the app on a train sees their account, not a failed screen. The Device tab's
 * "Sync now" button is still there for the case where the first attempt failed.
 */
export function useAutoDeviceSync(): void {
  const status = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.profile?.userId ?? null);
  const online = useNetworkStore((state) => state.online);
  const sync = useSyncDevice();

  // Keyed on the signed-in user, so a sign-out and a sign-in re-arms it and the
  // next customer's phone reports on its first authenticated frame.
  const doneFor = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !userId) {
      doneFor.current = null;
      return;
    }
    if (doneFor.current === userId) return;
    // Not while offline: there is nothing to report to, and firing anyway would
    // burn a request and log a failure for a phone behaving correctly.
    if (!online) return;

    doneFor.current = userId;
    logRequestStart({
      method: 'POST',
      url: 'devices/me/sync',
      requestId: 'auto-device-sync',
    });
    void sync
      .mutateAsync()
      .then((result) => {
        logResponse({
          method: 'POST',
          url: 'devices/me/sync',
          requestId: 'auto-device-sync',
          status: result ? 200 : 404,
          kind: result ? 'ok' : 'not_found',
          durationMs: 0,
          payload: result ? { deviceState: result.deviceState } : { message: 'no phone linked' },
        });
      })
      .catch((error: unknown) => {
        // Already counted as an attempt, so the panel eventually gets this phone
        // on the next launch rather than in a retry loop against a dead network.
        logResponse({
          method: 'POST',
          url: 'devices/me/sync',
          requestId: 'auto-device-sync',
          status: 0,
          kind: 'network',
          durationMs: 0,
          payload: { message: error instanceof Error ? error.message : 'unknown' },
        });
      });
  }, [status, userId, online, sync]);
}

/**
 * Keeps the app's server state current while it is being looked at.
 *
 * WHY THIS IS A REFETCH AND NOT A SUBSCRIPTION
 *
 * A push channel is the right answer and it is not available yet: it rides on
 * Supabase Realtime, and a realtime channel is only as private as the RLS policies
 * on this project are. Those are not applied — the publishable key can currently
 * read every table it should not — so anything subscribed to a channel would be
 * handed every customer's rows, live. Shipping that would be worse than shipping
 * nothing, so this refetches instead, over endpoints that authorize every single
 * read.
 *
 * WHAT IT COSTS AND WHY IT IS BOUNDED
 *
 * One dashboard read per interval, and only while the app is in the foreground:
 *
 * - it stops the moment the app is backgrounded, because a customer's phone is
 *   not a server and a financing app has no business draining a battery to
 *   re-read a balance nobody is looking at;
 * - it does nothing while offline, and `refetchOnReconnect` already covers the
 *   moment the connection returns;
 * - it refetches immediately on returning to the foreground, so the first thing
 *   a customer sees after unlocking their phone is current rather than what it
 *   was when they left.
 *
 * This is what makes a staff action in the panel — releasing a phone, a payment
 * settling, a ticket answered — appear in the customer's app without them
 * touching anything. It is the same arrangement `useLiveResource` gives the
 * panel, reading the same rows, and it is why the panel can say when it last
 * checked and this can too.
 */
const LIVE_INTERVAL_MS = 15_000;

export function useLiveSync(): void {
  const status = useAuthStore((state) => state.status);
  const online = useNetworkStore((state) => state.online);

  useEffect(() => {
    if (status !== 'authenticated' || !online) return undefined;

    const tick = () => {
      void queryClient.invalidateQueries({ queryKey: ['customer', 'dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['device'] });
    };

    const timer = setInterval(tick, LIVE_INTERVAL_MS);

    // Foreground, not background. `active` covers iOS's "inactive" step, where a
    // control centre or a call is over the app and the user cannot see a refresh.
    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') tick();
    };
    const subscription = AppState.addEventListener('change', onAppState);

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [status, online]);
}
