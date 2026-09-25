import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { usePayment } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { formatCurrency } from '@/utils/format';

export default function PaymentFailedScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { data } = usePayment(paymentId);

  return (
    <Screen>
      <AppHeader title={t('payments.failed')} back={false} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionCard style={{ borderColor: theme.colors.error }}>
          <Text variant="headlineSmall" style={{ color: theme.colors.error, fontWeight: '700' }}>
            {t('payments.failed')}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('payments.failedBody')}
          </Text>
          {data ? (
            <InfoRow label={t('payments.amount')} value={formatCurrency(data.amount)} />
          ) : null}
        </SectionCard>

        <Button
          mode="contained"
          onPress={() => router.replace('/payments/create')}
          contentStyle={styles.buttonContent}
          testID="payment-failed-retry"
        >
          {t('payments.tryAgain')}
        </Button>
        <Button mode="text" onPress={() => router.replace('/(tabs)/support')}>
          {t('device.contactSupport')}
        </Button>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  buttonContent: { height: 52 },
});
