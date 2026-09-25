import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

interface SectionCardProps {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SectionCard({ title, children, action, style }: SectionCardProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant },
        style,
      ]}
    >
      {title ? (
        <View style={styles.header}>
          <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
            {title}
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
}

export function InfoRow({ label, value, tone = 'default' }: InfoRowProps) {
  const theme = useTheme();
  const color =
    tone === 'muted'
      ? theme.colors.onSurfaceVariant
      : tone === 'strong'
        ? theme.colors.onSurface
        : theme.colors.onSurface;
  const variant = tone === 'strong' ? 'titleMedium' : 'bodyMedium';

  return (
    <View style={styles.row} accessibilityLabel={`${label}: ${String(value)}`}>
      <Text variant="bodyMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
        {label}
      </Text>
      <Text variant={variant} style={[styles.value, { color }]} selectable>
        {value}
      </Text>
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 6,
  },
  label: { flexShrink: 1 },
  value: { flexShrink: 1, textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
});
