import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';

import { ApiError } from '@/api/errors';
import { Screen } from '@/components/Screen';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { normalizePhone } from '@/utils/format';

const OTP_LENGTH = 6;

export default function OtpScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = params.phone ?? useAuthStore.getState().otpPhone ?? '';
  const verifyOtp = useAuthStore((state) => state.verifyOtp);
  const requestOtp = useAuthStore((state) => state.requestOtp);
  const resendAvailableAt = useAuthStore((state) => state.otpResendAvailableAt);

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const inputRef = useRef<unknown>(null);

  useEffect(() => {
    if (!resendAvailableAt) return;
    const tick = () =>
      setSecondsLeft(Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [resendAvailableAt]);

  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);

  const onSubmit = async () => {
    if (code.length !== OTP_LENGTH) {
      setNotice(t('auth.invalidOtp'));
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      await verifyOtp({ phone: normalizedPhone, code });
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : t('errors.generic'));
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    setResending(true);
    setNotice(null);
    try {
      await requestOtp(normalizedPhone);
      setCode('');
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : t('errors.generic'));
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
          {t('auth.otpTitle')}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('auth.otpSubtitle', { phone: normalizedPhone })}
        </Text>

        <TextInput
          ref={inputRef as never}
          mode="outlined"
          label={t('auth.otpTitle')}
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
          keyboardType="number-pad"
          maxLength={OTP_LENGTH}
          style={styles.otp}
          contentStyle={styles.otpContent}
          autoFocus
          testID="otp-input"
          onSubmitEditing={onSubmit}
          returnKeyType="done"
        />

        <Button
          mode="contained"
          onPress={onSubmit}
          loading={submitting}
          disabled={submitting || code.length !== OTP_LENGTH}
          contentStyle={styles.buttonContent}
          style={styles.button}
          testID="otp-submit"
        >
          {t('common.continue')}
        </Button>

        <Button
          mode="text"
          onPress={onResend}
          disabled={secondsLeft > 0 || resending}
          testID="otp-resend"
        >
          {secondsLeft > 0 ? t('auth.resendIn', { seconds: secondsLeft }) : t('auth.resendOtp')}
        </Button>
      </View>

      <Snackbar visible={Boolean(notice)} onDismiss={() => setNotice(null)} duration={5000}>
        {notice ?? ''}
      </Snackbar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  otp: { marginTop: 16 },
  otpContent: { fontSize: 24, letterSpacing: 10, textAlign: 'center' },
  button: { marginTop: 12, borderRadius: 999 },
  buttonContent: { height: 52 },
});
