import { StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui/AppButton';
import { hairline, spacing } from '@/theme/layout';
import type { AppTheme } from '@/theme/theme';

interface ActionBarProps {
  label: string;
  onPress: () => void;
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}

/**
 * The one action a screen exists to offer, pinned to the bottom.
 *
 * Both the Payments and Support tabs used to end in a floating paper `FAB`, which
 * is a different shape, a different corner radius and a different label treatment
 * from every other control in the app — and it floats over the last row of a list
 * on a phone a customer is holding one-handed. A full-width pill in a bar is the
 * same control as everywhere else, it cannot cover content, and it sits where a
 * thumb already is.
 */
export function ActionBar({ label, onPress, icon, loading, disabled, testID }: ActionBarProps) {
  const theme = useTheme<AppTheme>();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: insets.bottom + spacing.md,
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outlineVariant,
        },
      ]}
    >
      <AppButton
        size="lg"
        block
        icon={icon}
        label={label}
        loading={loading}
        disabled={disabled}
        onPress={onPress}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: hairline,
  },
});
