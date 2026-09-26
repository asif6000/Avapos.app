import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { ApiError } from '@/api/errors';
import { AppHeader } from '@/components/AppHeader';
import { DeviceSummaryCard } from '@/components/DeviceSummaryCard';
import { DueBanner } from '@/components/DueBanner';
import { InfoBanner } from '@/components/InfoBanner';
import { ListSkeleton } from '@/components/Skeleton';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { StatusBadge, deviceStateTone, type BadgeTone } from '@/components/StatusBadge';
import { AppButton } from '@/components/ui/AppButton';
import { ListRow } from '@/components/ui/ListRow';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { StatTile } from '@/components/ui/StatTile';
import { StepDisc } from '@/components/ui/StepDisc';
import { useDevice, useInstallmentPlan, usePayments } from '@/hooks/queries';
import { useInstallmentSource } from '@/hooks/useDataSources';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { CONTENT_MAX_WIDTH, hairline, radius, spacing, useLayout } from '@/theme/layout';
import type { AppTheme } from '@/theme/theme';
import {
  deviceStateLabel,
  formatCurrency,
  formatDate,
  installmentStatusLabel,
  paymentStatusLabel,
  percentOf,
} from '@/utils/format';
import type { Installment, InstallmentStatus } from '@/types/domain';

const STATUS_TONES: Record<InstallmentStatus, BadgeTone> = {
  PAID: 'success',
  DUE: 'info',
  OVERDUE: 'danger',
  UPCOMING: 'neutral',
  PARTIAL: 'warning',
};

const STATUS_ICONS: Record<InstallmentStatus, string> = {
  PAID: 'check-circle',
  DUE: 'clock-outline',
  OVERDUE: 'alert-circle-outline',
  UPCOMING: 'calendar-blank-outline',
  PARTIAL: 'clock-outline',
};

type TabKey = 'schedule' | 'history' | 'methods' | 'details';

export default function InstallmentsScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme<AppTheme>();
  const signOut = useAuthStore((state) => state.signOut);
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('schedule');

  const planQuery = useInstallmentPlan();
  const deviceQuery = useDevice();
  const paymentsQuery = usePayments();
  const schedule = useInstallmentSource();

  const plan = planQuery.data;
  const device = deviceQuery.data;
  const installments = schedule.data;
  const { gutter } = useLayout();

  const loading = planQuery.isLoading || schedule.isLoading;
  const error = (planQuery.error ?? schedule.error) as ApiError | null;

  /**
   * The installment the banner is about, taken from the schedule the server sent.
   * Never derived from the plan's totals: the banner and the row it points at
   * have to be the same number, and only the server knows which one is next.
   */
  const next: Installment | undefined =
    installments.find((item) => item.id === plan?.nextInstallmentId) ??
    installments.find((item) => item.status === 'OVERDUE' || item.status === 'DUE');

  const refresh = () => {
    void planQuery.refetch();
    void deviceQuery.refetch();
    schedule.refetch();
  };

  const payNext = () => {
    if (!next) {
      router.push('/(tabs)/payments');
      return;
    }
    router.push({ pathname: '/payments/create', params: { installmentId: next.id } });
  };

  const segments = [
    { key: 'schedule', label: t('installments.tabSchedule') },
    { key: 'history', label: t('installments.tabHistory') },
    { key: 'methods', label: t('installments.tabMethods') },
    { key: 'details', label: t('installments.tabDetails') },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title={t('installments.title')}
        subtitle={t('installments.subtitle')}
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
          {device ? (
            <DeviceSummaryCard
              name={device.name}
              model={device.model}
              statusLabel={deviceStateLabel(device.deviceState, t)}
              statusTone={deviceStateTone(device.deviceState)}
              figureLabel={t('installments.totalPrice')}
              figureValue={formatCurrency(plan?.totalPrice ?? 0)}
            />
          ) : null}

          {plan ? (
            <SectionCard style={styles.statCard}>
              {/* Four figures, one card, hairline-separated. The cells share the
                  line equally rather than taking a share of a two-column grid —
                  this row is the summary, and a grid that reflows it into two
                  rows of two would stop being one glanceable sentence. */}
              <View style={styles.statRow}>
                <StatTile
                  variant="plain"
                  style={styles.statCell}
                  label={t('installments.downPayment')}
                  value={formatCurrency(plan.downPayment)}
                />
                <View style={[styles.rule, { backgroundColor: theme.colors.outlineVariant }]} />
                <StatTile
                  variant="plain"
                  style={styles.statCell}
                  label={t('installments.paid')}
                  value={formatCurrency(plan.paidAmount)}
                />
                <View style={[styles.rule, { backgroundColor: theme.colors.outlineVariant }]} />
                <StatTile
                  variant="plain"
                  style={styles.statCell}
                  label={t('installments.remaining')}
                  value={formatCurrency(plan.remainingAmount)}
                />
                <View style={[styles.rule, { backgroundColor: theme.colors.outlineVariant }]} />
                <StatTile
                  variant="plain"
                  style={styles.statCell}
                  label={t('installments.monthly')}
                  value={formatCurrency(plan.installmentAmount)}
                />
              </View>
            </SectionCard>
          ) : null}

          {next ? (
            <DueBanner
              label={t('installments.nextDueTitle')}
              amount={formatCurrency(next.amount - next.paidAmount)}
              dueLabel={t('installments.dueDate')}
              dueValue={formatDate(next.dueDate, language)}
              ctaLabel={t('dashboard.payNow')}
              onPress={payNext}
              tone={next.status === 'OVERDUE' ? 'danger' : 'primary'}
              testID="installments-next-amount"
            />
          ) : null}

          <SegmentedTabs segments={segments} value={tab} onChange={(key) => setTab(key as TabKey)} />

          {tab === 'schedule' ? (
            installments.length === 0 ? (
              <EmptyState
                icon="calendar-blank-outline"
                title={t('installments.title')}
                body={t('dashboard.noInstallment')}
              />
            ) : (
              <>
                <SectionCard style={styles.list}>
                  {installments.map((installment, index) => (
                    <View
                      key={installment.id}
                      style={index > 0 ? [styles.listDivider, { borderTopColor: theme.colors.outlineVariant }] : undefined}
                    >
                      <ListRow
                        title={`${t('installments.item')} ${installment.number}`}
                        subtitle={
                          installment.status === 'PAID' && installment.paidAt
                            ? t('installments.paidOn', { date: formatDate(installment.paidAt, language) })
                            : t('installments.dueOn', { date: formatDate(installment.dueDate, language) })
                        }
                        trailing={formatCurrency(installment.amount)}
                        trailingNode={
                          <StatusBadge
                            label={installmentStatusLabel(installment.status, t)}
                            tone={STATUS_TONES[installment.status] ?? 'neutral'}
                            icon={STATUS_ICONS[installment.status]}
                          />
                        }
                        leading={<StepDisc number={installment.number} state={stepState(installment)} />}
                        onPress={() =>
                          router.push({ pathname: '/installments/[id]', params: { id: installment.id } })
                        }
                      />
                    </View>
                  ))}
                </SectionCard>
                <InfoBanner body={t('installments.keepOnTime')} />
              </>
            )
          ) : null}

          {tab === 'history' ? (
            <SectionCard style={styles.list}>
              {(paymentsQuery.data?.items.length ?? 0) === 0 ? (
                <EmptyState title={t('payments.title')} body={t('payments.empty')} />
              ) : (
                paymentsQuery.data?.items.map((payment) => (
                  <ListRow
                    key={payment.id}
                    title={formatCurrency(payment.amount)}
                    subtitle={payment.paidAt ? formatDate(payment.paidAt, language) : payment.transactionId}
                    trailingNode={
                      <StatusBadge
                        label={paymentStatusLabel(payment.status, t)}
                        tone={payment.status === 'SUCCESS' ? 'success' : payment.status === 'FAILED' ? 'danger' : 'warning'}
                      />
                    }
                    icon="receipt-text-outline"
                    onPress={() => router.push({ pathname: '/payments/[id]', params: { id: payment.id } })}
                  />
                ))
              )}
            </SectionCard>
          ) : null}

          {tab === 'methods' ? (
            <SectionCard>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('installments.methodsBody')}
              </Text>
              <AppButton
                block
                size="lg"
                icon="cash-plus"
                label={t('dashboard.payNow')}
                onPress={payNext}
                disabled={!next}
              />
            </SectionCard>
          ) : null}

          {tab === 'details' && plan ? (
            <SectionCard>
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
        </ScrollView>
      )}
    </View>
  );
}

/** The disc mirrors the row's own state, so the column reads as a progress bar. */
function stepState(installment: Installment): 'done' | 'current' | 'upcoming' {
  if (installment.status === 'PAID') return 'done';
  if (installment.status === 'DUE' || installment.status === 'OVERDUE' || installment.status === 'PARTIAL') {
    return 'current';
  }
  return 'upcoming';
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  statCard: { paddingVertical: spacing.md },
  statRow: { flexDirection: 'row', alignItems: 'stretch', flexWrap: 'nowrap', gap: spacing.sm },
  statCell: { flexBasis: 0, flexGrow: 1, flexShrink: 1 },
  rule: { width: hairline, marginVertical: spacing.xs },
  // One card holding the whole schedule: a card per installment made the list
  // look like a page of unrelated boxes instead of a timeline.
  list: { padding: 0, gap: 0, overflow: 'hidden', borderRadius: radius.lg },
  listDivider: { borderTopWidth: hairline },
});
