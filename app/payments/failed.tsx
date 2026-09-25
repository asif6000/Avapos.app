import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/Screen';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { usePayment } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { formatCurrency } from '@/utils/format';
import { useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';

export default function PaymentFailedScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { gutter } = useLayout();
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { data } = usePayment(paymentId);

  return (
    <Screen>
      <AppHeader title={t('payments.failed')} back={false} />
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
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

        <AppButton
          onPress={() => router.replace('/payments/create')}
          testID="payment-failed-retry"
         label={t('payments.tryAgain')} />
        <AppButton variant="text" onPress={() => router.replace('/(tabs)/support')} label={t('device.contactSupport')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 12, paddingBottom: 40 },
  buttonContent: { height: 52 },
});
