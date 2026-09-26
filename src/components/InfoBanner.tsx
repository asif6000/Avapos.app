import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppIcon } from '@/components/AppIcon';
import { radius, spacing } from '@/theme/layout';
import type { AppTheme } from '@/theme/theme';

interface InfoBannerProps {
  body: string;
  /** Defaults to the information glyph. */
  icon?: string;
  /** `info` is the calm default; `warning` is for something the customer should act on. */
  tone?: 'info' | 'warning' | 'danger';
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * A short, quiet note under the content.
 *
 * The advice a screen wants to give — pay on time, this screen is a summary — in
 * a tinted strip rather than a card. A card would make it look like another thing
 * to tap; a banner reads as a footnote, which is what it is.
 */
export function InfoBanner({ body, icon = 'information', tone = 'info', action, style }: InfoBannerProps) {
  const theme = useTheme<AppTheme>();
  const tones = {
    info: { background: theme.colors.tertiaryContainer, foreground: theme.colors.onTertiaryContainer },
    warning: { background: theme.colors.secondaryContainer, foreground: theme.colors.onSecondaryContainer },
    danger: { background: theme.colors.errorContainer, foreground: theme.colors.onErrorContainer },
  }[tone];

  return (
    <View
      style={[styles.banner, { backgroundColor: tones.background }, style]}
      accessibilityRole="text"
    >
      <AppIcon name={icon} size={20} color={tones.foreground} />
      <Text variant="bodySmall" style={[styles.body, { color: tones.foreground }]}>
        {body}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  body: { flex: 1 },
});
