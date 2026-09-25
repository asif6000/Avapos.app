import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { radius, spacing, useLayout } from '@/theme/layout';

interface StatTileProps {
  label: string;
  value: string;
  /** Shown under the value: a date, a note, a status. */
  hint?: string;
  tone?: 'default' | 'primary' | 'muted';
  style?: StyleProp<ViewStyle>;
}

/**
 * A number with its label — the unit money and dates are shown in.
 *
 * It takes a floor and a cap rather than a fixed width, so a row of tiles
 * wraps on a narrow phone instead of squeezing two of them into 150dp, and
 * spreads on a tablet instead of leaving half the card empty.
 */
export function StatTile({ label, value, hint, tone = 'default', style }: StatTileProps) {
  const theme = useTheme();
  const { columns } = useLayout();

  const valueColor =
    tone === 'primary' ? theme.colors.primary : tone === 'muted' ? theme.colors.onSurfaceVariant : theme.colors.onSurface;

  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: theme.colors.surfaceVariant, flexBasis: columns === 2 ? '47%' : '100%' },
        style,
      ]}
    >
      <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
        {label}
      </Text>
      <Text
        variant="titleMedium"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{ color: valueColor, fontWeight: '700' }}
      >
        {value}
      </Text>
      {hint ? (
        <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
});
