import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';

import { AppIcon } from '@/components/AppIcon';
import { radius, spacing, useLayout } from '@/theme/layout';

interface ListRowProps {
  title: string;
  subtitle?: string | null;
  /** Right-hand text: an amount, a date, a reference. */
  trailing?: string | null;
  /** A badge or anything else that belongs on the right. */
  trailingNode?: React.ReactNode;
  icon?: string;
  onPress?: () => void;
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * One row, used by every list in the app.
 *
 * The point of a shared row is that a customer learns where to look: the title
 * is always here, the detail always there, the chevron only when the row goes
 * somewhere. It also fixes the failure mode that made installments, payments,
 * tickets and notifications each look like a different app.
 */
export function ListRow({
  title,
  subtitle,
  trailing,
  trailingNode,
  icon,
  onPress,
  showChevron = Boolean(onPress),
  style,
}: ListRowProps) {
  const theme = useTheme();
  const { isCompact } = useLayout();

  const body = (
    <View style={[styles.row, isCompact && styles.rowCompact, style]}>
      {icon ? (
        <View style={[styles.icon, { backgroundColor: theme.colors.surfaceVariant }]}>
          <AppIcon name={icon} size={20} color={theme.colors.onSurfaceVariant} />
        </View>
      ) : null}

      <View style={styles.text}>
        <Text variant="bodyLarge" numberOfLines={2} style={{ color: theme.colors.onSurface }}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="bodySmall"
            numberOfLines={2}
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing || trailingNode ? (
        <View style={styles.trailing}>
          {trailing ? (
            <Text variant="titleSmall" numberOfLines={1} style={{ color: theme.colors.onSurface }}>
              {trailing}
            </Text>
          ) : null}
          {trailingNode}
        </View>
      ) : null}

      {showChevron ? (
        <AppIcon name="chevron-right" size={20} color={theme.colors.outline} />
      ) : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <TouchableRipple
      onPress={onPress}
      borderless
      rippleColor={`${theme.colors.primary}14`}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, trailing].filter(Boolean).join(', ')}
      style={styles.pressable}
    >
      {body}
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  pressable: { borderRadius: radius.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 64,
  },
  rowCompact: { paddingHorizontal: spacing.md, gap: spacing.sm },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  trailing: { alignItems: 'flex-end', gap: 4, maxWidth: '45%' },
});
