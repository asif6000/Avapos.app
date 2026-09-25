import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, HelperText, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';
import { z } from 'zod';

import { ApiError } from '@/api/errors';
import { Screen } from '@/components/Screen';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { isValidEmail, normalizeEmail } from '@/utils/format';

const schema = z.object({
  email: z
    .string()
    .min(1, 'required')
    .refine((value) => isValidEmail(value), { message: 'email' }),
});

type FormValues = z.infer<typeof schema>;

/**
 * Sign in and sign up are the same screen. The customer enters an address, the
 * backend mails a code, and that code either signs them in or creates their
 * account on first use. There is no password field, because there are no
 * passwords.
 */
export default function LoginScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const requestOtp = useAuthStore((state) => state.requestOtp);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setNotice(null);
    try {
      const email = normalizeEmail(values.email);
      await requestOtp(email);
      router.push({ pathname: '/(auth)/otp', params: { email } });
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text
              variant="headlineMedium"
              style={{ color: theme.colors.primary, fontWeight: '700' }}
            >
              {t('common.appName')}
            </Text>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('auth.signIn')}
            </Text>
          </View>

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <View>
                <TextInput
                  mode="outlined"
                  label={t('auth.emailLabel')}
                  placeholder="name@example.com"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="email-address"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={Boolean(errors.email)}
                  testID="login-email"
                />
                <HelperText type="error" visible={Boolean(errors.email)}>
                  {errors.email?.message === 'email' ? t('auth.invalidEmail') : t('common.required')}
                </HelperText>
              </View>
            )}
          />

          <Button
            mode="contained"
            onPress={onSubmit}
            loading={submitting}
            disabled={submitting}
            contentStyle={styles.buttonContent}
            style={styles.button}
            testID="login-submit"
          >
            {t('auth.sendCode')}
          </Button>

          <Text variant="bodySmall" style={styles.note}>
            {t('auth.noPasswordNote')}
          </Text>

          <View style={styles.footer}>
            <Button mode="text" onPress={() => router.push('/(auth)/register')}>
              {t('auth.noAccount')}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Snackbar visible={Boolean(notice)} onDismiss={() => setNotice(null)} duration={5000}>
        {notice ?? ''}
      </Snackbar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 4 },
  header: { marginBottom: 24, gap: 4 },
  button: { marginTop: 12, borderRadius: 999 },
  buttonContent: { height: 52 },
  note: { textAlign: 'center', marginTop: 12 },
  footer: { marginTop: 8, alignItems: 'center' },
});
