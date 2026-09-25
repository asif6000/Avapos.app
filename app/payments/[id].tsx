import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { ApiError } from '@/api/errors';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { ListSkeleton } from '@/components/Skeleton';
import { paymentStatusBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/StateViews';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { usePayment } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { formatCurrency, formatDateTime, paymentStatusLabel } from '@/utils/format';
import { useLayout, spacing, CONTENT_MAX_WIDTH } from '@/theme/layout';

export default function PaymentDetailScreen() {
  const { gutter } = useLayout();
  const { t, language } = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = usePayment(id);

  return (
    <Screen>
      <AppHeader title={t('payments.history')} />

      {isLoading ? (
        <View style={styles.content}>
          <ListSkeleton count={1} />
        </View>
      ) : error instanceof ApiError && error.kind !== 'network' ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : data ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
          <SectionCard>
            <View style={styles.headerRow}>
              <Text
                variant="titleMedium"
                numberOfLines={2}
                style={{ color: theme.colors.onSurface, fontWeight: '700', flex: 1, minWidth: 0 }}
              >
                {formatCurrency(data.amount)}
              </Text>
              {paymentStatusBadge(data.status, paymentStatusLabel(data.status, t))}
            </View>
            <InfoRow label={t('payments.transaction')} value={data.transactionId} />
            <InfoRow label={t('payments.installmentNumber')} value={data.installmentNumber ?? '—'} />
            <InfoRow label={t('payments.method')} value={data.method} />
            <InfoRow label={t('payments.date')} value={formatDateTime(data.paidAt ?? data.createdAt, language)} />
            <InfoRow label={t('payments.status')} value={paymentStatusLabel(data.status, t)} tone="muted" />
          </SectionCard>

          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('common.readOnly')}
          </Text>
        </ScrollView>
      ) : (
        <ErrorState onRetry={() => void refetch()} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 12, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
});
