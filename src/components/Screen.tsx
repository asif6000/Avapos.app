import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { RefreshControl } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfflineBanner } from './OfflineBanner';
import { CONTENT_MAX_WIDTH, spacing } from '@/theme/layout';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom')[];
  showOfflineBanner?: boolean;
}

export function Screen({
  children,
  scroll = false,
  refreshing = false,
  onRefresh,
  contentContainerStyle,
  style,
  edges = ['top'],
  showOfflineBanner = true,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const padding = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: insets.bottom,
  };

  if (scroll) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }, style]}>
        {showOfflineBanner ? <OfflineBanner /> : null}
        <ScrollView
          contentContainerStyle={[styles.content, styles.bottomRoom, padding, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.flex,
        padding,
        { backgroundColor: theme.colors.background },
        style,
      ]}
    >
      {showOfflineBanner ? <OfflineBanner /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // `flexGrow` so a short screen can still pull its footer to the bottom, and a
  // width cap so a tablet does not stretch one column of text to the far edge.
  content: { flexGrow: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  bottomRoom: { paddingBottom: spacing.xxl },
});
