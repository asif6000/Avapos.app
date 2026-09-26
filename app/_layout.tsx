import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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

export default function RootLayout() {
  const { theme, isDark } = useAppTheme();
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const hydrate = usePreferencesStore((state) => state.hydrate);
  const bootstrapped = useRef(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void bootstrap();
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
  useEffect(
    () => startNetworkWatcher(() => void queryClient.invalidateQueries()),
    [],
  );

  useEffect(() => {
    void registerBackgroundSync();
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;

    void registerForPushNotifications();

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
  );
}
