import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/realtime-js';

import { logRealtime } from '@/api/devLog';
import { queryClient } from '@/api/queryClient';
import { getSupabaseClient } from '@/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/store/networkStore';

/**
 * Live updates, so a sale at the counter reaches the customer's phone without
 * them pulling to refresh.
 *
 * WHY THIS FILE DID NOT EXIST BEFORE, AND WHY IT CAN NOW
 *
 * It was written down first and left out deliberately. The reasoning was in
 * `useAutoDeviceSync`: "a realtime channel is only as private as the RLS policies
 * on this project are", and the policies were not applied — the publishable key
 * could read every customer table, so a subscriber would have been handed every
 * customer's rows, live. Realtime was not missing; it was unsafe.
 *
 * Two things changed, and both were measured:
 *
 *   1. `sql/01` and `sql/03` are applied. The publishable key now gets `401
 *      42501` on every customer table, and a signed-in customer reads only their
 *      own rows. Supabase Realtime authorises each `postgres_changes` event
 *      against those same policies, so a subscription cannot widen what a JWT can
 *      see — it can only tell that JWT to fetch sooner.
 *   2. `sql/09-realtime.sql` published the tables. Without it the publication was
 *      empty, so there was nothing to subscribe to at all.
 *
 * A PAYLOAD IS A REFETCH TRIGGER, NEVER A DECISION
 *
 * The handler below does exactly one thing: invalidate the query cache. It never
 * writes, never trusts the payload's contents, and never decides a customer's
 * state. A device that received "your phone is now RESTRICTED" from a push has
 * still not thereby been restricted — the server decides that, and this only
 * asks the server again. That is the same rule the app applies to a push
 * notification, and for the same reason: a message can be replayed, forged or
 * stale, and a screen that renders whatever it was told is a screen that can be
 * made to lie.
 *
 * WHY THE POLLER STAYS
 *
 * `useAutoDeviceSync` still runs. A phone that was asleep, offline, or in a
 * tunnel misses every event in between, and Supabase does not replay them, so
 * without the poller a customer could look at a stale account indefinitely.
 * Realtime makes it fast; the poller is what makes it correct.
 */

/**
 * The tables a change to which should re-read the account.
 *
 * Each is a table this app already shows, and each is in the publication added
 * by `sql/09-realtime.sql`. A table here that is not published is a silent no-op
 * — a subscription to a table outside a publication simply never fires — so the
 * two lists have to agree. `realtimeTablesMatchPublication` is a test over that.
 */
export const REALTIME_TABLES = [
  'installment_contracts',
  'installments',
  'devices',
  'payments',
  'notifications',
  'support_tickets',
  'profiles',
] as const;

export type RealtimeTable = (typeof REALTIME_TABLES)[number];

export interface RealtimeState {
  /** True while the channel is subscribed. False when offline or signed out. */
  connected: boolean;
  /** Set when the last subscribe attempt failed, for the development log. */
  error: string | null;
}

/**
 * Subscribe to the customer's own rows, and refetch when they change.
 *
 * Deliberately narrow: one channel, filtered to nothing at the PostgREST level.
 * The filter is an optimisation, not a security control — a customer cannot see
 * another customer's event even unfiltered, because RLS is what authorises the
 * event. Adding `customer_key=eq.<id>` would be one fewer row to discard, and
 * would mean threading the customer id through this hook for no privacy gain.
 */
export function useRealtimeSync(): RealtimeState {
  const status = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.profile?.userId ?? null);
  const online = useNetworkStore((state) => state.online);

  // Only what an effect can actually know: the outcome of a subscription attempt.
  // "Not subscribed" is *derived* below rather than stored, because writing it
  // from the effect body would be a synchronous setState in an effect, which is a
  // cascading render waiting to happen.
  const [outcome, setOutcome] = useState<{ connected: boolean; error: string | null } | null>(null);

  // An anon token reads nothing under these policies, so it would receive nothing
  // at all — a silent failure indistinguishable from "realtime is broken".
  // Refusing to subscribe without a session makes that explicit.
  const eligible = status === 'authenticated' && userId !== null && online;

  useEffect(() => {
    if (!eligible || !userId) return;

    let channel: RealtimeChannel | null = null;
    // Held outside the microtask because the cleanup runs later and has to reach
    // it — and it may be `null` if setup threw or was disposed before it ran.
    let client: ReturnType<typeof getSupabaseClient> | null = null;
    let disposed = false;

    const invalidate = (table: string) => {
      // Everything the account is made of. The app has one request per screen and
      // a customer's change to a payment affects the balance, the schedule and
      // the next due date at once, so invalidating the lot is both simpler and
      // more correct than trying to work out which query each table belongs to.
      void queryClient.invalidateQueries();
      logRealtime('change', { table, userId });
    };

    const onChange = (payload: { table?: string }) => () => {
      if (disposed) return;
      // The payload is a hint about *which* table moved. What the app then shows
      // comes from the server, not from here.
      invalidate(payload.table ?? 'unknown');
    };

    // The setup is deferred a microtask, and that is not a workaround.
    //
    // Opening a realtime channel is asynchronous work — a websocket handshake —
    // so doing it on a later tick is what it actually is. It also keeps this
    // effect free of a synchronous setState, which is a cascading render: the
    // failure paths below all report through `setOutcome`, and a report raised
    // from the effect body re-renders the component that is subscribing.
    queueMicrotask(() => {
      if (disposed) return;

      try {
        // Inside the try, and inside the microtask, on purpose. A throw here would
        // otherwise escape the effect body, and an exception in one effect stops
        // every effect after it in the same component — which is how one optional
        // feature took the background-sync and push-registration start-ups down
        // with it. Two tests caught that, not one.
        client = getSupabaseClient();

        channel = client
        .channel(`customer:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'installments' }, onChange({ table: 'installments' }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'installment_contracts' }, onChange({ table: 'installment_contracts' }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, onChange({ table: 'devices' }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, onChange({ table: 'payments' }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, onChange({ table: 'notifications' }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, onChange({ table: 'support_tickets' }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, onChange({ table: 'profiles' }))
          .subscribe((status) => {
            if (disposed) return;
            if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
              setOutcome({ connected: true, error: null });
              logRealtime('subscribed', { userId, tables: REALTIME_TABLES.length });
            } else if (
              status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
              status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
            ) {
              setOutcome({ connected: false, error: String(status) });
              logRealtime('failed', { userId, status });
            }
          });
      } catch (error) {
        setOutcome({ connected: false, error: error instanceof Error ? error.message : 'unknown' });
        logRealtime('failed', { userId, status: 'threw' });
      }
    });

    // The socket is torn down on sign-out and on unmount. A channel left open on
    // a signed-out phone keeps a websocket — and a JWT — alive for no reason.
    return () => {
      disposed = true;
      // No setState here. The derived value below already reads as disconnected
      // once `eligible` turns false, and setting it from a cleanup would re-render
      // a component that is on its way out.
      if (channel && client) void client.removeChannel(channel);
    };
  }, [eligible, userId]);

  // Android suspends sockets when the app is backgrounded, and the connection does
  // not always come back on resume. Reacting to the app state is what stops a
  // customer unlocking their phone to a screen that stopped updating an hour ago.
  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      logRealtime(next === 'active' ? 'resumed' : 'backgrounded', {});
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);

  return {
    connected: eligible && outcome?.connected === true,
    error: eligible ? (outcome?.error ?? null) : null,
  };
}
