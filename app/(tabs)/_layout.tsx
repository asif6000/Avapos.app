import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'react-native-paper';

import { AppIcon } from '@/components/AppIcon';
import { useTranslation } from '@/hooks/useTheme';
import { radius } from '@/theme/layout';

const TAB_BAR_HEIGHT = 62;

export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  /**
   * The active tab gets a tinted disc behind its icon. It is the only decoration
   * in the bar, which is what stops five tabs reading as five equally-weighted
   * buttons with no sense of where the customer currently is.
   */
  const tabIcon = (name: string) =>
    function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return (
        <View
          style={[styles.iconDisc, focused && { backgroundColor: theme.colors.primaryContainer }]}
        >
          <AppIcon name={name} size={22} color={color} />
        </View>
      );
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
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

const styles = StyleSheet.create({
  iconDisc: {
    width: 46,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
