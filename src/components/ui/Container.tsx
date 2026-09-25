import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { CONTENT_MAX_WIDTH, useLayout } from '@/theme/layout';

interface ContainerProps {
  children: ReactNode;
  /** Vertical rhythm between children. */
  gap?: number;
  /** Set false on a screen that manages its own horizontal padding. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The width every screen's content obeys.
 *
 * One component, so "how wide is this allowed to be" is answered in one place:
 * full width on a phone, centred and capped on a tablet or in landscape, with a
 * gutter that tightens on small screens instead of eating the content.
 */
export function Container({ children, gap = 0, padded = true, style }: ContainerProps) {
  const { gutter } = useLayout();
  return (
    <View
      style={[
        styles.container,
        padded && { paddingHorizontal: gutter },
        gap > 0 && { gap },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
});
