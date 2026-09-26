import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';

import { ApiError } from '@/api/errors';
import { AppHeader } from '@/components/AppHeader';
import { ListSkeleton } from '@/components/Skeleton';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { ListRow } from '@/components/ui/ListRow';
import { useMarkAllNotificationsRead } from '@/hooks/queries';
import { useNotificationSource } from '@/hooks/useDataSources';
import { useTranslation } from '@/hooks/useTheme';
import { cardShadow, radius, spacing, useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';
import { formatDateTime } from '@/utils/format';
import type { AppNotification } from '@/types/domain';
import { resolveDeepLink } from '@/services/notifications';

export default function NotificationCenterScreen() {
  const { t, language } = useTranslation();
  const { gutter } = useLayout();
  const theme = useTheme();
  const router = useRouter();
  const list = useNotificationSource();
  const markAll = useMarkAllNotificationsRead();

  const items = list.data;
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

      {list.isLoading ? (
        <View style={[styles.content, { paddingHorizontal: gutter }]}>
          <ListSkeleton count={4} />
        </View>
      ) : list.error && (list.error as ApiError).kind !== 'network' ? (
        <ErrorState message={(list.error as ApiError).message} onRetry={list.refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon="bell-off-outline" title={t('notifications.empty')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item: AppNotification) => item.id}
          contentContainerStyle={[styles.list, { paddingHorizontal: gutter }]}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={list.refetch}
              colors={[theme.colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.item,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: item.isRead ? theme.colors.outlineVariant : theme.colors.primary,
                },
              ]}
            >
              <ListRow
                title={item.title}
                subtitle={item.message}
                trailing={formatDateTime(item.createdAt, language)}
                trailingNode={
                  item.isRead ? null : <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} />
                }
                icon={item.isRead ? 'bell-outline' : 'bell-ring-outline'}
                onPress={() => open(item)}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  // Unread notifications get a primary border rather than a red one: being new
  // is not an error.
  item: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    ...cardShadow,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
