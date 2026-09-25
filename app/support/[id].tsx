import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { ListSkeleton } from '@/components/Skeleton';
import { StatusBadge, type BadgeTone } from '@/components/StatusBadge';
import { ErrorState } from '@/components/StateViews';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useTicket } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { formatDateTime, ticketStatusLabel } from '@/utils/format';
import { useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';
import type { TicketStatus } from '@/types/domain';

const TICKET_TONES: Record<TicketStatus, BadgeTone> = {
  OPEN: 'info',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export default function TicketDetailScreen() {
  const { gutter } = useLayout();
  const { t, language } = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useTicket(id);

  return (
    <Screen>
      <AppHeader title={t('support.myTickets')} />

      {isLoading ? (
        <View style={styles.content}>
          <ListSkeleton count={2} />
        </View>
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : data ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
          <SectionCard>
            <View style={styles.headerRow}>
              <Text variant="titleMedium" style={{ flex: 1, color: theme.colors.onSurface, fontWeight: '700' }}>
                {data.subject}
              </Text>
              <StatusBadge
                label={ticketStatusLabel(data.status, t)}
                tone={TICKET_TONES[data.status] ?? 'neutral'}
              />
            </View>
            <InfoRow label={t('support.created')} value={formatDateTime(data.createdAt, language)} />
            <InfoRow label={t('support.category')} value={data.category} tone="muted" />
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
              {data.message}
            </Text>
          </SectionCard>

          <SectionCard title={t('support.response')}>
            {data.response ? (
              <>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                  {data.response}
                </Text>
                <InfoRow
                  label={t('payments.date')}
                  value={formatDateTime(data.respondedAt, language)}
                  tone="muted"
                />
              </>
            ) : (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('support.awaitingResponse')}
              </Text>
            )}
          </SectionCard>
        </ScrollView>
      ) : (
        <ErrorState onRetry={() => void refetch()} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 12, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
