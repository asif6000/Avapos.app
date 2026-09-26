import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';

import { ActionBar } from '@/components/ActionBar';
import { AppHeader } from '@/components/AppHeader';
import { ListRow } from '@/components/ui/ListRow';
import { ListSkeleton } from '@/components/Skeleton';
import { StatusBadge, type BadgeTone } from '@/components/StatusBadge';
import { AppButton } from '@/components/ui/AppButton';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { useTickets } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { cardShadow, radius, spacing, useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';
import { ticketStatusLabel } from '@/utils/format';
import type { SupportTicket, TicketStatus } from '@/types/domain';

const TICKET_TONES: Record<TicketStatus, BadgeTone> = {
  OPEN: 'info',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export default function SupportHomeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const signOut = useAuthStore((state) => state.signOut);
  const router = useRouter();
  const { data, isLoading, isRefetching, error, refetch } = useTickets(1);

  const tickets = data?.items ?? [];
  const { gutter } = useLayout();

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title={t('support.title')}
        back={false}
        action={{
          icon: 'bell-outline',
          label: t('notifications.title'),
          onPress: () => router.push('/notifications'),
        }}
      />

      {isLoading ? (
        <View style={styles.content}>
          <ListSkeleton count={3} />
        </View>
      ) : error && error.kind !== 'network' ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} onSignOut={() => void signOut()} />
      ) : tickets.length === 0 ? (
        <EmptyState
          icon="lifebuoy"
          title={t('support.myTickets')}
          body={t('support.noTickets')}
          action={
            <AppButton
              icon="message-plus"
              label={t('support.createTicket')}
              onPress={() => router.push('/support/create')}
            />
          }
        />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item: SupportTicket) => item.id}
          contentContainerStyle={[styles.list, { paddingHorizontal: gutter }]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              colors={[theme.colors.primary]}
            />
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.item,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant },
              ]}
            >
              <ListRow
                title={item.subject}
                subtitle={item.message}
                trailingNode={
                  <StatusBadge
                    label={ticketStatusLabel(item.status, t)}
                    tone={TICKET_TONES[item.status] ?? 'neutral'}
                  />
                }
                icon="message-text-outline"
                onPress={() => router.push({ pathname: '/support/[id]', params: { id: item.id } })}
              />
            </View>
          )}
        />
      )}

      <ActionBar
        icon="message-plus"
        label={t('support.createTicket')}
        onPress={() => router.push('/support/create')}
        testID="support-create"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg },
  list: {
    gap: spacing.sm,
    paddingBottom: 104,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  item: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...cardShadow,
  },
});
