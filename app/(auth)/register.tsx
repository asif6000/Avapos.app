import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Snackbar, Text, useTheme } from 'react-native-paper';
import { z } from 'zod';

import { Screen } from '@/components/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { Field } from '@/components/ui/Field';
import { spacing, useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';
import { useTranslation } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/authStore';
import { isValidEmail, passwordProblems } from '@/utils/format';

const schema = z
  .object({
    fullName: z.string().min(3, 'required'),
    email: z
      .string()
      .min(1, 'required')
      .refine((value) => isValidEmail(value), { message: 'email' }),
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
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const { gutter } = useLayout();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      email: '',
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
      case 'email':
        return t('auth.invalidEmail');
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
      const profile = await signUp(values.email, values.password);
      // Held in memory only. The name is not written to `profiles` from the
      // device: that table is server-authoritative, and while RLS is being
      // fixed a client write there would be an unauthenticated write to
      // customer data.
      setDisplayName(values.fullName);
      if (profile.confirmed) {
        router.replace('/(tabs)');
        return;
      }
      // The account exists but the address is not confirmed yet, so there is no
      // session. Say so, and send them to sign in rather than dropping them on a
      // blank dashboard.
      setAwaitingConfirmation(true);
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
        <ScrollView
          contentContainerStyle={[styles.container, { paddingHorizontal: gutter }]}
          keyboardShouldPersistTaps="handled"
        >
          {awaitingConfirmation ? (
            <View style={styles.confirmed}>
              <Text
                variant="headlineSmall"
                style={{ color: theme.colors.primary, fontWeight: '700' }}
              >
                {t('auth.checkInboxTitle')}
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t('auth.checkInboxBody')}
              </Text>
              <AppButton
                size="lg"
                block
                label={t('auth.signIn')}
                testID="register-goto-login"
                onPress={() => router.replace('/(auth)/login')}
              />
            </View>
          ) : (
            <>
          <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
            {t('auth.createAccount')}
          </Text>

          <Controller
            control={control}
            name="fullName"
            render={({ field: { onChange, onBlur, value } }) => (
              <Field
                label={t('auth.fullName')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoComplete="name"
                error={Boolean(errors.fullName)}
                helper={errors.fullName ? t('common.required') : null}
                testID="register-name"
              />
            )}
          />

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Field
                label={t('auth.email')}
                placeholder="name@example.com"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
                error={Boolean(errors.email)}
                helper={errors.email ? errorText(errors.email?.message) : null}
                testID="register-email"
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <>
                <Field
                  label={t('auth.password')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry
                  autoComplete="new-password"
                  error={Boolean(errors.password)}
                  helper={errors.password ? errorText(errors.password?.message) : null}
                  testID="register-password"
                />
                {showRules ? (
                  <Text
                    variant="bodySmall"
                    style={[styles.rules, { color: theme.colors.onSurfaceVariant }]}
                  >
                    {t('auth.passwordRules')}
                  </Text>
                ) : null}
              </>
            )}
          />

          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, onBlur, value } }) => (
              <Field
                label={t('auth.confirmPassword')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry
                autoComplete="new-password"
                error={Boolean(errors.confirmPassword)}
                helper={errors.confirmPassword ? errorText(errors.confirmPassword?.message) : null}
                testID="register-confirm"
              />
            )}
          />

          <Controller
            control={control}
            name="deviceName"
            render={({ field: { onChange, onBlur, value } }) => (
              <Field
                label={t('auth.deviceName')}
                placeholder="Samsung Galaxy A15"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={Boolean(errors.deviceName)}
                helper={errors.deviceName ? t('common.required') : null}
                testID="register-device"
              />
            )}
          />

          <AppButton
            size="lg"
            block
            label={t('auth.createAccount')}
            loading={submitting}
            disabled={submitting}
            testID="register-submit"
            onPress={onSubmit}
          />

          <View style={styles.footer}>
            <AppButton
              variant="text"
              label={t('auth.haveAccount')}
              onPress={() => router.push('/(auth)/login')}
            />
          </View>
            </>
          )}
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
  container: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  rules: { marginTop: -spacing.xs, marginBottom: spacing.md },
  footer: { marginTop: spacing.sm, alignItems: 'center' },
  confirmed: { gap: spacing.md, paddingTop: spacing.xl },
});
