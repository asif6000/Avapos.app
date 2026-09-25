import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/Screen';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { usePayment } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';

export default function PaymentSuccessScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const { gutter } = useLayout();
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { data } = usePayment(paymentId);

  return (
    <Screen>
      <AppHeader title={t('payments.success')} back={false} />
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
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

        <AppButton
          onPress={() => router.replace('/(tabs)')}
          testID="payment-success-done"
         label={t('common.done')} />
        <AppButton variant="text" onPress={() => router.replace('/(tabs)/payments')} label={t('payments.history')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 12, paddingBottom: 40 },
  buttonContent: { height: 52 },
});
