import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { ApiError } from '@/api/errors';
import { AmountProgress } from '@/components/AmountProgress';
import { ListRow } from '@/components/ui/ListRow';
import { AppHeader } from '@/components/AppHeader';
import { ListSkeleton } from '@/components/Skeleton';
import { StatusBadge, type BadgeTone } from '@/components/StatusBadge';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useInstallmentPlan } from '@/hooks/queries';
import { useInstallmentSource } from '@/hooks/useDataSources';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { CONTENT_MAX_WIDTH, spacing, useLayout } from '@/theme/layout';
import { formatCurrency, formatDate, installmentStatusLabel, percentOf } from '@/utils/format';
import type { InstallmentStatus } from '@/types/domain';

const STATUS_TONES: Record<InstallmentStatus, BadgeTone> = {
  PAID: 'success',
  DUE: 'warning',
  OVERDUE: 'danger',
  UPCOMING: 'neutral',
  PARTIAL: 'info',
};

export default function InstallmentsScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const signOut = useAuthStore((state) => state.signOut);
  const router = useRouter();
  const planQuery = useInstallmentPlan();
  const schedule = useInstallmentSource();

  const plan = planQuery.data;
  const installments = schedule.data;
  const loading = planQuery.isLoading || schedule.isLoading;
  const error = (planQuery.error ?? schedule.error) as ApiError | null;

  const { gutter } = useLayout();

  const refresh = () => {
    void planQuery.refetch();
    schedule.refetch();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title={t('installments.title')}
        back={false}
        action={{ icon: 'bell-outline', label: t('notifications.title'), onPress: () => router.push('/notifications') }}
      />

      {loading ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
          <ListSkeleton count={4} />
        </ScrollView>
      ) : error && error.kind !== 'network' ? (
        <ErrorState message={error.message} onRetry={refresh} onSignOut={() => void signOut()} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
          refreshControl={
            <RefreshControl
              refreshing={planQuery.isRefetching}
              onRefresh={refresh}
              colors={[theme.colors.primary]}
            />
          }
        >
          {plan ? (
            <SectionCard>
              <AmountProgress
                paid={plan.paidAmount}
                total={plan.totalPrice}
                label={t('dashboard.totalPaid')}
              />
              <InfoRow label={t('installments.totalPrice')} value={formatCurrency(plan.totalPrice)} />
              <InfoRow label={t('installments.downPayment')} value={formatCurrency(plan.downPayment)} />
              <InfoRow label={t('installments.paid')} value={formatCurrency(plan.paidAmount)} />
              <InfoRow
                label={t('installments.remaining')}
                value={formatCurrency(plan.remainingAmount)}
                tone="strong"
              />
              <InfoRow
                label={t('installments.installmentAmount')}
                value={formatCurrency(plan.installmentAmount)}
              />
              <InfoRow
                label={t('installments.paidCount')}
                value={`${plan.paidInstallments} / ${plan.totalInstallments} (${percentOf(plan.paidInstallments, plan.totalInstallments)}%)`}
              />
              <InfoRow
                label={t('installments.nextDue')}
                value={plan.nextDueDate ? formatDate(plan.nextDueDate, language) : '—'}
              />
              <InfoRow label={t('installments.contractStatus')} value={plan.status} tone="muted" />
            </SectionCard>
          ) : null}

          <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
            {t('installments.timeline')}
          </Text>

          {installments.length === 0 ? (
            <EmptyState
              icon="calendar-blank-outline"
              title={t('installments.title')}
              body={t('dashboard.noInstallment')}
            />
          ) : (
            <SectionCard style={styles.list}>
              {installments.map((installment, index) => (
                <View key={installment.id} style={index > 0 ? styles.listDivider : undefined}>
                  <ListRow
                    title={`${t('installments.title')} ${installment.number}`}
                    subtitle={formatDate(installment.dueDate, language)}
                    trailing={formatCurrency(installment.amount)}
                    trailingNode={
                      <StatusBadge
                        label={installmentStatusLabel(installment.status, t)}
                        tone={STATUS_TONES[installment.status] ?? 'neutral'}
                      />
                    }
                    icon={installment.status === 'PAID' ? 'check-circle-outline' : 'calendar-clock'}
                    onPress={() =>
                      router.push({ pathname: '/installments/[id]', params: { id: installment.id } })
                    }
                  />
                </View>
              ))}
            </SectionCard>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  // One card holding the whole schedule: a card per installment made the list
  // look like a page of unrelated boxes instead of a timeline.
  list: { padding: 0, gap: 0, overflow: 'hidden' },
  listDivider: { borderTopColor: undefined },
});
