import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppIcon } from '@/components/AppIcon';
import { StatusBadge, type BadgeTone } from '@/components/StatusBadge';
import { cardShadow, hairline, radius, spacing, useLayout } from '@/theme/layout';
import type { AppTheme } from '@/theme/theme';

interface DeviceSummaryCardProps {
  name: string;
  model: string;
  statusLabel: string;
  statusTone: BadgeTone;
  /** The headline figure, and what it is. */
  figureLabel: string;
  figureValue: string;
}

/**
 * Which phone this account is about, and what it cost.
 *
 * The name and the state are the two things a customer checks first, so they sit
 * at the top left with the badge directly under the model, and the one number
 * that is not a monthly payment gets its own tinted panel on the right. Every
 * name, figure and state here comes from the server.
 */
export function DeviceSummaryCard({
  name,
  model,
  statusLabel,
  statusTone,
  figureLabel,
  figureValue,
}: DeviceSummaryCardProps) {
  const theme = useTheme<AppTheme>();
  const { isCompact } = useLayout();

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
      <View style={[styles.head, isCompact && styles.headCompact]}>
        <View style={[styles.thumb, { backgroundColor: theme.colors.surfaceVariant }]}>
          <AppIcon name="cellphone" size={30} color={theme.colors.primary} />
        </View>

        <View style={styles.identity}>
          <Text
            variant="titleMedium"
            numberOfLines={2}
            style={[styles.name, { color: theme.colors.onSurface }]}
          >
            {name}
          </Text>
          <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
            {model}
          </Text>
          <StatusBadge label={statusLabel} tone={statusTone} style={styles.badge} />
        </View>

        <View style={[styles.figure, { backgroundColor: theme.colors.primaryContainer }]}>
          <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.onPrimaryContainer }}>
            {figureLabel}
          </Text>
          <Text
            variant="titleLarge"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={[styles.figureValue, { color: theme.colors.onPrimaryContainer }]}
          >
            {figureValue}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    padding: spacing.lg,
    ...cardShadow,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headCompact: { flexWrap: 'wrap' },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { flex: 1, gap: 2, minWidth: 0 },
  name: { fontWeight: '700' },
  badge: { marginTop: spacing.xs },
  figure: {
    minWidth: 116,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 2,
  },
  figureValue: { fontWeight: '800' },
});
