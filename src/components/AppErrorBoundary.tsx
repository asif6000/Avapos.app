import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppButton } from '@/components/ui/AppButton';
import { SectionCard } from '@/components/SectionCard';
import { radius, spacing, useLayout } from '@/theme/layout';

/**
 * The last thing between a bug and a customer with a phone that will not open.
 *
 * WHY THIS EXISTS
 *
 * A React Native app that throws while rendering does not show an error screen —
 * it shows the splash and then dies, and on a release build the error goes to
 * logcat, which a shop, a customer or a person without a cable cannot read. The
 * symptom is always the same and never identifies the cause: "the app does not
 * open".
 *
 * So the error is caught and *shown*, in words a person can read and copy, with
 * the component stack under it. A bug that cannot describe itself gets fixed
 * twice.
 *
 * WHAT IT IS NOT
 *
 * Not a way to make a broken app look working. Nothing is retried and no screen
 * pretends the failure did not happen: the copy says what happened, and the only
 * action is a restart, which is honest — a render error means the tree is in an
 * unknown state and the only safe move is to build it again.
 *
 * It catches render, lifecycle and constructor errors. It cannot catch an
 * exception inside an `async` function or a native crash; nothing in JavaScript
 * can, and pretending otherwise would be a worse lie than the splash screen.
 */
interface Props {
  children: ReactNode;
  /** Shown above the details. Never a promise that this will fix anything. */
  heading?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ error, info });
    // The console is the only place this is recorded outside the phone.
    console.error('[app] the app failed to render and was stopped here', error, info.componentStack);
  }

  private restart = (): void => {
    this.setState({ error: null, info: null });
  };

  override render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return <CrashScreen error={error} stack={info?.componentStack ?? null} heading={this.props.heading} onRestart={this.restart} />;
  }
}

/**
 * Kept as its own component so it can use the theme and the layout helpers:
 * a class component cannot call a hook, and the alternative — a plain white page
 * with black text — would be unreadable in dark mode, which is the one moment
 * somebody is most likely to be looking at it.
 */
function CrashScreen({
  error,
  stack,
  heading,
  onRestart,
}: {
  error: Error;
  stack: string | null;
  heading?: string;
  onRestart: () => void;
}) {
  const theme = useTheme();
  const { gutter } = useLayout();
  const details = [error.message, stack].filter(Boolean).join('\n\n');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.content, { paddingHorizontal: gutter, paddingVertical: spacing.xl }]}
    >
      <View style={styles.header}>
        <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
          {heading ?? 'The app could not start'}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Nothing was sent anywhere and nothing on your account has changed. Restarting is safe. If this keeps
          happening, copy the details below — they are the whole diagnosis.
        </Text>
      </View>

      <SectionCard title="Details">
        <Text
          selectable
          variant="bodySmall"
          style={[styles.details, { color: theme.colors.onSurface, backgroundColor: theme.colors.surfaceVariant }]}
        >
          {details}
        </Text>
      </SectionCard>

      <AppButton block icon="refresh" label="Restart" onPress={onRestart} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, flexGrow: 1, justifyContent: 'center' },
  header: { gap: spacing.sm },
  details: {
    fontFamily: 'monospace',
    borderRadius: radius.sm,
    padding: spacing.md,
  },
});
