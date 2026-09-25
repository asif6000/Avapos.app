import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { useTranslation } from '@/hooks/useTheme';
import { AppIcon } from './AppIcon';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: { icon: string; label: string; onPress: () => void };
}

export function AppHeader({ title, subtitle, back = true, action }: AppHeaderProps) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {back ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={styles.iconButton}
          testID="header-back"
        >
          <AppIcon name="arrow-left" size={24} color={theme.colors.onSurface} />
        </Pressable>
      ) : null}

      <View style={styles.titles}>
        <Text variant="titleLarge" numberOfLines={1} style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={styles.iconButton}
          testID="header-action"
        >
          <AppIcon name={action.icon} size={24} color={theme.colors.onSurface} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  titles: { flex: 1, gap: 2 },
  iconButton: { padding: 4 },
});
