import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppIcon } from '@/components/AppIcon';
import { MIN_TAP_TARGET, radius, raisedShadow, spacing } from '@/theme/layout';
import type { AppTheme } from '@/theme/theme';

export type ButtonVariant = 'primary' | 'tonal' | 'outline' | 'text' | 'danger' | 'inverse';
export type ButtonSize = 'md' | 'lg';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretches to the width of its container — the default for a form CTA. */
  block?: boolean;
  icon?: string;
  /** Trailing chevron: the button is a hop, not a destination. */
  chevron?: boolean;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The app's only button.
 *
 * Six looks, two sizes, and every one of them is the same pill: same radius,
 * same 48dp-or-54dp height, same 700 label, same ripple. Nothing in the app
 * draws a button any other way, which is the whole point — a customer should not
 * be able to tell from the shape of a control which screen they are on.
 *
 * `inverse` is the one that earns its keep: white on the blue due banner, where
 * a filled blue button would disappear into its own background.
 */
export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  chevron = false,
  disabled = false,
  loading = false,
  testID,
  style,
}: AppButtonProps) {
  const theme = useTheme<AppTheme>();
  const inert = disabled || loading;

  const look = {
    primary: {
      background: theme.colors.primary,
      foreground: '#FFFFFF',
      border: 'transparent',
      shadow: true,
    },
    danger: {
      background: theme.colors.error,
      foreground: '#FFFFFF',
      border: 'transparent',
      shadow: true,
    },
    inverse: {
      background: '#FFFFFF',
      foreground: theme.colors.primary,
      border: 'transparent',
      shadow: true,
    },
    tonal: {
      background: theme.colors.primaryContainer,
      foreground: theme.colors.onPrimaryContainer,
      border: 'transparent',
      shadow: false,
    },
    outline: {
      background: 'transparent',
      foreground: theme.colors.primary,
      // `outline`, not `outlineVariant`: a standalone button sitting on the page
      // needs a border a customer can actually see — the hairline tone is only
      // legible against a card.
      border: theme.colors.outline,
      shadow: false,
    },
    text: {
      background: 'transparent',
      foreground: theme.colors.primary,
      border: 'transparent',
      shadow: false,
    },
  }[variant];

  return (
    <View
      style={[
        styles.wrapper,
        block && styles.block,
        { height: size === 'lg' ? 54 : MIN_TAP_TARGET },
        look.shadow && !inert ? raisedShadow : null,
        {
          backgroundColor: look.background,
          opacity: inert ? 0.5 : 1,
        },
        look.border !== 'transparent' ? { borderWidth: 1, borderColor: look.border } : null,
        style,
      ]}
    >
      {/* `Pressable` rather than paper's ripple: this button is custom-sized, and
          a host component keeps the real `onPress` reachable — by assistive
          technology, and by the tests that press it. */}
      <Pressable
        onPress={onPress}
        disabled={inert}
        android_ripple={{ color: `${look.foreground}22` }}
        accessibilityRole="button"
        accessibilityState={{ disabled: inert, busy: loading }}
        accessibilityLabel={label}
        testID={testID}
        style={styles.ripple}
      >
        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator size="small" color={look.foreground} />
          ) : (
            <>
              {icon ? <AppIcon name={icon} size={20} color={look.foreground} /> : null}
              <Text
                variant={size === 'lg' ? 'titleSmall' : 'labelLarge'}
                numberOfLines={1}
                style={{ color: look.foreground, fontWeight: '700', letterSpacing: 0.1 }}
              >
                {label}
              </Text>
              {chevron ? <AppIcon name="chevron-right" size={20} color={look.foreground} /> : null}
            </>
          )}
        </View>
      </Pressable>
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
