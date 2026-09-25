import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AmountProgress } from '@/components/AmountProgress';
import { AppIcon } from '@/components/AppIcon';
import { AppHeader } from '@/components/AppHeader';
import { OfflineBanner } from '@/components/OfflineBanner';
import { DashboardSkeleton } from '@/components/Skeleton';
import { deviceStateBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/StateViews';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useDashboard } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { useNetworkStore } from '@/store/networkStore';
import { deviceStateLabel, formatCurrency, formatDate, percentOf } from '@/utils/format';

export default function DashboardScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const online = useNetworkStore((state) => state.online);
  const { data, isLoading, isRefetching, error, refetch } = useDashboard();

  const profile = data?.customer;
  const device = data?.device;
  const plan = data?.plan;
  const next = data?.nextInstallment;

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader title={t('common.appName')} back={false} />
        <ScrollView contentContainerStyle={styles.content}>
          <DashboardSkeleton />
        </ScrollView>
      </View>
    );
  }

  // A failed request must never be rendered as "no device", "no plan" or
  // "৳0". Those read as facts about the customer's account, and they would hide
  // an outage behind a perfectly plausible-looking screen.
  if (error) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <AppHeader title={t('common.appName')} back={false} />
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </View>
    );
  }

  const paidRatio = plan ? percentOf(plan.paidAmount, plan.totalPrice) : 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title={t('common.appName')}
        back={false}
        action={{
          icon: 'bell-outline',
          label: t('notifications.title'),
          onPress: () => router.push('/notifications'),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            colors={[theme.colors.primary]}
            enabled={online}
          />
        }
      >
        {!online ? <OfflineBanner /> : null}

        <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('dashboard.greeting', { name: profile?.fullName ?? '' })}
        </Text>

        <SectionCard style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {device?.name ?? t('dashboard.noDevice')}
              </Text>
              <Text
                variant="headlineMedium"
                style={{ color: theme.colors.onSurface, fontWeight: '800' }}
                testID="dashboard-remaining"
              >
                {formatCurrency(plan?.remainingAmount ?? 0, { compact: true })}
              </Text>
            </View>
            {device ? deviceStateBadge(device.deviceState, deviceStateLabel(device.deviceState, t)) : null}
          </View>

          <AmountProgress paid={plan?.paidAmount ?? 0} total={plan?.totalPrice ?? 0} />

          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('dashboard.nextInstallment')}
              </Text>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
                {formatCurrency(next?.amount ?? plan?.installmentAmount ?? 0)}
              </Text>
            </View>
            <View style={styles.metric}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('dashboard.dueDate')}
              </Text>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
                {next?.dueDate ? formatDate(next.dueDate, language) : '—'}
              </Text>
            </View>
          </View>

          <View style={styles.primaryActions}>
            <QuickAction
              icon="cash-plus"
              label={t('dashboard.payNow')}
              onPress={() =>
                router.push(
                  next
                    ? { pathname: '/payments/create', params: { installmentId: next.id } }
                    : '/payments',
                )
              }
              primary
            />
            <QuickAction
              icon="cellphone"
              label={t('dashboard.myDevice')}
              onPress={() => router.push('/(tabs)/device')}
            />
          </View>
        </SectionCard>

        {plan ? (
          <SectionCard title={t('installments.title')}>
            <InfoRow label={t('dashboard.totalPrice')} value={formatCurrency(plan.totalPrice)} />
            <InfoRow label={t('installments.downPayment')} value={formatCurrency(plan.downPayment)} />
            <InfoRow label={t('dashboard.totalPaid')} value={formatCurrency(plan.paidAmount)} />
            <InfoRow
              label={t('installments.paidCount')}
              value={`${plan.paidInstallments} / ${plan.totalInstallments}`}
              tone="muted"
            />
          </SectionCard>
        ) : (
          <SectionCard>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('dashboard.noInstallment')}
            </Text>
          </SectionCard>
        )}

        <View style={styles.secondaryActions}>
          <QuickAction
            icon="calendar-clock"
            label={t('dashboard.installments')}
            onPress={() => router.push('/(tabs)/installments')}
          />
          <QuickAction
            icon="history"
            label={t('dashboard.paymentHistory')}
            onPress={() => router.push('/(tabs)/payments')}
          />
          <QuickAction
            icon="lifebuoy"
            label={t('dashboard.support')}
            onPress={() => router.push('/(tabs)/support')}
          />
          <QuickAction
            icon="cog-outline"
            label={t('settings.title')}
            onPress={() => router.push('/settings')}
          />
        </View>

        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('common.appName')} · {paidRatio}% {t('installments.paid').toLowerCase()}
        </Text>
      </ScrollView>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  primary = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`quick-action-${label}`}
      style={({ pressed }) => [
        styles.quickAction,
        {
          backgroundColor: primary ? theme.colors.primary : theme.colors.surface,
          borderColor: primary ? theme.colors.primary : theme.colors.outlineVariant,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <AppIcon
        name={icon}
        size={20}
        color={primary ? theme.colors.onPrimary : theme.colors.primary}
      />
      <Text
        variant="labelMedium"
        numberOfLines={1}
        style={{
          color: primary ? theme.colors.onPrimary : theme.colors.onSurface,
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  heroCard: { gap: 16 },
  heroHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  metricRow: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, gap: 2 },
  primaryActions: { gap: 10 },
  secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
  },
});
