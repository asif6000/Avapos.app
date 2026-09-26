import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppIcon } from '@/components/AppIcon';
import { useTranslation } from '@/hooks/useTheme';
import { radius, spacing, useLayout } from '@/theme/layout';

interface EmptyStateProps {
  title?: string;
  body?: string;
  /** A soft icon disc, so the state looks designed rather than unfinished. */
  icon?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** "There is nothing here" — and, where it matters, why. */
export function EmptyState({ title, body, icon = 'inbox-outline', action, style }: EmptyStateProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { gutter } = useLayout();
  return (
    <View style={[styles.container, { paddingHorizontal: gutter }, style]}>
      <View style={[styles.disc, { backgroundColor: theme.colors.surfaceVariant }]}>
        <AppIcon name={icon} size={26} color={theme.colors.onSurfaceVariant} />
      </View>
      <Text
        variant="titleMedium"
        style={{ color: theme.colors.onSurface, fontWeight: '700', textAlign: 'center' }}
      >
        {title ?? t('errors.emptyTitle')}
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.body, { color: theme.colors.onSurfaceVariant }]}
      >
        {body ?? t('errors.emptyBody')}
      </Text>
      {action}
    </View>
  );
}

interface ErrorStateProps {
  /**
   * What went wrong, in the customer's terms.
   *
   * Defaults to the generic line. It is overridable because "Something went
   * wrong. Please try again." is only honest when nothing more specific is
   * known — a session that has genuinely ended, an account the server cannot
   * find, and a part of the service that is not deployed are three different
   * events, and a customer who is told the same sentence for all three learns
   * nothing from any of them.
   */
  title?: string;
  message?: string | null;
  onRetry?: () => void;
  /**
   * Offered only where the customer is signed in and a screen has failed.
   *
   * Without it there is a real trap: every screen inside the app can fail, the
   * header action that reaches Settings disappears with the content, and a
   * customer whose session no longer matches the server has no way back to the
   * sign-in screen at all. The session may well be fine, so this is *offered*,
   * never forced, and it sits below Retry rather than pretending to be the fix.
   */
  onSignOut?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Renders only customer-safe copy. Stack traces, SQL text and backend paths are
 * stripped before they ever reach this component.
 */
export function ErrorState({ title, message, onRetry, onSignOut, style }: ErrorStateProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { gutter } = useLayout();
  return (
    <View style={[styles.container, { paddingHorizontal: gutter }, style]}>
      <View style={[styles.disc, { backgroundColor: theme.colors.errorContainer }]}>
        <AppIcon name="cloud-alert-outline" size={26} color={theme.colors.onErrorContainer} />
      </View>
      <Text
        variant="titleMedium"
        style={{ color: theme.colors.onSurface, fontWeight: '700', textAlign: 'center' }}
      >
        {title ?? t('errors.generic')}
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.body, { color: theme.colors.onSurfaceVariant }]}
      >
        {message ?? t('errors.generic')}
      </Text>
      {onRetry || onSignOut ? (
        <View style={styles.actions}>
          {onRetry ? (
            <Text
              variant="labelLarge"
              style={{ color: theme.colors.primary, fontWeight: '700' }}
              onPress={onRetry}
              accessibilityRole="button"
              testID="error-retry"
            >
              {t('common.retry')}
            </Text>
          ) : null}
          {onSignOut ? (
            <Text
              variant="labelLarge"
              style={{ color: theme.colors.onSurfaceVariant }}
              onPress={onSignOut}
              accessibilityRole="button"
              testID="error-sign-out"
            >
              {t('settings.signOut')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  disc: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  body: { textAlign: 'center', maxWidth: 420 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl, marginTop: spacing.md },
});
