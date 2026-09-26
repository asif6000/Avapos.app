import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AmountProgress } from '@/components/AmountProgress';
import { AppButton } from '@/components/ui/AppButton';
import { StatTile } from '@/components/ui/StatTile';
import { AppIcon } from '@/components/AppIcon';
import { AppHeader } from '@/components/AppHeader';
import { DueBanner } from '@/components/DueBanner';
import { OfflineBanner } from '@/components/OfflineBanner';
import { DashboardSkeleton } from '@/components/Skeleton';
import { deviceStateBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/StateViews';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { isRenderableState } from '@/api/dashboardState';
import { defaultMessageFor, type ApiError } from '@/api/errors';
import { useHomeSummary } from '@/hooks/useHomeSummary';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/store/networkStore';
import { CONTENT_MAX_WIDTH, radius, spacing, useLayout } from '@/theme/layout';
import { deviceStateLabel, formatCurrency, formatDate, percentOf } from '@/utils/format';

/**
 * Home.
 *
 * SEVEN STATES, DECIDED IN ONE PLACE
 *
 * `useHomeSummary` works out which of them this is — loading, a network failure,
 * a dead session, a session the server cannot match to a customer, a customer
 * with no plan, a customer with no phone, or the ordinary full account — and this
 * file only decides what each one looks like. That split exists because the seven
 * are genuinely different facts, and the screen used to collapse all of them into
 * one full-screen error with one sentence under it.
 *
 * The sentence was "The requested information was not found.", on a screen whose
 * only request was `GET /customer/dashboard` — a route that answers 404 on any
 * server it has not been deployed to. Nothing about that is the customer's
 * information, and saying it was made a phone whose account was perfectly intact
 * look broken.
 *
 * A customer with a real account and no installment or no phone is NOT an error
 * at all, and never renders as one: the screen is the whole app's front door, and
 * an empty account is a normal state for an account to be in the day it is
 * created.
 */
export default function DashboardScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const signOut = useAuthStore((state) => state.signOut);
  const router = useRouter();
  const online = useNetworkStore((state) => state.online);
  const { data, state, isRefetching, error, refetch } = useHomeSummary();

  const { gutter } = useLayout();
  const profile = data?.customer;
  const device = data?.device;
  const plan = data?.plan;
  const next = data?.nextInstallment;

  // The header is rendered in every state, including the failing ones. It used to
  // be dropped along with the content, which meant a broken Home removed the only
  // route to Settings — and Sign out lives there.
  const header = (
    <AppHeader
      title={t('common.appName')}
      back={false}
      action={{
        icon: 'bell-outline',
        label: t('notifications.title'),
        badge: data?.unreadNotificationCount,
        onPress: () => router.push('/notifications'),
      }}
    />
  );

  if (state === 'loading') {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        {header}
        <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
          <DashboardSkeleton />
        </ScrollView>
      </View>
    );
  }

  // A failed request must never be rendered as "no device", "no plan" or
  // "৳0". Those read as facts about the customer's account, and they would hide
  // an outage behind a perfectly plausible-looking screen.
  //
  // So each failure names itself. What none of them may ever do is blame the
  // customer's data for a problem on our side of the wire.
  if (!isRenderableState(state)) {
    const copy = failureCopy(state, t, { online, error });
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        {header}
        <ErrorState
          title={copy.title}
          message={copy.body}
          onRetry={() => void refetch()}
          onSignOut={() => void signOut()}
        />
      </View>
    );
  }

  const paidRatio = plan ? percentOf(plan.paidAmount, plan.totalPrice) : 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {header}

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

        <SectionCard style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroTitle}>
              <Text
                variant="labelMedium"
                numberOfLines={1}
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {device?.name ?? t('dashboard.noDevice')}
              </Text>
              {plan ? (
                <Text
                  variant="headlineMedium"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={[styles.heroAmount, { color: theme.colors.primary }]}
                  testID="dashboard-remaining"
                >
                  {formatCurrency(plan.remainingAmount, { compact: true })}
                </Text>
              ) : (
                // No plan means no figure. The largest, bluest number on the
                // screen used to read "৳0" here, which is a claim — that a
                // customer with no contract owes nothing on a phone that costs
                // money. The empty state says what is actually true.
                <Text
                  variant="titleMedium"
                  style={{ color: theme.colors.onSurface, fontWeight: '700' }}
                  testID="dashboard-no-plan"
                >
                  {t('dashboard.noPlanTitle')}
                </Text>
              )}
            </View>
            {device ? deviceStateBadge(device.deviceState, deviceStateLabel(device.deviceState, t)) : null}
          </View>

          {plan ? <AmountProgress paid={plan.paidAmount} total={plan.totalPrice} /> : null}

          {plan ? (
            <View style={styles.metricRow}>
              <StatTile
                label={t('installments.totalPrice')}
                value={formatCurrency(plan.totalPrice)}
              />
              <StatTile
                label={t('installments.installmentAmount')}
                value={formatCurrency(plan.installmentAmount)}
              />
            </View>
          ) : (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('dashboard.noPlanBody')}
            </Text>
          )}

          <AppButton
            variant="outline"
            block
            icon="cellphone"
            label={t('dashboard.myDevice')}
            onPress={() => router.push('/(tabs)/device')}
          />
        </SectionCard>

        {next ? (
          <DueBanner
            label={t('installments.nextDueTitle')}
            amount={formatCurrency(next.amount)}
            dueLabel={t('installments.dueDate')}
            dueValue={next.dueDate ? formatDate(next.dueDate, language) : '—'}
            ctaLabel={t('dashboard.payNow')}
            onPress={() =>
              router.push({ pathname: '/payments/create', params: { installmentId: next.id } })
            }
            testID="dashboard-next-amount"
          />
        ) : null}

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
          // The account is real; the contract is not, yet. This is the single most
          // common state for a customer created moments ago, and it is a sentence
          // inside the normal screen rather than a page that says something failed.
          <SectionCard title={t('installments.title')}>
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

/** What each failing state says, and what it must never say. */
function failureCopy(
  state: ReturnType<typeof useHomeSummary>['state'],
  t: ReturnType<typeof useTranslation>['t'],
  context: { online: boolean; error: ApiError | null },
): { title: string; body: string } {
  const { error } = context;
  const kind = error?.kind;

  switch (state) {
    case 'auth_error':
      // No session to be refused. Saying anything about the account would be a
      // guess; the only honest instruction is to sign in again.
      return { title: t('errors.sessionTitle'), body: t('errors.sessionBody') };

    case 'customer_not_found':
      // The sign-in worked. The server simply has no customer behind it, which is
      // what a session that was never linked to a `profiles` row looks like. The
      // remedy is at the store, so that is what the copy says.
      return { title: t('errors.customerMissingTitle'), body: t('errors.customerMissingBody') };

    case 'network_error':
      return {
        title: t(context.online ? 'errors.networkTitle' : 'errors.offlineTitle'),
        body: error?.message ?? defaultMessageFor(kind ?? 'network'),
      };

    case 'service_error':
    default:
      // A route this server build does not have, a 5xx, or a 200 that was not the
      // view we asked for. Surfaced as itself — never suppressed, never dressed
      // up as a fact about the customer's account.
      if (kind === 'unavailable') {
        return { title: t('errors.unavailableTitle'), body: t('errors.unavailableBody') };
      }
      return {
        title: t('errors.generic'),
        body: error?.message ?? defaultMessageFor(kind ?? 'server'),
      };
  }
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
  heroAmount: { fontWeight: '800', letterSpacing: -1 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
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
