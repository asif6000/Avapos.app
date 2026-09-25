import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';
import { z } from 'zod';

import { ApiError } from '@/api/errors';
import { DEVICE_MANAGEMENT_AGREEMENT_VERSION } from '@/config/agreement';
import { Screen } from '@/components/Screen';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { isValidBdPhone, normalizePhone } from '@/utils/format';

const schema = z.object({
  fullName: z.string().min(3, 'required'),
  phone: z
    .string()
    .min(1, 'required')
    .refine((value) => isValidBdPhone(value), { message: 'phone' }),
  email: z.string().email('email').optional().or(z.literal('')),
  password: z
    .string()
    .min(8, 'weak')
    .regex(/[A-Za-z]/, 'weak')
    .regex(/\d/, 'weak'),
  deviceName: z.string().min(2, 'required'),
});

type FormValues = z.infer<typeof schema>;

export default function RegisterScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const register = useAuthStore((state) => state.register);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      phone: '',
      email: '',
      password: '',
      deviceName: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setNotice(null);
    try {
      await register({
        fullName: values.fullName.trim(),
        phone: normalizePhone(values.phone),
        email: values.email?.trim() ? values.email.trim() : undefined,
        password: values.password,
        deviceName: values.deviceName.trim(),
        agreementVersion: DEVICE_MANAGEMENT_AGREEMENT_VERSION,
      });
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  });

  const errorText = (message?: string) => {
    switch (message) {
      case 'phone':
        return t('auth.invalidPhone');
      case 'weak':
        return t('auth.weakPassword');
      case 'email':
        return 'Invalid email';
      default:
        return t('common.required');
    }
  };

  return (
    <Screen scroll showOfflineBanner={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
            {t('auth.createAccount')}
          </Text>

          <Controller
            control={control}
            name="fullName"
            render={({ field: { onChange, onBlur, value } }) => (
              <View>
                <TextInput
                  mode="outlined"
                  label={t('auth.fullName')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoComplete="name"
                  error={Boolean(errors.fullName)}
                  testID="register-name"
                />
                <HelperText type="error" visible={Boolean(errors.fullName)}>
                  {errorText(errors.fullName?.message)}
                </HelperText>
              </View>
            )}
          />

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
                  error={Boolean(errors.phone)}
                  testID="register-phone"
                />
                <HelperText type="error" visible={Boolean(errors.phone)}>
                  {errorText(errors.phone?.message)}
                </HelperText>
              </View>
            )}
          />

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <View>
                <TextInput
                  mode="outlined"
                  label={t('auth.email')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  error={Boolean(errors.email)}
                />
                <HelperText type="error" visible={Boolean(errors.email)}>
                  {errorText(errors.email?.message)}
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
                  autoComplete="new-password"
                  error={Boolean(errors.password)}
                  testID="register-password"
                />
                <HelperText type="error" visible={Boolean(errors.password)}>
                  {errorText(errors.password?.message)}
                </HelperText>
              </View>
            )}
          />

          <Controller
            control={control}
            name="deviceName"
            render={({ field: { onChange, onBlur, value } }) => (
              <View>
                <TextInput
                  mode="outlined"
                  label={t('auth.deviceName')}
                  placeholder="Samsung Galaxy A15"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={Boolean(errors.deviceName)}
                  testID="register-device"
                />
                <HelperText type="error" visible={Boolean(errors.deviceName)}>
                  {errorText(errors.deviceName?.message)}
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
            testID="register-submit"
          >
            {t('auth.createAccount')}
          </Button>

          <View style={styles.footer}>
            <Button mode="text" onPress={() => router.push('/(auth)/login')}>
              {t('auth.haveAccount')}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Snackbar
        visible={Boolean(notice)}
        onDismiss={() => setNotice(null)}
        duration={5000}
      >
        {notice ?? ''}
      </Snackbar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 24, gap: 4, paddingBottom: 48 },
  button: { marginTop: 12, borderRadius: 999 },
  buttonContent: { height: 52 },
  footer: { marginTop: 8, alignItems: 'center' },
});
