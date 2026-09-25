import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { ScrollView, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { Screen } from '@/components/Screen';
import { API_BASE_URL } from '@/api/config';
import { SUPABASE_URL } from '@/supabase/client';
import { DEVICE_MANAGEMENT_AGREEMENT_VERSION } from '@/config/agreement';
import { hasNativeDeviceManagement } from '@/native/deviceManagement';
import { useTranslation } from '@/hooks/useTheme';
import { useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';

export default function AboutScreen() {
  const { gutter } = useLayout();
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Screen>
      <AppHeader title={t('settings.about')} />
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
        <Text variant="headlineSmall" style={{ color: theme.colors.primary, fontWeight: '700' }}>
          {t('common.appName')}
        </Text>

        <SectionCard>
          <InfoRow label={t('settings.version')} value={Application.nativeApplicationVersion ?? '1.0.0'} />
          <InfoRow label="Build" value={Application.nativeBuildVersion ?? '—'} />
          <InfoRow label="Bundle" value={Application.applicationId ?? '—'} />
          <InfoRow label="Platform" value={`${Device.osName ?? 'unknown'} ${Device.osVersion ?? ''}`.trim()} />
          <InfoRow
            label="Device management module"
            value={hasNativeDeviceManagement() ? 'installed' : 'not installed (Expo Go)'}
            tone="muted"
          />
          <InfoRow label="API" value={API_BASE_URL} tone="muted" />
          {/* Which project this build is talking to. The question has to be
              answerable on the device: a stale bundle pointing at a different
              backend than the one you think you are testing looks exactly like
              a broken app, and nothing else on screen says which it is. */}
          <InfoRow
            label="Supabase"
            value={SUPABASE_URL ?? 'not configured in this build'}
            tone="muted"
          />
        </SectionCard>

        <SectionCard title={t('settings.managementAgreement')}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('settings.version')} {DEVICE_MANAGEMENT_AGREEMENT_VERSION}
          </Text>
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 12, paddingBottom: 48 },
});
