import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { hairline, MIN_TAP_TARGET, radius, spacing } from '@/theme/layout';
import type { AppTheme } from '@/theme/theme';

export interface Segment {
  key: string;
  label: string;
}

interface SegmentedTabsProps {
  segments: Segment[];
  value: string;
  onChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * The tab strip that sits inside a screen, under the header.
 *
 * A filled blue pill on a tinted track, the same on every screen that has one, so
 * "which of these am I looking at" is answered the same way everywhere. It scrolls
 * rather than shrinking its labels: four segments on a small phone would
 * otherwise squeeze the words into ellipses, and a truncated tab is a tab nobody
 * can read.
 */
export function SegmentedTabs({ segments, value, onChange, style }: SegmentedTabsProps) {
  const theme = useTheme<AppTheme>();

  return (
    <View style={[styles.track, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {segments.map((segment) => {
          const active = segment.key === value;
          return (
            <Pressable
              key={segment.key}
              onPress={() => onChange(segment.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={segment.label}
              testID={`segment-${segment.key}`}
              style={({ pressed }) => [
                styles.segment,
                active && { backgroundColor: theme.colors.primary },
                pressed && !active ? { backgroundColor: theme.colors.surfaceVariant } : null,
              ]}
            >
              <Text
                variant="labelMedium"
                numberOfLines={1}
                style={{
                  color: active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant,
                  fontWeight: active ? '700' : '600',
                }}
              >
                {segment.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radius.pill,
    borderWidth: hairline,
    padding: 4,
  },
  content: { gap: spacing.xs, paddingHorizontal: 2 },
  segment: {
    minHeight: MIN_TAP_TARGET - 8,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
