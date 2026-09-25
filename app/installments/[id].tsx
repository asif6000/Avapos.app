import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { ListSkeleton } from '@/components/Skeleton';
import { ErrorState } from '@/components/StateViews';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useInstallment } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency, formatDate, formatRelativeDue } from '@/utils/format';

export default function InstallmentDetailScreen() {
  const { t, language } = useTranslation();
  const theme = useTheme();
  const signOut = useAuthStore((state) => state.signOut);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useInstallment(id);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <AppHeader
        title={t('installments.title')}
        subtitle={data ? `${t('installments.title')} ${data.number}` : undefined}
      />

      {isLoading ? (
        <View style={styles.content}>
          <ListSkeleton count={2} />
        </View>
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} onSignOut={() => void signOut()} />
      ) : data ? (
        <ScrollView contentContainerStyle={styles.content}>
          <SectionCard>
            <InfoRow label={t('payments.amount')} value={formatCurrency(data.amount)} tone="strong" />
            <InfoRow label={t('installments.paid')} value={formatCurrency(data.paidAmount)} />
            <InfoRow
              label={t('installments.remaining')}
              value={formatCurrency(data.amount - data.paidAmount)}
            />
            <InfoRow label={t('installments.nextDue')} value={formatDate(data.dueDate, language)} />
            <InfoRow
              label={t('installments.contractStatus')}
              value={data.status}
              tone="muted"
            />
            <InfoRow
              label={t('common.dueDate')}
              value={formatRelativeDue(data.dueDate, language)}
              tone="muted"
            />
          </SectionCard>

          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
            testID="installment-id"
          >
            {t('device.contractId')}: {data.contractId}
          </Text>
        </ScrollView>
      ) : (
        <ErrorState onRetry={() => void refetch()} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
});
