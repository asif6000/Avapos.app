import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppIcon } from '@/components/AppIcon';
import { radius } from '@/theme/layout';
import type { AppTheme } from '@/theme/theme';

interface StepDiscProps {
  /** Rendered as a tick when the step is done; the number otherwise. */
  number: number;
  state?: 'done' | 'current' | 'upcoming';
  style?: object;
}

/**
 * Where a customer is in a sequence, in one glance.
 *
 * A filled green disc with a tick for what is behind them, the brand blue for the
 * step they are on, and a quiet grey for what is still to come. Solid rather than
 * outlined, because three outlines in a column of six rows is a list of empty
 * circles; the states have to be distinguishable at a glance from a metre away.
 */
export function StepDisc({ number, state = 'upcoming', style }: StepDiscProps) {
  const theme = useTheme<AppTheme>();
  const tones = {
    done: { background: theme.colors.success, foreground: '#FFFFFF' },
    current: { background: theme.colors.primary, foreground: '#FFFFFF' },
    upcoming: { background: theme.colors.surfaceVariant, foreground: theme.colors.onSurfaceVariant },
  }[state];

  return (
    <View style={[styles.disc, { backgroundColor: tones.background }, style]}>
      {state === 'done' ? (
        <AppIcon name="check" size={22} color={tones.foreground} />
      ) : (
        <Text variant="labelLarge" style={{ color: tones.foreground, fontWeight: '700' }}>
          {number}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
