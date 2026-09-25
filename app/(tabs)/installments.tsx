import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { ApiError } from '@/api/errors';
import { AmountProgress } from '@/components/AmountProgress';
import { AppHeader } from '@/components/AppHeader';
import { ListSkeleton } from '@/components/Skeleton';
import { StatusBadge, type BadgeTone } from '@/components/StatusBadge';
import { ErrorState } from '@/components/StateViews';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useInstallmentPlan } from '@/hooks/queries';
import { useInstallmentSource } from '@/hooks/useDataSources';
import { useTranslation } from '@/hooks/useTheme';
import { formatCurrency, formatDate, percentOf } from '@/utils/format';
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
  const router = useRouter();
  const planQuery = useInstallmentPlan();
  const schedule = useInstallmentSource();

  const plan = planQuery.data;
  const installments = schedule.data;
  const loading = planQuery.isLoading || schedule.isLoading;
  const error = (planQuery.error ?? schedule.error) as ApiError | null;

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
        <ScrollView contentContainerStyle={styles.content}>
          <ListSkeleton count={4} />
        </ScrollView>
      ) : error && error.kind !== 'network' ? (
        <ErrorState message={error.message} onRetry={refresh} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
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
            <SectionCard>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('dashboard.noInstallment')}
              </Text>
            </SectionCard>
          ) : (
            installments.map((installment) => (
              <Pressable
                key={installment.id}
                onPress={() => router.push({ pathname: '/installments/[id]', params: { id: installment.id } })}
                accessibilityRole="button"
                testID={`installment-${installment.number}`}
              >
                <SectionCard>
                  <View style={styles.itemHeader}>
                    <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
                      {t('installments.title')} {installment.number}
                    </Text>
                    <StatusBadge
                      label={installment.status}
                      tone={STATUS_TONES[installment.status] ?? 'neutral'}
                    />
                  </View>
                  <InfoRow
                    label={t('payments.amount')}
                    value={formatCurrency(installment.amount)}
                    tone="strong"
                  />
                  <InfoRow
                    label={t('installments.nextDue')}
                    value={formatDate(installment.dueDate, language)}
                    tone="muted"
                  />
                </SectionCard>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
