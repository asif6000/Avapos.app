import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useTranslation } from '@/hooks/useTheme';
import { paymentService } from '@/services/payments';
import { usePaymentFlowStore } from '@/store/paymentFlowStore';

/**
 * Gateway hand-off and verification.
 *
 * The gateway's own "success" page is never treated as proof. After the browser
 * closes, the app asks the backend — which verified the gateway callback — for
 * the payment status, and routes on that answer only.
 */
export default function PaymentProcessingScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const session = usePaymentFlowStore((state) => state.session);
  const markGatewayNotOpened = usePaymentFlowStore((state) => state.markGatewayNotOpened);
  const clear = usePaymentFlowStore((state) => state.clear);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const run = async () => {
      if (session) {
        const result = await paymentService.openGateway(session);
        if (!result.opened) {
          // The order is still live and no money has moved, so this is not a
          // failed payment. The pending screen explains that and can open the
          // gateway again.
          markGatewayNotOpened();
          clear();
          router.replace({ pathname: '/payments/pending', params: { paymentId } });
          return;
        }
      }

      const outcome = await paymentService.waitForOutcome(paymentId as string);
      clear();
      if (outcome === 'SUCCESS') {
        router.replace({ pathname: '/payments/success', params: { paymentId } });
      } else if (outcome === 'FAILED') {
        router.replace({ pathname: '/payments/failed', params: { paymentId } });
      } else {
        router.replace({ pathname: '/payments/pending', params: { paymentId } });
      }
    };

    void run();
  }, [paymentId, router, session, clear, markGatewayNotOpened]);

  return (
    <Screen>
      <AppHeader title={t('payments.processing')} back={false} />
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
          {t('payments.processing')}
        </Text>
        <Text
          variant="bodyMedium"
          style={[styles.body, { color: theme.colors.onSurfaceVariant }]}
        >
          {t('payments.processingBody')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  body: { textAlign: 'center' },
});
