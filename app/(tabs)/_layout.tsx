import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';

import { AppIcon } from '@/components/AppIcon';
import { useTranslation } from '@/hooks/useTheme';

const TAB_BAR_HEIGHT = 62;

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  /**
   * Plain icons, blue when active and grey when not. An earlier version drew a
   * tinted disc behind the active tab, which competed with the badges and
   * highlights inside the screens above it; the bar is a wayfinding device, and
   * the only thing it has to say is where you are.
   */
  const tabIcon = (name: string) =>
    function TabIcon({ color }: { color: ColorValue }) {
      return <AppIcon name={name} size={23} color={color} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outlineVariant,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarItemStyle: { paddingVertical: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('nav.home'), tabBarIcon: tabIcon('home-variant-outline') }}
      />
      <Tabs.Screen
        name="installments"
        options={{ title: t('nav.installments'), tabBarIcon: tabIcon('calendar-clock') }}
      />
      <Tabs.Screen
        name="device"
        options={{ title: t('nav.device'), tabBarIcon: tabIcon('cellphone') }}
      />
      <Tabs.Screen
        name="payments"
        options={{ title: t('nav.payments'), tabBarIcon: tabIcon('credit-card-outline') }}
      />
      <Tabs.Screen
        name="support"
        options={{ title: t('nav.support'), tabBarIcon: tabIcon('lifebuoy') }}
      />
    </Tabs>
  );
}
