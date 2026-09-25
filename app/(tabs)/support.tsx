import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { FAB, Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { ListSkeleton } from '@/components/Skeleton';
import { StatusBadge, type BadgeTone } from '@/components/StatusBadge';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useTickets } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { formatDateTime, ticketStatusLabel } from '@/utils/format';
import type { SupportTicket, TicketStatus } from '@/types/domain';

const TICKET_TONES: Record<TicketStatus, BadgeTone> = {
  OPEN: 'info',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export default function SupportHomeScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { data, isLoading, isRefetching, error, refetch } = useTickets(1);

  const tickets = data?.items ?? [];

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader title={t('support.title')} back={false} />

      {isLoading ? (
        <View style={styles.content}>
          <ListSkeleton count={3} />
        </View>
      ) : error && error.kind !== 'network' ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : tickets.length === 0 ? (
        <EmptyState title={t('support.myTickets')} body={t('support.noTickets')} />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item: SupportTicket) => item.id}
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
              onPress={() => router.push({ pathname: '/support/[id]', params: { id: item.id } })}
              accessibilityRole="button"
              testID={`ticket-${item.id}`}
            >
              <SectionCard>
                <View style={styles.itemHeader}>
                  <Text
                    variant="titleMedium"
                    numberOfLines={1}
                    style={{ flex: 1, color: theme.colors.onSurface, fontWeight: '700' }}
                  >
                    {item.subject}
                  </Text>
                  <StatusBadge
                    label={ticketStatusLabel(item.status, t)}
                    tone={TICKET_TONES[item.status] ?? 'neutral'}
                  />
                </View>
                <InfoRow
                  label={t('support.created')}
                  value={formatDateTime(item.createdAt, language)}
                  tone="muted"
                />
                <Text variant="bodySmall" numberOfLines={2} style={{ color: theme.colors.onSurfaceVariant }}>
                  {item.message}
                </Text>
              </SectionCard>
            </Pressable>
          )}
        />
      )}

      <FAB
        icon="message-plus"
        label={t('support.createTicket')}
        style={styles.fab}
        onPress={() => router.push('/support/create')}
        testID="support-fab"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16 },
  list: { padding: 16, gap: 12, paddingBottom: 96 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
