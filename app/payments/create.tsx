import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { RadioButton, Text, useTheme } from 'react-native-paper';

import { ApiError } from '@/api/errors';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/ui/AppButton';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useCreatePayment, useInstallment, useInstallments } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { useNetworkStore } from '@/store/networkStore';
import { usePaymentFlowStore } from '@/store/paymentFlowStore';
import { formatCurrency, formatDate } from '@/utils/format';
import { useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';

/**
 * The customer chooses an amount and a gateway. The app then asks the backend to
 * create the order; the backend — not this screen — decides the payable amount.
 */
export default function CreatePaymentScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const { gutter } = useLayout();
  const router = useRouter();
  const online = useNetworkStore((state) => state.online);
  const params = useLocalSearchParams<{ installmentId?: string }>();
  const setSession = usePaymentFlowStore((state) => state.setSession);

  const installmentsQuery = useInstallments();
  const selectedId = params.installmentId ?? installmentsQuery.data?.[0]?.id;
  const installmentQuery = useInstallment(selectedId);
  const createPayment = useCreatePayment();

  const [gateway, setGateway] = useState('bkash');
  const [notice, setNotice] = useState<string | null>(null);

  const installment = installmentQuery.data;
  const amount = installment ? installment.amount - installment.paidAmount : 0;

  // Derived, not stored in state: a query error renders directly.
  const loadError = installmentQuery.error
    ? installmentQuery.error instanceof ApiError
      ? installmentQuery.error.message
      : t('errors.generic')
    : null;

  const onPay = async () => {
    if (!selectedId || !online) return;
    setNotice(null);
    try {
      const session = await createPayment.mutateAsync({
        installmentId: selectedId,
        gateway,
        amount,
      });
      setSession(session, selectedId, amount);
      router.replace({ pathname: '/payments/processing', params: { paymentId: session.paymentId } });
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : t('errors.generic'));
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader title={t('payments.payNow')} />

      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
        {installment ? (
          <SectionCard>
            <InfoRow
              label={t('payments.amount')}
              value={formatCurrency(amount)}
              tone="strong"
            />
            <InfoRow
              label={t('installments.nextDue')}
              value={formatDate(installment.dueDate, language)}
            />
            <InfoRow label={t('device.contractId')} value={installment.contractId} tone="muted" />
          </SectionCard>
        ) : (
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('dashboard.noInstallment')}
          </Text>
        )}

        <SectionCard title={t('payments.gateway')}>
          {['bkash', 'nagad', 'rocket', 'card'].map((option) => (
            <RadioButton.Item
              key={option}
              value={option}
              label={option.toUpperCase()}
              status={gateway === option ? 'checked' : 'unchecked'}
              onPress={() => setGateway(option)}
              testID={`gateway-${option}`}
            />
          ))}
        </SectionCard>

        {!online ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
            {t('offline.actionRequired')}
          </Text>
        ) : null}

        {loadError || notice ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error }} testID="create-payment-error">
            {notice ?? loadError}
          </Text>
        ) : null}

        <AppButton
          onPress={() => void onPay()}
          loading={createPayment.isPending}
          disabled={createPayment.isPending || !online || !installment}
          testID="create-payment-submit"
         label={t('payments.payNow')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 12, paddingBottom: 40 },
  buttonContent: { height: 52 },
});
