import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { useTheme } from 'react-native-paper';

import { AppIcon } from '@/components/AppIcon';
import { useTranslation } from '@/hooks/useTheme';

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outlineVariant,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.home'),
          tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => (
            <AppIcon name="home-variant" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="installments"
        options={{
          title: t('nav.installments'),
          tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => (
            <AppIcon name="calendar-clock" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="device"
        options={{
          title: t('nav.device'),
          tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => (
            <AppIcon name="cellphone" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: t('nav.payments'),
          tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => (
            <AppIcon name="credit-card-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: t('nav.support'),
          tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => (
            <AppIcon name="help-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
