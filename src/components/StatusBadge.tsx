import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';

import type { DeviceState, PaymentStatus } from '@/types/domain';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
}

export function StatusBadge({ label, tone = 'neutral', style }: StatusBadgeProps) {
  const theme = useTheme();
  const tones: Record<BadgeTone, { background: string; foreground: string }> = {
    neutral: { background: theme.colors.surfaceVariant, foreground: theme.colors.onSurfaceVariant },
    success: { background: theme.colors.primaryContainer, foreground: theme.colors.onPrimaryContainer },
    warning: { background: theme.colors.secondaryContainer, foreground: theme.colors.onSecondaryContainer },
    danger: { background: theme.colors.errorContainer, foreground: theme.colors.onErrorContainer },
    info: { background: theme.colors.tertiaryContainer, foreground: theme.colors.onTertiaryContainer },
  };
  const palette = tones[tone];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: palette.background },
        style,
      ]}
      accessibilityRole="text"
    >
      <Text variant="labelSmall" style={{ color: palette.foreground, fontWeight: '700' }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const DEVICE_STATE_TONES: Record<DeviceState, BadgeTone> = {
  ACTIVE: 'success',
  PAYMENT_DUE: 'warning',
  GRACE_PERIOD: 'warning',
  RESTRICTED: 'danger',
  UNLOCK_PENDING: 'warning',
  UNLOCKED: 'success',
  SUSPENDED: 'danger',
};

const PAYMENT_TONES: Record<PaymentStatus, BadgeTone> = {
  SUCCESS: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
  REFUNDED: 'info',
};

export function deviceStateBadge(state: DeviceState, label: string) {
  return <StatusBadge label={label} tone={DEVICE_STATE_TONES[state] ?? 'neutral'} />;
}

export function paymentStatusBadge(status: PaymentStatus, label: string) {
  return <StatusBadge label={label} tone={PAYMENT_TONES[status] ?? 'neutral'} />;
}

export function LoadingState({ label }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.centered} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={theme.colors.primary} />
      {label ? (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
});
