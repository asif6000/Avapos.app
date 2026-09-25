import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, HelperText, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';
import { z } from 'zod';

import { Screen } from '@/components/Screen';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { isValidEmail, maskEmail } from '@/utils/format';

const schema = z.object({
  email: z
    .string()
    .min(1, 'required')
    .refine((value) => isValidEmail(value), { message: 'email' }),
  password: z.string().min(1, 'required'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const signIn = useAuthStore((state) => state.signIn);
  const lastEmail = useAuthStore((state) => state.lastEmail);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: lastEmail ?? '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setNotice(null);
    try {
      await signIn(values.email, values.password);
      // Straight into the app: staying on the form after a successful sign-in
      // looks like nothing happened.
      router.replace('/(tabs)');
    } catch {
      // The store holds a customer-safe message; never echo a driver error.
      setNotice(useAuthStore.getState().error);
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
                  label={t('auth.email')}
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

          <View style={styles.footer}>
            <Button mode="text" onPress={() => router.push('/(auth)/register')}>
              {t('auth.noAccount')}
            </Button>
          </View>

          {lastEmail ? (
            <Text variant="bodySmall" style={styles.note}>
              {t('auth.welcomeBack', { email: maskEmail(lastEmail) })}
            </Text>
          ) : null}
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
  note: { textAlign: 'center', marginTop: 16 },
  footer: { marginTop: 8, alignItems: 'center' },
});
