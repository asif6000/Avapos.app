import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Snackbar, Text, useTheme } from 'react-native-paper';
import { z } from 'zod';

import { Screen } from '@/components/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { Field } from '@/components/ui/Field';
import { spacing, useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';
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
  const { gutter } = useLayout();

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
        <View style={[styles.container, { paddingHorizontal: gutter }]}>
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
                helper={
                  errors.email
                    ? errors.email?.message === 'email'
                      ? t('auth.invalidEmail')
                      : t('common.required')
                    : null
                }
                testID="login-email"
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <Field
                label={t('auth.password')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry
                autoComplete="current-password"
                error={Boolean(errors.password)}
                helper={errors.password ? t('common.required') : null}
                testID="login-password"
              />
            )}
          />

          <AppButton
            size="lg"
            block
            label={t('auth.signIn')}
            loading={submitting}
            disabled={submitting}
            testID="login-submit"
            onPress={onSubmit}
          />

          <View style={styles.footer}>
            <AppButton variant="text" label={t('auth.noAccount')} onPress={() => router.push('/(auth)/register')} />
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
  // Centred, width-capped: the form stays a form on a tablet instead of
  // stretching two inputs across a shop counter screen.
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.xs,
  },
  header: { marginBottom: spacing.xl, gap: 2 },
  footer: { marginTop: spacing.md, alignItems: 'center' },
  note: { textAlign: 'center', marginTop: spacing.lg },
});
