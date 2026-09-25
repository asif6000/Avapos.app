import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { SectionCard } from '@/components/SectionCard';
import { usePayment } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';

export default function PaymentPendingScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
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
      <ScrollView contentContainerStyle={styles.content}>
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

        <Button
          mode="contained"
          loading={isFetching}
          onPress={() => void checkStatus()}
          contentStyle={styles.buttonContent}
          testID="payment-pending-check"
        >
          {t('payments.checkStatus')}
        </Button>
        <Button mode="text" onPress={() => router.replace('/(tabs)')}>
          {t('common.done')}
        </Button>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  buttonContent: { height: 52 },
});
