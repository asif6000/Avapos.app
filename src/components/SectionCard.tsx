import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { cardShadow, hairline, radius, spacing, useLayout } from '@/theme/layout';
import type { AppTheme } from '@/theme/theme';

interface SectionCardProps {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  /** Tints the card, for the one number that matters most on a screen. */
  tone?: 'default' | 'primary';
  /** Drops the border and shadow, for a card nested inside another card. */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A bordered surface with an optional heading.
 *
 * Cards are the app's only container, so they carry the rhythm: one radius, one
 * border, one padding, one shadow. Flat with a hairline plus a very soft shadow
 * rather than a hard drop shadow, because a hard shadow on a light background is
 * the fastest way to make a clean screen look cheap.
 */
export function SectionCard({
  title,
  children,
  action,
  tone = 'default',
  flat = false,
  style,
}: SectionCardProps) {
  const theme = useTheme<AppTheme>();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tone === 'primary' ? theme.colors.primaryContainer : theme.colors.surface,
          borderColor: tone === 'primary' ? 'transparent' : theme.colors.outlineVariant,
        },
        flat ? null : cardShadow,
        style,
      ]}
    >
      {title ? (
        <View style={styles.header}>
          <Text
            variant="labelLarge"
            style={{
              color: tone === 'primary' ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant,
              fontWeight: '700',
              letterSpacing: 0.3,
            }}
          >
            {title.toUpperCase()}
          </Text>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

interface InfoRowProps {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'muted' | 'strong';
  /** Draws a hairline under the row. */
  divider?: boolean;
}

/**
 * A label and its value.
 *
 * The value wraps under the label rather than being squeezed into a narrow
 * column: a transaction reference or a Bengali sentence in 40% of the width is
 * unreadable, and every one of these rows is a place where the content is not the
 * length the layout assumed.
 */
export function InfoRow({ label, value, tone = 'default', divider = true }: InfoRowProps) {
  const theme = useTheme<AppTheme>();
  const color = tone === 'muted' ? theme.colors.onSurfaceVariant : theme.colors.onSurface;
  const { isCompact } = useLayout();

  return (
    <View
      style={[styles.row, divider && { borderBottomColor: theme.colors.outlineVariant }]}
      accessibilityLabel={`${label}: ${String(value)}`}
    >
      <Text
        variant="bodyMedium"
        numberOfLines={2}
        style={[styles.label, { color: theme.colors.onSurfaceVariant }]}
      >
        {label}
      </Text>
      <Text
        variant={tone === 'strong' ? 'titleMedium' : 'bodyMedium'}
        style={[styles.value, isCompact && styles.valueCompact, { color }]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

export function Divider() {
  const theme = useTheme<AppTheme>();
  return <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderBottomWidth: hairline,
  },
  label: { flexShrink: 1, minWidth: 96 },
  value: { flexShrink: 1, textAlign: 'right', fontWeight: '600' },
  valueCompact: { textAlign: 'left' },
  divider: { height: hairline, marginVertical: spacing.sm },
});
