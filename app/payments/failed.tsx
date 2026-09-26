import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { AppIcon } from '@/components/AppIcon';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/Screen';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { usePayment } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { formatCurrency } from '@/utils/format';
import { radius, spacing, useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';
import type { AppTheme } from '@/theme/theme';

export default function PaymentFailedScreen() {
  const { t } = useTranslation();
  const theme = useTheme<AppTheme>();
  const { gutter } = useLayout();
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const { data } = usePayment(paymentId);

  return (
    <Screen>
      <AppHeader title={t('payments.failed')} back={false} />
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
        <SectionCard>
          <View style={styles.statusRow}>
            <View style={[styles.disc, { backgroundColor: theme.colors.errorContainer }]}>
              <AppIcon name="close-bold" size={28} color={theme.colors.onErrorContainer} />
            </View>
            <View style={styles.statusText}>
              <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
                {t('payments.failed')}
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('payments.failedBody')}
              </Text>
            </View>
          </View>
          {data ? (
            <InfoRow label={t('payments.amount')} value={formatCurrency(data.amount)} />
          ) : null}
        </SectionCard>

        <AppButton
          block
          size="lg"
          onPress={() => router.replace('/payments/create')}
          testID="payment-failed-retry"
          label={t('payments.tryAgain')}
        />
        <AppButton
          block
          variant="text"
          onPress={() => router.replace('/(tabs)/support')}
          label={t('device.contactSupport')}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 12, paddingBottom: 40 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusText: { flex: 1, gap: 2, minWidth: 0 },
  disc: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
