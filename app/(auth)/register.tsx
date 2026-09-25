import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';
import { z } from 'zod';

import { Screen } from '@/components/Screen';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { isValidBdPhone, passwordProblems } from '@/utils/format';

const schema = z
  .object({
    fullName: z.string().min(3, 'required'),
    phone: z
      .string()
      .min(1, 'required')
      .refine((value) => isValidBdPhone(value), { message: 'phone' }),
    // Strength is checked on the device, so a weak password is never transmitted.
    password: z
      .string()
      .min(1, 'required')
      .refine((value) => passwordProblems(value).length === 0, { message: 'weak' }),
    confirmPassword: z.string().min(1, 'required'),
    deviceName: z.string().min(2, 'required'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'mismatch',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export default function RegisterScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const signUp = useAuthStore((state) => state.signUp);
  const setDisplayName = useAuthStore((state) => state.setDisplayName);
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
      password: '',
      confirmPassword: '',
      deviceName: '',
    },
  });

  // `useWatch` rather than `watch()`: the latter is not safe to memoise.
  const password = useWatch({ control, name: 'password' });
  const showRules = Boolean(password) && passwordProblems(password).length > 0;

  const errorText = (message?: string) => {
    switch (message) {
      case 'phone':
        return t('auth.invalidPhone');
      case 'weak':
        return t('auth.weakPassword');
      case 'mismatch':
        return t('auth.passwordMismatch');
      default:
        return t('common.required');
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setNotice(null);
    try {
      const profile = await signUp(values.phone, values.password);
      // Held in memory only. The name is not written to `profiles` from the
      // device: that table is server-authoritative, and while RLS is being
      // fixed a client write there would be an unauthenticated write to
      // customer data.
      setDisplayName(values.fullName);
      if (profile.isNewUser) {
        router.replace('/(tabs)');
      }
    } catch {
      setNotice(useAuthStore.getState().error);
    } finally {
      setSubmitting(false);
    }
  });

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
                  {t('common.required')}
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
                  autoCapitalize="none"
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
                {showRules ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {t('auth.passwordRules')}
                  </Text>
                ) : null}
              </View>
            )}
          />

          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, onBlur, value } }) => (
              <View>
                <TextInput
                  mode="outlined"
                  label={t('auth.confirmPassword')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry
                  autoComplete="new-password"
                  error={Boolean(errors.confirmPassword)}
                  testID="register-confirm"
                />
                <HelperText type="error" visible={Boolean(errors.confirmPassword)}>
                  {errorText(errors.confirmPassword?.message)}
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

      <Snackbar visible={Boolean(notice)} onDismiss={() => setNotice(null)} duration={5000}>
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
