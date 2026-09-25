import { StyleSheet, View } from 'react-native';
import { Button, ProgressBar, Text, useTheme } from 'react-native-paper';

import { useTranslation } from '@/hooks/useTheme';

interface AmountProgressProps {
  paid: number;
  total: number;
  label?: string;
}

export function AmountProgress({ paid, total, label }: AmountProgressProps) {
  const theme = useTheme();
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

export function PrimaryAction({
  label,
  onPress,
  disabled,
  loading,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}) {
  return (
    <Button
      mode="contained"
      onPress={onPress}
      disabled={disabled || loading}
      loading={loading}
      testID={testID}
      contentStyle={styles.buttonContent}
      style={styles.button}
    >
      {label}
    </Button>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  bar: { height: 8, borderRadius: 999 },
  button: { borderRadius: 999 },
  buttonContent: { height: 52 },
});
