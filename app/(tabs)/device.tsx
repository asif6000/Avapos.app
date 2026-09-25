import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

import { ApiError } from '@/api/errors';
import { AppHeader } from '@/components/AppHeader';
import { ListSkeleton } from '@/components/Skeleton';
import { deviceStateBadge } from '@/components/StatusBadge';
import { ErrorState } from '@/components/StateViews';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useDevice, useDeviceStatus, useSyncDevice } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { RESTRICTED_STATES } from '@/types/domain';
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

  const device = deviceQuery.data;
  const status = statusQuery.data;
  const deviceState = status?.deviceState ?? device?.deviceState ?? null;
  const restricted = deviceState !== null && RESTRICTED_STATES.includes(deviceState);

  const loading = deviceQuery.isLoading || statusQuery.isLoading;
  const error = (deviceQuery.error ?? statusQuery.error) as ApiError | null;


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
        <View style={styles.content}>
          <ListSkeleton count={2} />
        </View>
      ) : error ? (
        // Same rule as the dashboard: a failed request is an error, never an
        // empty device list.
        <ErrorState message={error.message} onRetry={refresh} onSignOut={() => void signOut()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={deviceQuery.isRefetching || statusQuery.isRefetching || sync.isPending}
              onRefresh={refresh}
              colors={[theme.colors.primary]}
            />
          }
        >
          {restricted ? (
            <SectionCard style={{ borderColor: theme.colors.error }}>
              <Text variant="titleMedium" style={{ color: theme.colors.error, fontWeight: '700' }}>
                {t('device.restrictedTitle')}
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {status?.restrictionReason ?? t('device.restrictedBody')}
              </Text>
              <Button
                mode="contained"
                onPress={() => router.push('/payments/create')}
                buttonColor={theme.colors.primary}
                contentStyle={styles.buttonContent}
              >
                {t('payments.payNow')}
              </Button>
              <Button mode="outlined" onPress={() => router.push('/(tabs)/support')}>
                {t('device.contactSupport')}
              </Button>
              <Button
                mode="text"
                loading={sync.isPending}
                onPress={() => void sync.mutateAsync().catch(() => undefined)}
                testID="device-refresh-status"
              >
                {t('device.refreshStatus')}
              </Button>
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
            <SectionCard>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('dashboard.noDevice')}
              </Text>
            </SectionCard>
          )}

          {status?.outstandingAmount ? (
            <SectionCard>
              <InfoRow
                label={t('device.outstanding')}
                value={formatCurrency(status.outstandingAmount)}
                tone="strong"
              />
              {status.dueDate ? (
                <InfoRow label={t('device.dueDate')} value={formatDate(status.dueDate, language)} />
              ) : null}
            </SectionCard>
          ) : null}

          {device && device.agreementAcceptedAt ? (
            <Button
              mode="contained-tonal"
              onPress={() => router.push('/device/enrollment')}
              contentStyle={styles.buttonContent}
            >
              {t('enrollment.agreementTitle')}
            </Button>
          ) : (
            <Button
              mode="contained"
              onPress={() => router.push('/device/enrollment')}
              contentStyle={styles.buttonContent}
              testID="device-start-enrollment"
            >
              {t('device.enroll')}
            </Button>
          )}

          <Button
            mode="outlined"
            loading={sync.isPending}
            onPress={() => void sync.mutateAsync().catch(() => undefined)}
            contentStyle={styles.buttonContent}
            testID="device-sync"
          >
            {t('device.reSync')}
          </Button>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  buttonContent: { height: 48 },
});
