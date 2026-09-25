import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { ListSkeleton } from '@/components/Skeleton';
import { deviceStateBadge } from '@/components/StatusBadge';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useDeviceStatus, useSyncDevice } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { deviceStateLabel, formatCurrency, formatDate } from '@/utils/format';

/**
 * Customer-facing restriction status.
 *
 * This is an ordinary app screen, not an imitation of an Android system screen.
 * It only reports what the backend has authorized. Nothing on the device is
 * locked, and no Android security setting is changed from here.
 */
export default function DeviceRestrictionScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { data, isLoading, refetch } = useDeviceStatus();
  const sync = useSyncDevice();

  const refresh = async () => {
    await refetch();
    await sync.mutateAsync().catch(() => undefined);
  };

  return (
    <Screen>
      <AppHeader title={t('device.restrictedTitle')} />
      <ScrollView contentContainerStyle={styles.content}>
        {isLoading ? (
          <ListSkeleton count={1} />
        ) : (
          <>
            <SectionCard style={{ borderColor: theme.colors.error }}>
              <View style={styles.headerRow}>
                <Text variant="titleLarge" style={{ color: theme.colors.onSurface, fontWeight: '700', flex: 1 }}>
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

            <Button
              mode="contained"
              onPress={() => router.push('/payments/create')}
              contentStyle={styles.buttonContent}
              testID="restriction-pay-now"
            >
              {t('dashboard.payNow')}
            </Button>
            <Button
              mode="outlined"
              onPress={() => router.push('/(tabs)/support')}
              contentStyle={styles.buttonContent}
            >
              {t('device.contactSupport')}
            </Button>
            <Button
              mode="text"
              loading={sync.isPending}
              onPress={() => void refresh()}
              contentStyle={styles.buttonContent}
              testID="restriction-refresh"
            >
              {t('device.refreshStatus')}
            </Button>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buttonContent: { height: 52 },
});
