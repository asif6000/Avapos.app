import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { useNetworkStore } from '@/store/networkStore';
import { useTranslation } from '@/hooks/useTheme';

/**
 * Persistent connectivity notice. Cached, non-sensitive data stays visible, but
 * the copy is explicit that payments and status changes require a connection.
 */
export function OfflineBanner() {
  const online = useNetworkStore((state) => state.online);
  const { t } = useTranslation();
  const theme = useTheme();

  if (online) return null;

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.errorContainer }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text variant="labelMedium" style={{ color: theme.colors.onErrorContainer }}>
        {t('offline.banner')}
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer }}>
        {t('offline.actionRequired')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 8, gap: 2 },
});
