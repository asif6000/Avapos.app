import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { useIsFocused } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { ListSkeleton } from '@/components/Skeleton';
import { deviceStateBadge } from '@/components/StatusBadge';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useDeviceStatus } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { deviceStateLabel, formatDateTime } from '@/utils/format';
import { RESTRICTED_STATES } from '@/types/domain';

/**
 * Access restoration is only ever shown when the backend confirms it. The
 * screen re-reads `/devices/me/status` every time it regains focus, so arriving
 * here from a notification cannot fabricate an unlocked device.
 */
export default function DeviceRestoredScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const isFocused = useIsFocused();
  const { data, isLoading, refetch } = useDeviceStatus();
  const [seenAt, setSeenAt] = useState<string | null>(null);

  useEffect(() => {
    if (!isFocused) return;
    void refetch().then(() => {
      setSeenAt(new Date().toISOString());
    });
  }, [isFocused, refetch]);

  const stillRestricted = data ? RESTRICTED_STATES.includes(data.deviceState) : false;

  return (
    <Screen>
      <AppHeader title={t('device.restoredTitle')} />
      <ScrollView contentContainerStyle={styles.content}>
        {isLoading && !data ? (
          <ListSkeleton count={1} />
        ) : (
          <>
            <SectionCard style={{ borderColor: theme.colors.primary }}>
              <Text variant="titleLarge" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                {stillRestricted ? t('device.restrictedTitle') : t('device.restoredTitle')}
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {stillRestricted ? t('device.restrictedBody') : t('device.restoredBody')}
              </Text>
            </SectionCard>

            {data ? (
              <SectionCard>
                <View style={styles.headerRow}>
                  <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: '700', flex: 1 }}>
                    {t('device.deviceState')}
                  </Text>
                  {deviceStateBadge(data.deviceState, deviceStateLabel(data.deviceState, t))}
                </View>
                <InfoRow
                  label={t('device.lastSync')}
                  value={formatDateTime(data.lastSyncedAt, language)}
                  tone="muted"
                />
                {data.unlockAuthorizedAt ? (
                  <InfoRow
                    label={t('states.UNLOCKED')}
                    value={formatDateTime(data.unlockAuthorizedAt, language)}
                    tone="muted"
                  />
                ) : null}
                {seenAt ? (
                  <InfoRow label={t('common.refresh')} value={formatDateTime(seenAt, language)} tone="muted" />
                ) : null}
              </SectionCard>
            ) : null}

            <Button
              mode="contained"
              onPress={() => void refetch()}
              contentStyle={styles.buttonContent}
              testID="restored-refresh"
            >
              {t('common.refresh')}
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
