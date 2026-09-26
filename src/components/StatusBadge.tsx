import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';

import { AppIcon } from '@/components/AppIcon';
import { radius, spacing } from '@/theme/layout';
import type { AppTheme } from '@/theme/theme';
import type { DeviceState, PaymentStatus } from '@/types/domain';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  /** A glyph reads faster than a dot when the state is a familiar one. */
  icon?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A state, as a soft tinted pill.
 *
 * Three rules keep a screen of these readable rather than loud: the fill is a
 * tint, not a solid; the label is sentence case, because the colour and the dot
 * already carry the emphasis and a capitalised word on top of that is a shout;
 * and the badge never compresses, so beside a long title the row wraps instead of
 * the status quietly shrinking into a different-looking, smaller status.
 */
export function StatusBadge({ label, tone = 'neutral', icon, style }: StatusBadgeProps) {
  const theme = useTheme<AppTheme>();
  const tones: Record<BadgeTone, { background: string; foreground: string }> = {
    neutral: { background: theme.colors.surfaceVariant, foreground: theme.colors.onSurfaceVariant },
    success: { background: theme.colors.successContainer, foreground: theme.colors.onSuccessContainer },
    warning: { background: theme.colors.secondaryContainer, foreground: theme.colors.onSecondaryContainer },
    danger: { background: theme.colors.errorContainer, foreground: theme.colors.onErrorContainer },
    info: { background: theme.colors.tertiaryContainer, foreground: theme.colors.onTertiaryContainer },
  };
  const colors = tones[tone];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.background },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {icon ? (
        <AppIcon name={icon} size={14} color={colors.foreground} />
      ) : (
        <View style={[styles.dot, { backgroundColor: colors.foreground }]} />
      )}
      <Text
        variant="labelMedium"
        numberOfLines={1}
        style={{ color: colors.foreground, fontWeight: '700' }}
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

export function deviceStateTone(state: DeviceState): BadgeTone {
  return DEVICE_STATE_TONES[state] ?? 'neutral';
}

export function deviceStateBadge(state: DeviceState, label: string) {
  return <StatusBadge label={label} tone={deviceStateTone(state)} />;
}

export function paymentStatusBadge(status: PaymentStatus, label: string) {
  return <StatusBadge label={label} tone={PAYMENT_TONES[status] ?? 'neutral'} />;
}

export function LoadingState({ label }: { label?: string }) {
  const theme = useTheme<AppTheme>();
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
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
});
