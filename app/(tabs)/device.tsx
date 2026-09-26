import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { ApiError } from '@/api/errors';
import { AppHeader } from '@/components/AppHeader';
import { AppIcon } from '@/components/AppIcon';
import { AppButton } from '@/components/ui/AppButton';
import { StatTile } from '@/components/ui/StatTile';
import { ListSkeleton } from '@/components/Skeleton';
import { deviceStateBadge } from '@/components/StatusBadge';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useDevice, useDeviceStatus, useSyncDevice } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { deviceManagementService } from '@/services/deviceManagement';
import { useAuthStore } from '@/store/authStore';
import { RESTRICTED_STATES } from '@/types/domain';
import { spacing, useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';
import {
  deviceStateLabel,
  enrollmentLabel,
  formatCurrency,
  formatDate,
  formatDateTime,
  managementLabel,
} from '@/utils/format';

export default function DeviceScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const signOut = useAuthStore((state) => state.signOut);
  const router = useRouter();
  const deviceQuery = useDevice();
  const statusQuery = useDeviceStatus();
  const sync = useSyncDevice();

  const [checkingIn, setCheckingIn] = useState(false);

  /**
   * One check-in, then re-read.
   *
   * The re-read matters: a check-in can change what the server believes, so leaving
   * the screen showing the state from before it would be showing a stale answer to a
   * question the customer just asked again.
   */
  const onCheckIn = useCallback(async () => {
    setCheckingIn(true);
    try {
      await deviceManagementService.checkIn();
      await Promise.all([deviceQuery.refetch(), statusQuery.refetch()]);
    } catch {
      // `checkIn()` reports its own failures rather than throwing, so reaching here
      // means the re-read failed. The screen's own error state covers that.
    } finally {
      setCheckingIn(false);
    }
  }, [deviceQuery, statusQuery]);

  const device = deviceQuery.data;
  const status = statusQuery.data;
  const deviceState = status?.deviceState ?? device?.deviceState ?? null;
  const restricted = deviceState !== null && RESTRICTED_STATES.includes(deviceState);

  const loading = deviceQuery.isLoading || statusQuery.isLoading;
  const error = (deviceQuery.error ?? statusQuery.error) as ApiError | null;


  const { gutter } = useLayout();

  const refresh = () => {
    void deviceQuery.refetch();
    void statusQuery.refetch();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title={t('device.title')}
        back={false}
        action={{ icon: 'bell-outline', label: t('notifications.title'), onPress: () => router.push('/notifications') }}
      />

      {loading ? (
        <View style={[styles.content, { paddingHorizontal: gutter }]}>
          <ListSkeleton count={2} />
        </View>
      ) : error ? (
        // Same rule as the dashboard: a failed request is an error, never an
        // empty device list.
        <ErrorState message={error.message} onRetry={refresh} onSignOut={() => void signOut()} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
          refreshControl={
            <RefreshControl
              refreshing={deviceQuery.isRefetching || statusQuery.isRefetching || sync.isPending}
              onRefresh={refresh}
              colors={[theme.colors.primary]}
            />
          }
        >
          {restricted ? (
            <SectionCard
              style={[
                styles.restricted,
                { backgroundColor: theme.colors.errorContainer, borderColor: theme.colors.error },
              ]}
            >
              <View style={styles.restrictedHeader}>
                <AppIcon name="alert-circle-outline" size={22} color={theme.colors.onErrorContainer} />
                <Text
                  variant="titleMedium"
                  style={{ color: theme.colors.onErrorContainer, fontWeight: '700', flex: 1 }}
                >
                  {t('device.restrictedTitle')}
                </Text>
              </View>
              <Text variant="bodyMedium" style={{ color: theme.colors.onErrorContainer }}>
                {status?.restrictionReason ?? t('device.restrictedBody')}
              </Text>
              <View style={styles.actions}>
                <AppButton
                  block
                  size="lg"
                  label={t('payments.payNow')}
                  onPress={() => router.push('/payments/create')}
                />
                <AppButton
                  block
                  variant="outline"
                  label={t('device.contactSupport')}
                  onPress={() => router.push('/(tabs)/support')}
                />
                <AppButton
                  block
                  variant="text"
                  label={t('device.refreshStatus')}
                  loading={sync.isPending}
                  testID="device-refresh-status"
                  onPress={() => void sync.mutateAsync().catch(() => undefined)}
                />
              </View>
            </SectionCard>
          ) : null}

          {device ? (
            <SectionCard title={t('device.title')}>
              <View style={styles.nameRow}>
                <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
                  {device.name}
                </Text>
                {deviceState ? deviceStateBadge(deviceState, deviceStateLabel(deviceState, t)) : null}
              </View>
              <InfoRow label={t('device.manufacturer')} value={device.manufacturer} />
              <InfoRow label={t('device.model')} value={device.model} />
              <InfoRow label={t('device.androidVersion')} value={device.androidVersion ?? '—'} />
              <InfoRow
                label={t('device.enrollmentStatus')}
                value={enrollmentLabel(device.enrollmentStatus, t)}
              />
              <InfoRow
                label={t('device.managementStatus')}
                value={managementLabel(device.managementStatus, t)}
              />
              <InfoRow
                label={t('device.lastSync')}
                value={formatDateTime(status?.lastSyncedAt ?? device.lastSyncedAt, language)}
                tone="muted"
              />
              <InfoRow label={t('device.contractId')} value={device.contractId} tone="muted" />
            </SectionCard>
          ) : (
            <EmptyState
              icon="cellphone-off"
              title={t('device.title')}
              body={t('dashboard.noDevice')}
            />
          )}

          {status?.outstandingAmount ? (
            <SectionCard title={t('dashboard.remaining')}>
              <View style={styles.metricRow}>
                <StatTile
                  label={t('device.outstanding')}
                  value={formatCurrency(status.outstandingAmount)}
                  tone="primary"
                />
                {status.dueDate ? (
                  <StatTile label={t('device.dueDate')} value={formatDate(status.dueDate, language)} />
                ) : null}
              </View>
            </SectionCard>
          ) : null}

          {device && device.agreementAcceptedAt ? (
            <AppButton
              block
              size="lg"
              variant="tonal"
              label={t('enrollment.agreementTitle')}
              onPress={() => router.push('/device/enrollment')}
            />
          ) : (
            <AppButton
              block
              size="lg"
              label={t('device.enroll')}
              testID="device-start-enrollment"
              onPress={() => router.push('/device/enrollment')}
            />
          )}

          <AppButton
            block
            variant="outline"
            label={t('device.reSync')}
            loading={sync.isPending}
            testID="device-sync"
            onPress={() => void sync.mutateAsync().catch(() => undefined)}
          />

          {/*
            "Re-sync" only tells the server what this phone says about itself. This
            is the other direction: it asks what the server wants done, does it, and
            reports back. They are separate buttons because they answer separate
            questions, and merging them would hide which one is talking.
          */}
          {device?.enrollmentStatus === 'ENROLLED' ? (
            <AppButton
              block
              variant="text"
              label={t('device.checkNow')}
              loading={checkingIn}
              testID="device-check-in"
              onPress={() => void onCheckIn()}
            />
          ) : null}
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
    paddingHorizontal: spacing.lg,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  restricted: { gap: spacing.md },
  restrictedHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
