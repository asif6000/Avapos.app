import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Checkbox, ProgressBar, Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { AppIcon } from '@/components/AppIcon';
import { AppButton } from '@/components/ui/AppButton';
import { Field } from '@/components/ui/Field';
import { Screen } from '@/components/Screen';
import { useAcceptAgreement } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { DEVICE_MANAGEMENT_AGREEMENT_VERSION } from '@/config/agreement';
import { deviceManagementService } from '@/services/deviceManagement';
import { useNetworkStore } from '@/store/networkStore';
import { radius, spacing, useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';
import type { DeviceState, EnrollmentStatus } from '@/types/domain';

/**
 * The sale, in the order it actually happens — and nothing hidden.
 *
 * 1. the app is installed
 * 2. the customer reads the agreement and accepts it by typing their name
 * 3. the *store* provisions the phone as an Android Enterprise device owner
 * 4. Android shows its own authorisation prompt
 * 5. the backend binds the phone to the contract
 *
 * Two rules this screen exists to keep:
 *
 * - nothing is enrolled silently, and the app says up front that it cannot enrol
 *   itself: Android does not allow that, and a customer app that tried would be
 *   pretending.
 * - after the agreement is accepted the result is *reported*, not asserted. If
 *   Android says this phone has no device owner, the result screen says exactly
 *   that, and if the server has not confirmed the binding it says it is still
 *   waiting. A phone that is not yet provisioned must never look like one that
 *   is.
 */
export default function EnrollmentScreen() {
  const { gutter } = useLayout();
  const { t, language } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const online = useNetworkStore((state) => state.online);
  const acceptAgreement = useAcceptAgreement();

  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    androidOutcome: EnrollmentStatus;
    deviceState: DeviceState | null;
    acceptedAt: string;
  } | null>(null);

  const steps = [
    { title: t('enrollment.chainTitle'), body: t('enrollment.chainBody') },
    { title: t('enrollment.whyTitle'), body: t('enrollment.whyBody') },
    { title: t('enrollment.provisionTitle'), body: t('enrollment.provisionBody') },
    { title: t('enrollment.dataTitle'), body: t('enrollment.dataBody') },
    { title: t('enrollment.featuresTitle'), body: t('enrollment.featuresBody') },
    { title: t('enrollment.overdueTitle'), body: t('enrollment.overdueBody') },
    { title: t('enrollment.paymentTitle'), body: t('enrollment.paymentBody') },
    { title: t('enrollment.uninstallTitle'), body: t('enrollment.uninstallBody') },
    { title: t('enrollment.limitsTitle'), body: t('enrollment.limitsBody') },
    { title: t('enrollment.neverHiddenTitle'), body: t('enrollment.neverHiddenBody') },
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
      // The server records who accepted which version, and when, before any
      // Android enrollment is attempted. Consent first, then the mechanism.
      await acceptAgreement.mutateAsync({
        agreementVersion: DEVICE_MANAGEMENT_AGREEMENT_VERSION,
        accepted: true,
        acceptedAt,
        signatureName: signature.trim(),
        deviceName: '',
      });
      const outcome = await deviceManagementService.requestEnrollment({
        agreementVersion: DEVICE_MANAGEMENT_AGREEMENT_VERSION,
        signatureName: signature.trim(),
        acceptedAt,
      });
      setResult({
        androidOutcome: outcome.nativeOutcome,
        deviceState: outcome.deviceState,
        acceptedAt,
      });
    } catch {
      setError(t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  /** Re-reads the real state, for a phone that gets provisioned after the sale. */
  const onCheckAgain = async () => {
    setChecking(true);
    try {
      const outcome = await deviceManagementService.getEnrollmentStatus();
      const state = await deviceManagementService.getDeviceState();
      setResult((previous) =>
        previous ? { ...previous, androidOutcome: outcome, deviceState: state } : previous,
      );
    } finally {
      setChecking(false);
    }
  };

  if (result) {
    return (
      <Screen>
        <AppHeader title={t('enrollment.resultTitle')} />
        <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
          <ResultRow
            icon="file-check-outline"
            tone="success"
            title={t('enrollment.resultAgreement')}
            body={`${DEVICE_MANAGEMENT_AGREEMENT_VERSION} · ${new Date(result.acceptedAt).toLocaleString(
              language === 'bn' ? 'bn-BD' : 'en-GB',
            )}`}
          />
          <ResultRow
            icon="android"
            tone={androidTone(result.androidOutcome)}
            title={t('enrollment.resultAndroid')}
            body={androidMessage(result.androidOutcome, t)}
          />
          <ResultRow
            icon="link-variant"
            tone={result.deviceState ? 'success' : 'pending'}
            title={t('enrollment.resultBind')}
            body={result.deviceState ? t('enrollment.bindConfirmed') : t('enrollment.bindPending')}
          />
          <View style={styles.actions}>
            <AppButton
              block
              variant="outline"
              label={t('enrollment.checkAgain')}
              loading={checking}
              onPress={() => void onCheckAgain()}
              testID="enrollment-check-again"
            />
            <AppButton
              block
              label={t('common.done')}
              onPress={() => router.replace('/(tabs)/device')}
              testID="enrollment-done"
            />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title={t('enrollment.title')} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('enrollment.step', { current: step + 1, total: totalSteps })}
        </Text>
        <ProgressBar progress={(step + 1) / totalSteps} color={theme.colors.primary} style={styles.progress} />

        <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
          {isLastStep ? t('enrollment.agreementTitle') : current?.title}
        </Text>
        <Text variant="bodyLarge" style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
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

        <View style={styles.actions}>
          {isLastStep ? (
            <AppButton
              block
              size="lg"
              disabled={!consent || submitting || !online}
              loading={submitting}
              onPress={() => void onFinish()}
              testID="enrollment-submit"
              label={t('enrollment.acceptCta')}
            />
          ) : (
            <AppButton
              block
              label={t('common.next')}
              onPress={() => setStep((value) => Math.min(steps.length, value + 1))}
              testID="enrollment-next"
            />
          )}

          {step > 0 ? (
            <AppButton
              variant="text"
              label={t('common.back')}
              testID="enrollment-back"
              onPress={() => setStep((value) => Math.max(0, value - 1))}
            />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

type Tone = 'success' | 'pending' | 'warning' | 'danger';

/**
 * Android's own answer, in the customer's words.
 *
 * The important part is what it never says: a phone with no device owner must
 * not be described as enrolled, however willing the customer was.
 */
function androidMessage(status: EnrollmentStatus, t: (key: string) => string): string {
  switch (status) {
    case 'ENROLLED':
      return t('enrollment.androidEnrolled');
    case 'PENDING':
      return t('enrollment.androidPending');
    case 'ENROLLMENT_FAILED':
      return t('enrollment.androidFailed');
    case 'NOT_ENROLLED':
      return t('enrollment.androidNotEnrolled');
    case 'UNSUPPORTED':
    default:
      return t('enrollment.androidUnsupported');
  }
}

function androidTone(status: EnrollmentStatus): Tone {
  switch (status) {
    case 'ENROLLED':
      return 'success';
    case 'PENDING':
      return 'pending';
    case 'ENROLLMENT_FAILED':
      return 'danger';
    default:
      return 'warning';
  }
}

function ResultRow({
  icon,
  title,
  body,
  tone,
}: {
  icon: string;
  title: string;
  body: string;
  tone: Tone;
}) {
  const theme = useTheme();
  const colors: Record<Tone, { background: string; foreground: string }> = {
    success: {
      background: theme.colors.primaryContainer,
      foreground: theme.colors.onPrimaryContainer,
    },
    pending: {
      background: theme.colors.surfaceVariant,
      foreground: theme.colors.onSurfaceVariant,
    },
    warning: {
      background: theme.colors.secondaryContainer,
      foreground: theme.colors.onSecondaryContainer,
    },
    danger: { background: theme.colors.errorContainer, foreground: theme.colors.onErrorContainer },
  };
  const palette = colors[tone];

  return (
    <View
      style={[
        styles.resultRow,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant },
      ]}
    >
      <View style={[styles.resultIcon, { backgroundColor: palette.background }]}>
        <AppIcon name={icon} size={20} color={palette.foreground} />
      </View>
      <View style={styles.resultText}>
        <Text variant="labelLarge" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
          {title}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingTop: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  progress: { height: 6, borderRadius: radius.pill },
  body: { lineHeight: 26 },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  resultRow: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultText: { flex: 1, gap: 2 },
});
