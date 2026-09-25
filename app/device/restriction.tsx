import { useRouter } from 'expo-router';
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
import { deviceStateLabel, formatCurrency, formatDate } from '@/utils/format';
import { useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';

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
  const { gutter } = useLayout();
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
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
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

            <AppButton
              onPress={() => router.push('/payments/create')}
              testID="restriction-pay-now"
             label={t('dashboard.payNow')} />
            <AppButton
              variant="outline"
              onPress={() => router.push('/(tabs)/support')}
             label={t('device.contactSupport')} />
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

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 12, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buttonContent: { height: 52 },
});
