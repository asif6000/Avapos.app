import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { Field } from '@/components/ui/Field';
import { z } from 'zod';

import { ApiError } from '@/api/errors';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/Screen';
import { useProfile, useUpdateProfile } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { maskPhone } from '@/utils/format';
import { useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';

const schema = z.object({
  fullName: z.string().min(3, 'required'),
  email: z.string().email('email').or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

export default function ProfileScreen() {
  const { gutter } = useLayout();
  const { t } = useTranslation();

  const errorText = (message?: string) => {
    switch (message) {
      case 'email':
        return t('auth.invalidEmail');
      default:
        return t('common.required');
    }
  };
  const theme = useTheme();
  const { data } = useProfile();
  const updateProfile = useUpdateProfile();
  const [notice, setNotice] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: {
      fullName: data?.fullName ?? '',
      email: data?.email ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setNotice(null);
    try {
      await updateProfile.mutateAsync({
        fullName: values.fullName.trim(),
        email: values.email.trim() ? values.email.trim() : undefined,
      });
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : t('errors.generic'));
    }
  });

  return (
    <Screen>
      <AppHeader title={t('settings.profile')} />

      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]} keyboardShouldPersistTaps="handled">
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {data?.phone ? maskPhone(data.phone) : ''}
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
              testID="profile-name"
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Field
              label={t('auth.email')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              keyboardType="email-address"
              autoComplete="email"
              autoCapitalize="none"
              error={Boolean(errors.email)}
              helper={errors.email ? errorText(errors.email?.message) : null}
              testID="profile-email"
            />
          )}
        />

        {notice ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
            {notice}
          </Text>
        ) : null}

        <AppButton
          onPress={onSubmit}
          loading={updateProfile.isPending}
          disabled={updateProfile.isPending}
          testID="profile-save"
         label={t('common.submit')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 12, paddingBottom: 48 },
  buttonContent: { height: 52 },
});
