import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { queryClient } from '@/api/queryClient';
import { useAutoDeviceSync, useLiveSync } from '@/hooks/useAutoDeviceSync';
import { useAppTheme } from '@/hooks/useTheme';
import { registerBackgroundSync } from '@/services/backgroundSync';
import {
  refreshFromNotification,
  registerForPushNotifications,
  resolveDeepLink,
} from '@/services/notifications';
import { useAuthStore } from '@/store/authStore';
import { startNetworkWatcher } from '@/store/networkStore';
import { usePreferencesStore } from '@/store/preferencesStore';

/**
 * Runs a startup task, and makes sure it cannot stop the app.
 *
 * Everything this layout does on the way up is *optional*: hydrating a theme
 * preference, validating a stored session, registering a background refresh, asking
 * for push permission, watching the network. None of it is worth a customer being
 * unable to open the app to pay an installment.
 *
 * A bare `void somePromise()` is not that guarantee. An effect body that throws
 * synchronously, or a promise that rejects with something the surrounding code
 * does not expect, takes the whole tree with it — and in a release build the
 * symptom is a splash screen followed by an app that is simply gone, with the
 * reason written to logcat where nobody reading a shop counter can see it.
 *
 * So each one is funnelled through here, and a failure is recorded rather than
 * swallowed. That is the difference between a degraded app and a mystery.
 *
 * A task that returns a teardown — the network watcher is the only one — gets it
 * passed back, because an effect that cannot return its cleanup cannot
 * unsubscribe, and a watcher that outlives its screen is a leak that only shows up
 * on a device nobody is profiling.
 */
function cannotStopTheApp(task: string, work: () => unknown): unknown {
  try {
    const result = work();
    if (result instanceof Promise) {
      result.catch((error: unknown) => {
        console.warn(`[app] startup task "${task}" failed; continuing without it`, error);
      });
      return undefined;
    }
    return result;
  } catch (error) {
    console.warn(`[app] startup task "${task}" threw; continuing without it`, error);
    return undefined;
  }
}

export default function RootLayout() {
  const { theme, isDark } = useAppTheme();
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const hydrate = usePreferencesStore((state) => state.hydrate);
  const bootstrapped = useRef(false);

  useEffect(() => {
    cannotStopTheApp('preferences.hydrate', () => hydrate());
  }, [hydrate]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    cannotStopTheApp('auth.bootstrap', () => bootstrap());
  }, [bootstrap]);

  // The phone describes itself to the server on its own — once per signed-in
  // session, and again after a restart or a fresh install. Without this the panel
  // only ever shows the `DEMO` rows the seeder wrote, which it marks as demo for
  // exactly that reason.
  useAutoDeviceSync();

  // While the app is in the foreground, keep re-reading the server so a staff
  // action in the panel reaches the customer's screen without them doing anything.
  useLiveSync();

  // Reconnecting refetches server state instead of trusting cached values.
  //
  // Guarded like the rest, and it is the one that returns a teardown, so the guard
  // has to hand one back: an effect that returns nothing cannot unsubscribe, and a
  // watcher that outlives its screen is a leak that only shows up on a device
  // nobody is profiling.
  useEffect(() => {
    // Only the network watcher has a teardown, so only this one reads it back —
    // and it is cast because a teardown is always a function in practice while the
    // guard's return type has to stay `unknown` for the tasks that return nothing.
    const teardown = cannotStopTheApp('network.watch', () =>
      startNetworkWatcher(() => {
        void queryClient.invalidateQueries().catch(() => undefined);
      }),
    );
    return typeof teardown === 'function' ? (teardown as () => void) : undefined;
  }, []);

  useEffect(() => {
    cannotStopTheApp('backgroundSync.register', () => registerBackgroundSync());
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;

    cannotStopTheApp('notifications.register', () => registerForPushNotifications());

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      // The payload is a hint only: refetch, then route to a screen that
      // re-reads authoritative state from the backend.
      void refreshFromNotification().catch(() => undefined);
      const link = resolveDeepLink(response.notification.request.content.data);
      router.push(link.screen as never);
    });

    return () => subscription.remove();
  }, [router, status]);

  return (
    // Outermost, so it also catches a failure in the providers below it. A
    // release build has no error overlay and no console anybody is watching: an
    // uncaught render error here is a splash screen and then nothing. This turns
    // that into a screen the person holding the phone can read and copy.
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <PaperProvider theme={theme}>
              <StatusBar style={isDark ? 'light' : 'dark'} />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: theme.colors.background },
                }}
              >
                {/* Only declare routes that actually exist. `device/`,
                    `installments/`, `payments/` and `support/` hold nested
                    screens only, so naming the parent throws a layout warning. */}
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="notifications/index" />
              </Stack>
            </PaperProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}
