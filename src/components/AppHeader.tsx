import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { useTranslation } from '@/hooks/useTheme';
import { HIT_SLOP, radius, spacing, useLayout } from '@/theme/layout';
import type { AppTheme } from '@/theme/theme';
import { AppIcon } from './AppIcon';

interface AppHeaderAction {
  icon: string;
  label: string;
  onPress: () => void;
  /** Unread count, drawn as a small dot-number on the action. */
  badge?: number;
}

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: AppHeaderAction;
  /** Draws the hairline under the bar. Off inside a coloured hero. */
  bordered?: boolean;
  /**
   * `primary` is the standard bar and the reason every screen looks like the same
   * app: one blue band, white type, identical height. `surface` is the quiet
   * variant for a screen that already owns the top of the screen with a card.
   */
  tone?: 'primary' | 'surface';
}

/**
 * The bar at the top of every screen.
 *
 * Fixed height and a fixed-size action target, so the content below never starts
 * at a different y depending on how long the title is — which is what makes a set
 * of screens feel like one app instead of five. The title is allowed to shrink
 * rather than wrap: a two-line header on a small phone pushes the content off the
 * fold.
 */
export function AppHeader({
  title,
  subtitle,
  back = true,
  action,
  bordered = true,
  tone = 'primary',
}: AppHeaderProps) {
  const theme = useTheme<AppTheme>();
  const router = useRouter();
  const { t } = useTranslation();
  const { gutter } = useLayout();

  const onPrimary = tone === 'primary';
  const background = onPrimary ? theme.colors.primary : theme.colors.surface;
  const foreground = onPrimary ? '#FFFFFF' : theme.colors.onSurface;
  const muted = onPrimary ? 'rgba(255,255,255,0.82)' : theme.colors.onSurfaceVariant;

  return (
    <View
      style={[
        styles.container,
        { paddingHorizontal: gutter, backgroundColor: background },
        bordered && {
          borderBottomColor: onPrimary ? 'transparent' : theme.colors.outlineVariant,
        },
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
          <AppIcon name="arrow-left" size={22} color={foreground} />
        </Pressable>
      ) : null}

      <View style={styles.titles}>
        <Text
          variant="titleLarge"
          numberOfLines={1}
          style={{ color: foreground, fontWeight: '700', letterSpacing: -0.2 }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" numberOfLines={1} style={{ color: muted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          testID="header-action"
          style={[
            styles.iconButton,
            { backgroundColor: onPrimary ? 'rgba(255,255,255,0.16)' : theme.colors.surfaceVariant },
          ]}
        >
          <View style={styles.iconButtonInner}>
            <AppIcon name={action.icon} size={20} color={foreground} />
            {action.badge ? (
              <View style={styles.badge}>
                <Text variant="labelSmall" numberOfLines={1} style={styles.badgeText}>
                  {action.badge > 9 ? '9+' : action.badge}
                </Text>
              </View>
            ) : null}
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
  // No `overflow: hidden` here: the unread count deliberately sits outside the
  // 40dp disc, and clipping the container clipped the number in half.
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#E5484D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, lineHeight: 13, fontWeight: '700' },
});
