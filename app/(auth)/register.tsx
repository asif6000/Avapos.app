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

const schema = z.object({
  fullName: z.string().min(3, 'required'),
  deviceName: z.string().min(2, 'required'),
});

type FormValues = z.infer<typeof schema>;

/**
 * Finish setting up a just-verified account. The email and the code were
 * already handled; all that is left is the name we will address the customer
 * by and the device this contract covers.
 */
export default function RegisterScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const completeRegistration = useAuthStore((state) => state.completeRegistration);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', deviceName: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    setNotice(null);
    try {
      await completeRegistration({
        fullName: values.fullName,
        deviceName: values.deviceName,
        agreementVersion: DEVICE_MANAGEMENT_AGREEMENT_VERSION,
      });
      router.replace('/(tabs)');
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : t('errors.generic'));
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
          <Text
            variant="headlineSmall"
            style={{ color: theme.colors.onSurface, fontWeight: '700' }}
          >
            {t('auth.createAccount')}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('auth.finishSetup')}
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
            {t('common.done')}
          </Button>

          <View style={styles.footer}>
            <Button mode="text" onPress={() => router.replace('/(tabs)')}>
              {t('common.skip')}
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
