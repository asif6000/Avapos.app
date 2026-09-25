import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { FAB, Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { ListSkeleton } from '@/components/Skeleton';
import { paymentStatusBadge } from '@/components/StatusBadge';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { usePayments } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { formatCurrency, formatDateTime, paymentStatusLabel } from '@/utils/format';
import type { Payment } from '@/types/domain';

export default function PaymentHistoryScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { data, isLoading, isRefetching, error, refetch } = usePayments(1);

  const payments = data?.items ?? [];

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title={t('payments.history')}
        back={false}
        action={{ icon: 'bell-outline', label: t('notifications.title'), onPress: () => router.push('/notifications') }}
      />

      {isLoading ? (
        <View style={styles.content}>
          <ListSkeleton count={4} />
        </View>
      ) : error && error.kind !== 'network' ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : payments.length === 0 ? (
        <EmptyState title={t('payments.empty')} body={t('dashboard.noInstallment')} />
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(item: Payment) => item.id}
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
              onPress={() => router.push({ pathname: '/payments/[id]', params: { id: item.id } })}
              accessibilityRole="button"
              testID={`payment-${item.id}`}
            >
              <SectionCard>
                <View style={styles.itemHeader}>
                  <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
                    {formatCurrency(item.amount)}
                  </Text>
                  {paymentStatusBadge(item.status, paymentStatusLabel(item.status, t))}
                </View>
                <InfoRow
                  label={t('payments.date')}
                  value={formatDateTime(item.paidAt ?? item.createdAt, language)}
                  tone="muted"
                />
                <InfoRow label={t('payments.method')} value={item.method} tone="muted" />
                <InfoRow label={t('payments.transaction')} value={item.transactionId} tone="muted" />
              </SectionCard>
            </Pressable>
          )}
        />
      )}

      <FAB
        icon="cash-plus"
        label={t('payments.payNow')}
        style={styles.fab}
        onPress={() => router.push('/payments/create')}
        testID="payments-fab"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16 },
  list: { padding: 16, gap: 12, paddingBottom: 96 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
