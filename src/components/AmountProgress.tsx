import { StyleSheet, View } from 'react-native';
import { ProgressBar, Text, useTheme } from 'react-native-paper';

import { useTranslation } from '@/hooks/useTheme';
import type { AppTheme } from '@/theme/theme';

interface AmountProgressProps {
  paid: number;
  total: number;
  label?: string;
}

export function AmountProgress({ paid, total, label }: AmountProgressProps) {
  const theme = useTheme<AppTheme>();
  const { t } = useTranslation();
  const ratio = total > 0 ? Math.max(0, Math.min(1, paid / total)) : 0;

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.labels}>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {label ?? t('installments.paid')}
        </Text>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurface }}>
          {Math.round(ratio * 100)}%
        </Text>
      </View>
      <ProgressBar
        progress={ratio}
        color={theme.colors.primary}
        style={styles.bar}
        accessibilityLabel={`${label ?? t('installments.paid')} ${Math.round(ratio * 100)}%`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  bar: { height: 8, borderRadius: 999 },
});
