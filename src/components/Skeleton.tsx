import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';

type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** Neutral placeholder block. Real data never leaks into skeleton geometry. */
export function Skeleton({ width = '100%', height = 16, radius = 6, style }: SkeletonProps) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.colors.surfaceVariant,
          opacity: 0.7,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard({ lines = 3, style }: { lines?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16 },
        style,
      ]}
    >
      <Skeleton width="55%" height={20} />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? '40%' : '100%'} height={12} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
});

export function DashboardSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ gap: 16 }}>
      <Skeleton width="60%" height={24} />
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderRadius: 20, padding: 20, gap: 14 },
        ]}
      >
        <Skeleton width="45%" height={14} />
        <Skeleton width="70%" height={32} />
        <Skeleton height={8} radius={999} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Skeleton width="48%" height={56} radius={12} />
          <Skeleton width="48%" height={56} radius={12} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <SkeletonCard lines={2} style={{ flex: 1 }} />
        <SkeletonCard lines={2} style={{ flex: 1 }} />
      </View>
      <Skeleton height={52} radius={999} />
    </View>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} lines={2} />
      ))}
    </View>
  );
}
