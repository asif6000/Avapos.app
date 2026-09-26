import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppIcon } from '@/components/AppIcon';
import { AppButton } from '@/components/ui/AppButton';
import { cardShadow, hairline, radius, spacing, useLayout } from '@/theme/layout';
import type { AppTheme } from '@/theme/theme';

interface DueBannerProps {
  label: string;
  amount: string;
  dueLabel: string;
  dueValue: string;
  ctaLabel: string;
  onPress: () => void;
  tone?: 'primary' | 'danger';
  testID?: string;
}

/**
 * The one thing the customer came to the app to do.
 *
 * A full-width blue band, the amount set larger than anything else on the
 * screen, and a single white pill to act on it. It earns its own component
 * because it appears on more than one screen and it must not drift: the same
 * amount, the same date, the same button, wherever the customer meets it.
 */
export function DueBanner({
  label,
  amount,
  dueLabel,
  dueValue,
  ctaLabel,
  onPress,
  tone = 'primary',
  testID,
}: DueBannerProps) {
  const theme = useTheme<AppTheme>();
  const { width } = useLayout();
  const background = tone === 'danger' ? theme.colors.error : theme.colors.primary;
  const muted = 'rgba(255,255,255,0.85)';

  /**
   * Side by side only where there is genuinely room for it. Three columns of
   * figures plus a button across a 390dp phone is what made the amount read
   * "৳2,…": a truncated amount on the one number a customer came for is worse
   * than a button on the next line.
   */
  const inline = width >= 560;

  return (
    <View style={[styles.banner, { backgroundColor: background }]}>
      <View style={inline ? styles.row : styles.column}>
        <View style={styles.figures}>
          <View style={styles.figure}>
            <View style={styles.caption}>
              <AppIcon name="wallet-outline" size={20} color="#FFFFFF" />
              <Text
                variant="labelSmall"
                numberOfLines={2}
                style={[styles.caption, styles.captionText, { color: muted }]}
              >
                {label}
              </Text>
            </View>
            <Text
              variant="headlineSmall"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={styles.amount}
              testID={testID}
            >
              {amount}
            </Text>
          </View>

          <View style={[styles.rule, { backgroundColor: 'rgba(255,255,255,0.28)' }]} />

          <View style={styles.figure}>
            <View style={styles.caption}>
              <AppIcon name="calendar-outline" size={20} color="#FFFFFF" />
              <Text
                variant="labelSmall"
                numberOfLines={2}
                style={[styles.caption, styles.captionText, { color: muted }]}
              >
                {dueLabel}
              </Text>
            </View>
            <Text variant="titleMedium" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.dueValue}>
              {dueValue}
            </Text>
          </View>
        </View>

        <AppButton
          variant="inverse"
          label={ctaLabel}
          chevron
          onPress={onPress}
          block={!inline}
          style={inline ? styles.cta : undefined}
          testID="due-banner-cta"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: hairline,
    borderColor: 'transparent',
    ...cardShadow,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  column: { gap: spacing.lg },
  figures: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  figure: { flex: 1, gap: spacing.xs, minWidth: 0 },
  caption: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Two lines' worth, always: a caption that wraps on one figure and not the
  // other would push one amount out of line with its neighbour.
  captionText: { flexShrink: 1, minHeight: 30 },
  amount: { color: '#FFFFFF', fontWeight: '800', letterSpacing: -0.5 },
  dueValue: { color: '#FFFFFF', fontWeight: '700' },
  rule: { width: hairline, alignSelf: 'stretch' },
  cta: { alignSelf: 'center' },
});
