import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { endpoints } from '@/api/endpoints';
import { queryClient } from '@/api/queryClient';
import { deviceManagementService } from './deviceManagement';
import type { AppNotification, NotificationType } from '@/types/domain';

export const NOTIFICATION_CHANNEL_ID = 'customer-alerts';

export type PushPermissionState = 'granted' | 'denied' | 'undetermined';

export interface PushTokenRegistration {
  registered: boolean;
  permission: PushPermissionState;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/**
 * Push notifications are a *hint*, never an authorization channel. A payload
 * can trigger a refetch; it can never move the UI into an unlocked, paid or
 * restored state on its own.
 */
export async function registerForPushNotifications(): Promise<PushTokenRegistration> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: 'Account alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0B6B5B',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    return { registered: false, permission: status === 'denied' ? 'denied' : 'undetermined' };
  }

  try {
    if (Platform.OS === 'android') {
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      const identity = await deviceManagementService.getIdentity();
      await endpoints.notifications.registerDevice({
        token: typeof deviceToken.data === 'string' ? deviceToken.data : '',
        platform: 'android',
        deviceId: identity.androidId || identity.appId,
      });
    } else {
      const expoToken = await Notifications.getExpoPushTokenAsync();
      const identity = await deviceManagementService.getIdentity();
      await endpoints.notifications.registerDevice({
        token: expoToken.data,
        platform: Platform.OS,
        deviceId: identity.androidId || identity.appId,
      });
    }
    return { registered: true, permission: 'granted' };
  } catch {
    return { registered: false, permission: 'granted' };
  }
}

/**
 * Pulls the authoritative state after any notification. Device state, payment
 * status and restriction status all come from the API, never the payload.
 */
export async function refreshFromNotification(): Promise<AppNotification[]> {
  const page = await endpoints.notifications.list(1).catch(() => null);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['device'] }),
    queryClient.invalidateQueries({ queryKey: ['installments'] }),
    queryClient.invalidateQueries({ queryKey: ['payments'] }),
    queryClient.invalidateQueries({ queryKey: ['customer', 'dashboard'] }),
  ]);
  return page?.items ?? [];
}

export interface NotificationDeepLink {
  screen: string;
  params?: Record<string, string>;
}

const TYPE_ROUTES: Record<NotificationType, string> = {
  INSTALLMENT_DUE_SOON: '/installments',
  PAYMENT_DUE_TODAY: '/payments/create',
  PAYMENT_OVERDUE: '/device',
  PAYMENT_SUCCESSFUL: '/payments',
  DEVICE_STATUS_CHANGED: '/device',
  DEVICE_RESTRICTION_NOTICE: '/device/restriction',
  DEVICE_ACCESS_RESTORED: '/device/restored',
  SUPPORT_RESPONSE: '/support',
  GENERAL: '/notifications',
};

function parseData(value: unknown): Record<string, string> {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
    } catch {
      return {};
    }
  }
  if (value && typeof value === 'object') return value as Record<string, string>;
  return {};
}

/**
 * Maps a notification to a destination. The mapping is advisory; the target
 * screen re-reads state from the backend before rendering anything.
 */
export function resolveDeepLink(data: unknown): NotificationDeepLink {
  const parsed = parseData(data);
  const type = parsed['type'] as NotificationType | undefined;
  const referenceId = parsed['referenceId'] ?? parsed['id'];

  if (type === 'PAYMENT_SUCCESSFUL' && referenceId) {
    return { screen: `/payments/${referenceId}`, params: { id: referenceId } };
  }
  if (type === 'DEVICE_ACCESS_RESTORED') {
    return { screen: '/device/restored' };
  }
  if (type === 'DEVICE_RESTRICTION_NOTICE') {
    return { screen: '/device/restriction' };
  }
  if (type === 'SUPPORT_RESPONSE' && referenceId) {
    return { screen: `/support/${referenceId}`, params: { id: referenceId } };
  }
  return { screen: (type && TYPE_ROUTES[type]) || '/notifications' };
}

export async function getAppVersion(): Promise<string> {
  return Application.nativeApplicationVersion ?? '1.0.0';
}

export function isPhysicalDevice(): boolean {
  return Device.isDevice;
}
