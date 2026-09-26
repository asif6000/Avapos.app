import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { radius, spacing } from '@/theme/layout';

interface StatTileProps {
  label: string;
  value: string;
  /** Shown under the value: a date, a note, a status. */
  hint?: string;
  tone?: 'default' | 'primary' | 'muted' | 'strong';
  /** `filled` is a standalone tile; `plain` is a column inside a card, divided by
   *  hairlines rather than boxes — the same numbers, one card instead of four. */
  variant?: 'filled' | 'plain';
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A number with its label — the unit money and dates are shown in.
 *
 * It takes a basis and shrinks rather than a fixed width, so a row of tiles
 * shares one line on a phone and spreads on a tablet instead of leaving half the
 * card empty, and the value shrinks before the label does.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
  variant = 'filled',
  testID,
  style,
}: StatTileProps) {
  const theme = useTheme();

  const valueColor =
    tone === 'primary'
      ? theme.colors.primary
      : tone === 'muted'
        ? theme.colors.onSurfaceVariant
        : tone === 'strong'
          ? theme.colors.onSurface
          : theme.colors.onSurface;

  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: variant === 'filled' ? theme.colors.surfaceVariant : 'transparent',
          // A basis, not a width, and never 100%: `flexBasis: '100%'` refuses to
          // shrink, so a row of tiles silently ran off the right edge of the
          // screen, and two tiles that should have shared a line each claimed
          // their own. A caller that needs a different proportion passes
          // `flexBasis` in `style` and it wins.
          flexBasis: '46%',
        },
        variant === 'plain' ? styles.plainTile : null,
        style,
      ]}
      testID={testID}
    >
      <Text
        variant="labelSmall"
        numberOfLines={2}
        style={[variant === 'plain' ? styles.plainLabel : null, { color: theme.colors.onSurfaceVariant }]}
      >
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
    flexShrink: 1,
    minWidth: 0,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  plainTile: { paddingHorizontal: 0 },
  // A column of figures is only a table if the numbers sit on one line. Two
  // lines are always reserved for the label so "Down payment" wrapping does not
  // drop its value below its neighbours'.
  plainLabel: { minHeight: 30 },
});

