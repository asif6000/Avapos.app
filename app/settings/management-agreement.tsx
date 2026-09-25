import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/Screen';
import { DEVICE_MANAGEMENT_AGREEMENT_VERSION } from '@/config/agreement';
import { useCurrentAgreement } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { MANAGEMENT_AGREEMENT_SECTIONS } from '@/content/legal';
import { formatDateTime } from '@/utils/format';
import { useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';

/**
 * Full text of the Device Management Agreement plus the version and timestamp
 * the server recorded for this customer's acceptance, if any.
 */
export default function ManagementAgreementScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const { gutter } = useLayout();
  const router = useRouter();
  const { data } = useCurrentAgreement();
  const [busy, setBusy] = useState(false);

  return (
    <Screen>
      <AppHeader title={t('settings.managementAgreement')} />

      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('settings.version')} {DEVICE_MANAGEMENT_AGREEMENT_VERSION}
        </Text>

        {data?.acceptedAt ? (
          <Text variant="bodySmall" style={{ color: theme.colors.primary }} testID="agreement-accepted">
            {t('enrollment.alreadyAccepted')} ({formatDateTime(data.acceptedAt, language)})
          </Text>
        ) : null}

        {MANAGEMENT_AGREEMENT_SECTIONS.map((section) => (
          <View key={section.heading}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
              {section.heading}
            </Text>
            {section.body.map((paragraph, index) => (
              <Text key={index} variant="bodyMedium" style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}

        <AppButton
          loading={busy}
          onPress={() => {
            setBusy(true);
            router.push('/device/enrollment');
          }}
         label={data?.acceptedAt ? t('common.seeDetails') : t('device.enroll')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 18, paddingBottom: 48 },
  paragraph: { marginTop: 4 },
  buttonContent: { height: 52 },
});
