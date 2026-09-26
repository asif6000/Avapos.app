import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/Screen';
import { ListSkeleton } from '@/components/Skeleton';
import { deviceStateBadge } from '@/components/StatusBadge';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useDeviceStatus, useSyncDevice } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { deviceManagementService } from '@/services/deviceManagement';
import type { CheckInResult } from '@/services/deviceCheckIn';
import { deviceStateLabel, formatCurrency, formatDate } from '@/utils/format';
import { useLayout, spacing, CONTENT_MAX_WIDTH } from '@/theme/layout';

/**
 * Customer-facing restriction status.
 *
 * This is an ordinary app screen, not an imitation of an Android system screen.
 *
 * It reports what the backend has authorized, and it says the two things a customer
 * in this position actually needs to hear, which is why they are here rather than
 * hidden behind a support call:
 *
 * - **When this ends.** If the phone is locked, the lock is a lease and the expiry is
 *   printed on the screen. The customer can read when they get their phone back
 *   without ringing anybody, and it is the same number the agent will use whether or
 *   not this app is running.
 * - **Whether anything is enforcing it at all.** On a phone the shop never
 *   provisioned, this screen says the phone is not managed and that the shop cannot
 *   lock it. Claiming a restriction that no agent is behind would be the worst lie
 *   this app could tell, so capability is checked and the answer shown plainly.
 */
export default function DeviceRestrictionScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const { gutter } = useLayout();
  const router = useRouter();
  const { data, isLoading, refetch } = useDeviceStatus();
  const sync = useSyncDevice();

  const [checking, setChecking] = useState(false);
  const [checkIn, setCheckIn] = useState<CheckInResult | null>(null);

  const refresh = async () => {
    await refetch();
    await sync.mutateAsync().catch(() => undefined);
  };

  const onCheckNow = useCallback(async () => {
    setChecking(true);
    try {
      setCheckIn(await deviceManagementService.checkIn());
      await refresh();
    } finally {
      setChecking(false);
    }
  }, [refresh]);

  const leaseEndsAt = checkIn?.report?.leaseExpiresAt ?? null;
  const canEnforce = checkIn?.capable === true && checkIn?.report?.isDeviceOwner === true;

  return (
    <Screen>
      <AppHeader title={t('device.restrictedTitle')} />
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
        {isLoading ? (
          <ListSkeleton count={1} />
        ) : (
          <>
            <SectionCard style={{ borderColor: theme.colors.error }}>
              <View style={styles.headerRow}>
                <Text
                  variant="titleLarge"
                  numberOfLines={2}
                  style={{ color: theme.colors.onSurface, fontWeight: '700', flex: 1, minWidth: 0 }}
                >
                  {t('device.restrictedTitle')}
                </Text>
                {data ? deviceStateBadge(data.deviceState, deviceStateLabel(data.deviceState, t)) : null}
              </View>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {data?.restrictionReason ?? t('device.restrictedBody')}
              </Text>
              {data?.outstandingAmount ? (
                <InfoRow
                  label={t('device.outstanding')}
                  value={formatCurrency(data.outstandingAmount)}
                  tone="strong"
                />
              ) : null}
              {data?.dueDate ? (
                <InfoRow label={t('device.dueDate')} value={formatDate(data.dueDate, language)} />
              ) : null}
            </SectionCard>

            {/*
              Only rendered once something has actually been asked. Showing an empty
              "nothing to do" card above a customer's overdue balance would be noise,
              and the check-in button is there for them to press when they want it.
            */}
            {checkIn ? (
              <SectionCard>
                <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
                  {canEnforce ? t('device.restrictedTitle') : t('device.noEnforcement')}
                </Text>

                {/* The lease. The most important row on the screen. */}
                {leaseEndsAt ? (
                  <InfoRow
                    label={t('device.restrictedTitle')}
                    value={t('device.unlocksItself', { time: formatDate(new Date(leaseEndsAt).toISOString(), language) })}
                    tone="strong"
                  />
                ) : null}

                {checkIn.expiredLeaseReleased ? (
                  <Text variant="bodyMedium" style={{ color: theme.colors.primary }}>
                    {t('device.leaseEnded')}
                  </Text>
                ) : null}

                {checkIn.report?.isScreenLocked ? (
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {t('device.screenLockedNow')}
                  </Text>
                ) : null}

                {/*
                  A phone with no screen lock of its own cannot meaningfully be
                  locked, and saying so is more useful than implying it can.
                */}
                {canEnforce && checkIn.report && !checkIn.report.isScreenSecure ? (
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {t('device.screenNotSecure')}
                  </Text>
                ) : null}

                {checkIn.note ? (
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {checkIn.note === 'Nothing to do.' ? t('device.commandNothingToDo') : checkIn.note}
                  </Text>
                ) : null}

                {checkIn.outcomes.map((outcome) => (
                  <Text
                    key={outcome.id}
                    variant="bodyMedium"
                    style={{
                      color:
                        outcome.outcome === 'APPLIED'
                          ? theme.colors.onSurfaceVariant
                          : theme.colors.error,
                    }}
                  >
                    {outcome.outcome === 'APPLIED'
                      ? t('device.commandApplied', { action: t(`device.action${cap(outcome.action)}`) })
                      : outcome.outcome === 'FAILED'
                        ? t('device.commandFailed', { action: t(`device.action${cap(outcome.action)}`) })
                        : t('device.commandRefused', { action: t(`device.action${cap(outcome.action)}`) })}
                  </Text>
                ))}
              </SectionCard>
            ) : null}

            <AppButton
              onPress={() => router.push('/payments/create')}
              testID="restriction-pay-now"
             label={t('dashboard.payNow')} />
            <AppButton
              variant="outline"
              onPress={() => router.push('/(tabs)/support')}
             label={t('device.contactSupport')} />
            <AppButton
              loading={checking}
              onPress={() => void onCheckNow()}
              testID="restriction-check-now"
             label={checking ? t('device.checkingIn') : t('device.checkNow')} />
            <AppButton
              variant="text"
              loading={sync.isPending}
              onPress={() => void refresh()}
              testID="restriction-refresh"
             label={t('device.refreshStatus')} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** `LOCK` -> `Lock`, so `device.actionLock` resolves. */
function cap(action: string): string {
  return action.charAt(0) + action.slice(1).toLowerCase();
}


const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 12, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  buttonContent: { height: 52 },
});
