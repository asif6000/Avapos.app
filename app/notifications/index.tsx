import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { ListSkeleton } from '@/components/Skeleton';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { SectionCard } from '@/components/SectionCard';
import { useMarkAllNotificationsRead, useNotifications } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { formatDateTime } from '@/utils/format';
import type { AppNotification, NotificationType } from '@/types/domain';
import { resolveDeepLink } from '@/services/notifications';

export default function NotificationCenterScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { data, isLoading, isRefetching, error, refetch } = useNotifications(1);
  const markAll = useMarkAllNotificationsRead();

  const items = data?.items ?? [];
  const hasUnread = items.some((item) => !item.isRead);

  const open = (item: AppNotification) => {
    const link = resolveDeepLink({ type: item.type, referenceId: item.referenceId });
    router.push(link.screen as never);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title={t('notifications.title')}
        action={
          hasUnread
            ? {
                icon: 'check-all',
                label: t('notifications.markAllRead'),
                onPress: () => void markAll.mutateAsync().catch(() => undefined),
              }
            : undefined
        }
      />

      {isLoading ? (
        <View style={styles.content}>
          <ListSkeleton count={4} />
        </View>
      ) : error && error.kind !== 'network' ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={t('notifications.empty')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item: AppNotification) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              colors={[theme.colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => open(item)}
              accessibilityRole="button"
              testID={`notification-${item.id}`}
            >
              <SectionCard
                style={
                  item.isRead
                    ? undefined
                    : { borderColor: theme.colors.primary, borderWidth: 1 }
                }
              >
                <View style={styles.itemHeader}>
                  <Text
                    variant="titleSmall"
                    style={{ flex: 1, color: theme.colors.onSurface, fontWeight: '700' }}
                  >
                    {item.title}
                  </Text>
                  {!item.isRead ? (
                    <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} />
                  ) : null}
                </View>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {item.message}
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {formatDateTime(item.createdAt, language)} · {item.type satisfies NotificationType}
                </Text>
              </SectionCard>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16 },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
