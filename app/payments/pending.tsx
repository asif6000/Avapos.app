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
import { paymentService } from '@/services/payments';
import { usePaymentFlowStore } from '@/store/paymentFlowStore';
import { useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';

export default function PaymentPendingScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { gutter } = useLayout();
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { refetch, isFetching, data } = usePayment(paymentId);
  const gatewayNotOpened = usePaymentFlowStore((state) => state.gatewayNotOpened);
  const clear = usePaymentFlowStore((state) => state.clear);
  const [checked, setChecked] = useState(false);
  const [reopening, setReopening] = useState(false);

  /** The order is still live: the customer can be taken to the gateway again. */
  const reopenGateway = async () => {
    const session = usePaymentFlowStore.getState().session;
    if (!session) return;
    setReopening(true);
    const result = await paymentService.openGateway(session);
    setReopening(false);
    if (result.opened) {
      clear();
      router.replace({ pathname: '/payments/processing', params: { paymentId } });
    }
  };

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
            {gatewayNotOpened ? t('payments.gatewayNotOpened') : t('payments.pendingBody')}
          </Text>
          {checked ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('payments.status')}: {data?.status ?? t('payments.pending')}
            </Text>
          ) : null}
        </SectionCard>

        {gatewayNotOpened ? (
          <AppButton
            block
            loading={reopening}
            onPress={() => void reopenGateway()}
            testID="payment-pending-reopen"
            label={t('payments.openGateway')}
          />
        ) : null}

        <AppButton
          block
          loading={isFetching}
          onPress={() => void checkStatus()}
          testID="payment-pending-check"
          label={t('payments.checkStatus')}
        />
        <AppButton variant="text" onPress={() => router.replace('/(tabs)')} label={t('common.done')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 12, paddingBottom: 40 },
  buttonContent: { height: 52 },
});
