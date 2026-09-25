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
      accessibilityLabel={label}
    >
      {/* A dot reads as a state at a glance; a coloured word alone does not,
          and a screen of them turns into a wall of shouting capitals. */}
      <View style={[styles.dot, { backgroundColor: palette.foreground }]} />
      <Text
        variant="labelSmall"
        numberOfLines={1}
        style={{ color: palette.foreground, fontWeight: '700', letterSpacing: 0.3 }}
      >
        {label}
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
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    // Beside a long title, a badge that compressed would read as a different,
    // smaller status. It keeps its size and the row wraps instead.
    flexShrink: 0,
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
});
