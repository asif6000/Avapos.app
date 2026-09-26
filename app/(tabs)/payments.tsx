import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';

import { ActionBar } from '@/components/ActionBar';
import { AppHeader } from '@/components/AppHeader';
import { ListRow } from '@/components/ui/ListRow';
import { ListSkeleton } from '@/components/Skeleton';
import { paymentStatusBadge } from '@/components/StatusBadge';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { usePayments } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { cardShadow, radius, spacing, useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';
import { formatCurrency, formatDateTime, paymentStatusLabel } from '@/utils/format';
import type { Payment } from '@/types/domain';

export default function PaymentHistoryScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const signOut = useAuthStore((state) => state.signOut);
  const router = useRouter();
  const { data, isLoading, isRefetching, error, refetch } = usePayments(1);

  const payments = data?.items ?? [];
  const { gutter } = useLayout();

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
        <ErrorState message={error.message} onRetry={() => void refetch()} onSignOut={() => void signOut()} />
      ) : payments.length === 0 ? (
        <EmptyState
          icon="receipt-text-outline"
          title={t('payments.empty')}
          body={t('dashboard.noInstallment')}
        />
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(item: Payment) => item.id}
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
                title={formatCurrency(item.amount)}
                // `method` is whatever the gateway reported and is absent on some
                // orders; printing "undefined" beside a payment is not an option.
                subtitle={[formatDateTime(item.paidAt ?? item.createdAt, language), item.method]
                  .filter(Boolean)
                  .join(' · ')}
                trailingNode={paymentStatusBadge(item.status, paymentStatusLabel(item.status, t))}
                icon={item.status === 'SUCCESS' ? 'check-circle-outline' : 'alert-circle-outline'}
                onPress={() => router.push({ pathname: '/payments/[id]', params: { id: item.id } })}
              />
            </View>
          )}
        />
      )}

      <ActionBar
        icon="cash-plus"
        label={t('payments.payNow')}
        onPress={() => router.push('/payments/create')}
        testID="payments-pay"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.lg },
  // Room at the end so the last payment is never hidden behind the pay button.
  list: { gap: spacing.sm, paddingBottom: 104, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  item: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...cardShadow,
  },
});
