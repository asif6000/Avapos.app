import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { usePayment } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { formatCurrency, formatDateTime } from '@/utils/format';

export default function PaymentSuccessScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { data } = usePayment(paymentId);

  return (
    <Screen>
      <AppHeader title={t('payments.success')} back={false} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionCard style={{ borderColor: theme.colors.primary }}>
          <Text variant="headlineSmall" style={{ color: theme.colors.primary, fontWeight: '700' }}>
            {t('payments.success')}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('payments.successBody')}
          </Text>
          {data ? (
            <>
              <InfoRow label={t('payments.amount')} value={formatCurrency(data.amount)} tone="strong" />
              <InfoRow label={t('payments.transaction')} value={data.transactionId} tone="muted" />
              <InfoRow
                label={t('payments.date')}
                value={formatDateTime(data.paidAt ?? data.createdAt, language)}
                tone="muted"
              />
            </>
          ) : null}
        </SectionCard>

        <Button
          mode="contained"
          onPress={() => router.replace('/(tabs)')}
          contentStyle={styles.buttonContent}
          testID="payment-success-done"
        >
          {t('common.done')}
        </Button>
        <Button mode="text" onPress={() => router.replace('/(tabs)/payments')}>
          {t('payments.history')}
        </Button>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  buttonContent: { height: 52 },
});
