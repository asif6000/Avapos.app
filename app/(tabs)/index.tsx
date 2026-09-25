import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AmountProgress } from '@/components/AmountProgress';
import { AppButton } from '@/components/ui/AppButton';
import { StatTile } from '@/components/ui/StatTile';
import { AppIcon } from '@/components/AppIcon';
import { AppHeader } from '@/components/AppHeader';
import { OfflineBanner } from '@/components/OfflineBanner';
import { DashboardSkeleton } from '@/components/Skeleton';
import { deviceStateBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/StateViews';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useDashboard } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/store/networkStore';
import { CONTENT_MAX_WIDTH, radius, spacing, useLayout } from '@/theme/layout';
import { deviceStateLabel, formatCurrency, formatDate, percentOf } from '@/utils/format';

export default function DashboardScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const signOut = useAuthStore((state) => state.signOut);
  const router = useRouter();
  const online = useNetworkStore((state) => state.online);
  const { data, isLoading, isRefetching, error, refetch } = useDashboard();

  const { gutter } = useLayout();
  const profile = data?.customer;
  const device = data?.device;
  const plan = data?.plan;
  const next = data?.nextInstallment;

  if (isLoading) {
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
        <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
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
        <AppHeader
          title={t('common.appName')}
          back={false}
          action={{
            icon: 'bell-outline',
            label: t('notifications.title'),
            onPress: () => router.push('/notifications'),
          }}
        />
        <ErrorState message={error.message} onRetry={() => void refetch()} onSignOut={() => void signOut()} />
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
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
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

        <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('dashboard.greeting', { name: profile?.fullName ?? '' })}
        </Text>

        <SectionCard style={styles.heroCard} tone="primary">
          <View style={styles.heroHeader}>
            <View style={styles.heroTitle}>
              <Text
                variant="labelMedium"
                numberOfLines={1}
                style={{ color: theme.colors.onPrimaryContainer }}
              >
                {device?.name ?? t('dashboard.noDevice')}
              </Text>
              <Text
                variant="displaySmall"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={{ color: theme.colors.onPrimaryContainer, fontWeight: '800', letterSpacing: -1 }}
                testID="dashboard-remaining"
              >
                {formatCurrency(plan?.remainingAmount ?? 0, { compact: true })}
              </Text>
            </View>
            {device ? deviceStateBadge(device.deviceState, deviceStateLabel(device.deviceState, t)) : null}
          </View>

          <AmountProgress paid={plan?.paidAmount ?? 0} total={plan?.totalPrice ?? 0} />

          <View style={styles.metricRow}>
            <StatTile
              label={t('dashboard.nextInstallment')}
              value={formatCurrency(next?.amount ?? plan?.installmentAmount ?? 0)}
            />
            <StatTile
              label={t('dashboard.dueDate')}
              value={next?.dueDate ? formatDate(next.dueDate, language) : '—'}
            />
          </View>

          <View style={styles.primaryActions}>
            <AppButton
              size="lg"
              block
              icon="cash-plus"
              label={t('dashboard.payNow')}
              testID="dashboard-pay"
              onPress={() =>
                router.push(
                  next
                    ? { pathname: '/payments/create', params: { installmentId: next.id } }
                    : '/payments',
                )
              }
            />
            <AppButton
              variant="outline"
              block
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
  // Width-capped and centred by `useLayout`'s gutter below, so a tablet or a
  // landscape phone does not stretch one column of text across the screen.
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  heroCard: { gap: spacing.lg },
  heroHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heroTitle: { flex: 1, gap: 2, minWidth: 0 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  primaryActions: { gap: spacing.sm },
  secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickAction: {
    flexGrow: 1,
    flexBasis: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
});
