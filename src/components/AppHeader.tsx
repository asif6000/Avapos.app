import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { useTranslation } from '@/hooks/useTheme';
import { HIT_SLOP, radius, spacing, useLayout } from '@/theme/layout';
import { AppIcon } from './AppIcon';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: { icon: string; label: string; onPress: () => void };
  /** Draws the hairline under the bar. Off inside a coloured hero. */
  bordered?: boolean;
}

/**
 * The bar at the top of every screen.
 *
 * Fixed height and a fixed-size action target, so the content below never
 * starts at a different y depending on how long the title is — which is what
 * makes a set of screens feel like one app instead of five. The title is
 * allowed to shrink rather than wrap: a two-line header on a small phone pushes
 * the content off the fold.
 */
export function AppHeader({
  title,
  subtitle,
  back = true,
  action,
  bordered = true,
}: AppHeaderProps) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { gutter } = useLayout();

  return (
    <View
      style={[
        styles.container,
        { paddingHorizontal: gutter },
        bordered && { borderBottomColor: theme.colors.outlineVariant },
      ]}
    >
      {back ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={styles.iconButton}
          testID="header-back"
        >
          <AppIcon name="arrow-left" size={22} color={theme.colors.onSurface} />
        </Pressable>
      ) : null}

      <View style={styles.titles}>
        <Text
          variant="titleLarge"
          numberOfLines={1}
          style={{ color: theme.colors.onSurface, fontWeight: '700', letterSpacing: -0.2 }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {action ? (
        <Pressable
          onPress={action.onPress}
          android_ripple={{ color: `${theme.colors.primary}1A`, borderless: true }}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          testID="header-action"
          style={[styles.iconButton, { backgroundColor: theme.colors.surfaceVariant }]}
        >
          <View style={styles.iconButtonInner}>
            <AppIcon name={action.icon} size={20} color={theme.colors.onSurface} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titles: { flex: 1, gap: 1, minWidth: 0 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconButtonInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
