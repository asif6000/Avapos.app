import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/Screen';
import { SectionCard } from '@/components/SectionCard';
import { usePayment } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';

export default function PaymentPendingScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { gutter } = useLayout();
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { refetch, isFetching, data } = usePayment(paymentId);
  const [checked, setChecked] = useState(false);

  const checkStatus = async () => {
    setChecked(true);
    const result = await refetch();
    const status = result.data?.status;
    if (status === 'SUCCESS') {
      router.replace({ pathname: '/payments/success', params: { paymentId } });
    } else if (status === 'FAILED' || status === 'REFUNDED') {
      router.replace({ pathname: '/payments/failed', params: { paymentId } });
    }
  };

  return (
    <Screen>
      <AppHeader title={t('payments.pending')} back={false} />
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
        <SectionCard>
          <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
            {t('payments.pending')}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('payments.pendingBody')}
          </Text>
          {checked ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('payments.status')}: {data?.status ?? t('payments.pending')}
            </Text>
          ) : null}
        </SectionCard>

        <AppButton
          loading={isFetching}
          onPress={() => void checkStatus()}
          testID="payment-pending-check"
         label={t('payments.checkStatus')} />
        <AppButton variant="text" onPress={() => router.replace('/(tabs)')} label={t('common.done')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 12, paddingBottom: 40 },
  buttonContent: { height: 52 },
});
