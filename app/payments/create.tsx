import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { ApiError } from '@/api/errors';
import { AppHeader } from '@/components/AppHeader';
import { AppIcon } from '@/components/AppIcon';
import { AppButton } from '@/components/ui/AppButton';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { InfoBanner } from '@/components/InfoBanner';
import { useCreatePayment, useInstallment, useInstallments } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { useNetworkStore } from '@/store/networkStore';
import { usePaymentFlowStore } from '@/store/paymentFlowStore';
import { formatCurrency, formatDate } from '@/utils/format';
import { radius, spacing, useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';
import type { AppTheme } from '@/theme/theme';

const GATEWAYS = [
  { key: 'bkash', label: 'bKash', icon: 'cellphone-message' },
  { key: 'nagad', label: 'Nagad', icon: 'cellphone-message' },
  { key: 'rocket', label: 'Rocket', icon: 'rocket-launch-outline' },
  { key: 'card', label: 'Card', icon: 'credit-card-outline' },
];

/**
 * The customer chooses an amount and a gateway. The app then asks the backend to
 * create the order; the backend — not this screen — decides the payable amount.
 */
export default function CreatePaymentScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme<AppTheme>();
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
          {GATEWAYS.map((option, index) => {
            const selected = gateway === option.key;
            return (
              <View key={option.key}>
                {index > 0 ? (
                  <View style={[styles.rule, { backgroundColor: theme.colors.outlineVariant }]} />
                ) : null}
                <Pressable
                  onPress={() => setGateway(option.key)}
                  android_ripple={{ color: `${theme.colors.primary}14` }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  accessibilityLabel={option.label}
                  testID={`gateway-${option.key}`}
                  style={({ pressed }) => [styles.option, pressed && { opacity: 0.85 }]}
                >
                  <View
                    style={[
                      styles.glyph,
                      {
                        backgroundColor: selected
                          ? theme.colors.primaryContainer
                          : theme.colors.surfaceVariant,
                      },
                    ]}
                  >
                    <AppIcon
                      name={option.icon}
                      size={20}
                      color={selected ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant}
                    />
                  </View>
                  <Text
                    variant="bodyLarge"
                    style={{ flex: 1, color: theme.colors.onSurface, fontWeight: selected ? '700' : '400' }}
                  >
                    {option.label}
                  </Text>
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.outline,
                        backgroundColor: selected ? theme.colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {selected ? <AppIcon name="check" size={14} color="#FFFFFF" /> : null}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </SectionCard>

        {!online ? (
          <InfoBanner body={t('offline.actionRequired')} icon="wifi-off" tone="warning" />
        ) : null}

        {loadError || notice ? (
          <InfoBanner body={notice ?? loadError ?? ''} icon="alert-circle-outline" tone="danger" />
        ) : null}

        <AppButton
          block
          size="lg"
          onPress={() => void onPay()}
          loading={createPayment.isPending}
          disabled={createPayment.isPending || !online || !installment}
          testID="create-payment-submit"
          label={t('payments.payNow')}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    padding: 0,
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: 40,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 64,
  },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rule: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.lg },
});
