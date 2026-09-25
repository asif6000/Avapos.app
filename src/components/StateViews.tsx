import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { useTranslation } from '@/hooks/useTheme';

interface EmptyStateProps {
  title?: string;
  body?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ title, body, action, style }: EmptyStateProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={[styles.container, style]}>
      <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
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
export function ErrorState({ message, onRetry, onSignOut, style }: ErrorStateProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={[styles.container, style]}>
      <Text variant="titleMedium" style={{ color: theme.colors.error }}>
        {t('errors.generic')}
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.body, { color: theme.colors.onSurfaceVariant }]}
      >
        {message ?? t('errors.generic')}
      </Text>
      {onRetry ? (
        <Text
          variant="labelLarge"
          style={{ color: theme.colors.primary, marginTop: 8 }}
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
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}
          onPress={onSignOut}
          accessibilityRole="button"
          testID="error-sign-out"
        >
          {t('settings.signOut')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  body: { textAlign: 'center' },
});
