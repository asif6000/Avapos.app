import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';

import { AppIcon } from '@/components/AppIcon';
import { MIN_TAP_TARGET, radius, spacing } from '@/theme/layout';

export type ButtonVariant = 'primary' | 'tonal' | 'outline' | 'text' | 'danger';
export type ButtonSize = 'md' | 'lg';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretches to the width of its container — the default for a form CTA. */
  block?: boolean;
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The app's only button.
 *
 * Five looks, two sizes, and every one of them is a 48dp-tall ripple — which is
 * the difference between a button you can hit while walking and one you cannot.
 * Screens stop choosing their own `contentStyle` heights, so a change here moves
 * every page at once.
 */
export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  disabled = false,
  loading = false,
  testID,
  style,
}: AppButtonProps) {
  const theme = useTheme();
  const inert = disabled || loading;

  const look = {
    primary: { background: theme.colors.primary, foreground: theme.colors.onPrimary },
    danger: { background: theme.colors.error, foreground: theme.colors.onError },
    tonal: {
      background: theme.colors.primaryContainer,
      foreground: theme.colors.onPrimaryContainer,
    },
    outline: { background: 'transparent', foreground: theme.colors.primary },
    text: { background: 'transparent', foreground: theme.colors.primary },
  }[variant];

  return (
    <View
      style={[
        styles.wrapper,
        block && styles.block,
        { height: size === 'lg' ? 54 : MIN_TAP_TARGET },
        variant === 'outline' && { borderWidth: 1, borderColor: theme.colors.outline },
        { backgroundColor: look.background, opacity: inert ? 0.55 : 1 },
        style,
      ]}
    >
      <TouchableRipple
        onPress={onPress}
        disabled={inert}
        borderless
        rippleColor={`${look.foreground}22`}
        style={styles.ripple}
        accessibilityRole="button"
        accessibilityState={{ disabled: inert, busy: loading }}
        accessibilityLabel={label}
        testID={testID}
      >
        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator size="small" color={look.foreground} />
          ) : (
            <>
              {icon ? <AppIcon name={icon} size={20} color={look.foreground} /> : null}
              <Text
                variant="labelLarge"
                numberOfLines={1}
                style={{ color: look.foreground, fontWeight: '700', letterSpacing: 0.2 }}
              >
                {label}
              </Text>
            </>
          )}
        </View>
      </TouchableRipple>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  block: { alignSelf: 'stretch' },
  ripple: { flex: 1 },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
});
