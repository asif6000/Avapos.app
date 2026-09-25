import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Checkbox, ProgressBar, Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/Screen';
import { Field } from '@/components/ui/Field';
import { useAcceptAgreement } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { DEVICE_MANAGEMENT_AGREEMENT_VERSION } from '@/config/agreement';
import { deviceManagementService } from '@/services/deviceManagement';
import { useNetworkStore } from '@/store/networkStore';
import { useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';

/**
 * Enrollment is deliberately explicit. Nothing is enrolled silently: the
 * customer reads what is collected, what management can and cannot do, what
 * happens when a payment is overdue, and then types their name to accept the
 * versioned agreement. The server records who accepted which version and when.
 */
export default function EnrollmentScreen() {
  const { gutter } = useLayout();
  const { t } = useTranslation();
  const theme = useTheme();
  const online = useNetworkStore((state) => state.online);
  const acceptAgreement = useAcceptAgreement();

  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const steps = [
    { title: t('enrollment.whyTitle'), body: t('enrollment.whyBody') },
    { title: t('enrollment.dataTitle'), body: t('enrollment.dataBody') },
    { title: t('enrollment.featuresTitle'), body: t('enrollment.featuresBody') },
    { title: t('enrollment.overdueTitle'), body: t('enrollment.overdueBody') },
    { title: t('enrollment.paymentTitle'), body: t('enrollment.paymentBody') },
  ];

  const totalSteps = steps.length + 1;
  const isLastStep = step === steps.length;
  const current = steps[step];

  const onFinish = async () => {
    if (!signature.trim()) {
      setError(t('enrollment.acceptName'));
      return;
    }
    setSubmitting(true);
    setError(null);
    const acceptedAt = new Date().toISOString();
    try {
      await acceptAgreement.mutateAsync({
        agreementVersion: DEVICE_MANAGEMENT_AGREEMENT_VERSION,
        accepted: true,
        acceptedAt,
        signatureName: signature.trim(),
        deviceName: '',
      });
      await deviceManagementService.requestEnrollment({
        agreementVersion: DEVICE_MANAGEMENT_AGREEMENT_VERSION,
        signatureName: signature.trim(),
        acceptedAt,
      });
      setDone(true);
    } catch {
      setError(t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <AppHeader title={t('enrollment.title')} />

      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]} keyboardShouldPersistTaps="handled">
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('enrollment.step', { current: step + 1, total: totalSteps })}
        </Text>
        <ProgressBar progress={(step + 1) / totalSteps} color={theme.colors.primary} style={styles.progress} />

        <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
          {isLastStep ? t('enrollment.agreementTitle') : current?.title}
        </Text>
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 24 }}>
          {isLastStep ? t('device.notManaged') : current?.body}
        </Text>

        {isLastStep ? (
          <View style={styles.consent}>
            <Checkbox
              status={consent ? 'checked' : 'unchecked'}
              onPress={() => setConsent((value) => !value)}
              testID="enrollment-consent"
            />
            <Text
              variant="bodyMedium"
              style={{ flex: 1, color: theme.colors.onSurface }}
              onPress={() => setConsent((value) => !value)}
            >
              {t('enrollment.accept')}
            </Text>
          </View>
        ) : null}

        {isLastStep && consent ? (
          <Field
            label={t('auth.fullName')}
            placeholder={t('enrollment.acceptName')}
            value={signature}
            onChangeText={setSignature}
            autoCapitalize="words"
            testID="enrollment-signature"
          />
        ) : null}

        {error ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error }} testID="enrollment-error">
            {error}
          </Text>
        ) : null}

        {!online ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
            {t('offline.actionRequired')}
          </Text>
        ) : null}

        {done ? (
          <View style={styles.doneBox}>
            <Text variant="titleMedium" style={{ color: theme.colors.primary, fontWeight: '700' }}>
              {t('enrollment.accepted')}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('device.enrollmentStatus')}: {t('states.PENDING')}
            </Text>
          </View>
        ) : (
          <View style={styles.actions}>
            {isLastStep ? (
              <AppButton
                disabled={!consent || submitting || !online}
                loading={submitting}
                onPress={() => void onFinish()}
                testID="enrollment-submit"
               label={t('enrollment.acceptCta')} />
            ) : (
              <AppButton
                onPress={() => setStep((value) => Math.min(steps.length, value + 1))}
                testID="enrollment-next"
               label={t('common.next')} />
            )}

            {step > 0 ? (
              <AppButton variant="text" onPress={() => setStep((value) => Math.max(0, value - 1))} label={t('common.back')} />
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 16, paddingBottom: 48 },
  progress: { height: 6, borderRadius: 999 },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  actions: { gap: 8, marginTop: 8 },
  buttonContent: { height: 52 },
  doneBox: { gap: 6, marginTop: 8 },
});
