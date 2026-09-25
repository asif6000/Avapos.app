import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import {
  Button,
  HelperText,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Screen } from '@/components/Screen';
import { ApiError } from '@/api/errors';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { isValidBdPhone, normalizePhone } from '@/utils/format';

const schema = z.object({
  phone: z
    .string()
    .min(1, 'required')
    .refine((value) => isValidBdPhone(value), { message: 'phone' }),
  password: z.string().min(1, 'required'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const login = useAuthStore((state) => state.login);
  const requestOtp = useAuthStore((state) => state.requestOtp);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setNotice(null);
    try {
      await login({ phone: normalizePhone(values.phone), password: values.password });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : t('errors.generic');
      setNotice(message);
    } finally {
      setSubmitting(false);
    }
  });

  const onSendOtp = handleSubmit(async (values) => {
    setSubmitting(true);
    setNotice(null);
    try {
      await requestOtp(normalizePhone(values.phone));
      router.push({ pathname: '/(auth)/otp', params: { phone: values.phone } });
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
            <Text variant="headlineMedium" style={{ color: theme.colors.primary, fontWeight: '700' }}>
              {t('common.appName')}
            </Text>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {t('auth.signIn')}
            </Text>
          </View>

          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, onBlur, value } }) => (
              <View>
                <TextInput
                  mode="outlined"
                  label={t('auth.phone')}
                  placeholder={t('auth.phonePlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  autoCapitalize="none"
                  error={Boolean(errors.phone)}
                  testID="login-phone"
                />
                <HelperText type="error" visible={Boolean(errors.phone)}>
                  {errors.phone?.message === 'phone' ? t('auth.invalidPhone') : t('common.required')}
                </HelperText>
              </View>
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <View>
                <TextInput
                  mode="outlined"
                  label={t('auth.password')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry
                  autoComplete="current-password"
                  error={Boolean(errors.password)}
                  testID="login-password"
                />
                <HelperText type="error" visible={Boolean(errors.password)}>
                  {t('common.required')}
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
            {t('auth.signIn')}
          </Button>

          <Button mode="text" onPress={onSendOtp} disabled={submitting} testID="login-otp">
            {t('auth.sendOtp')}
          </Button>

          <View style={styles.footer}>
            <Button mode="text" onPress={() => router.push('/(auth)/register')}>
              {t('auth.noAccount')}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Snackbar
        visible={Boolean(notice)}
        onDismiss={() => setNotice(null)}
        duration={5000}
        action={{ label: t('common.close'), onPress: () => setNotice(null) }}
      >
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
  footer: { marginTop: 8, alignItems: 'center' },
});
