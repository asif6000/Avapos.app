import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { z } from 'zod';

import { ApiError } from '@/api/errors';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useProfile, useUpdateProfile } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { maskPhone } from '@/utils/format';

const schema = z.object({
  fullName: z.string().min(3, 'required'),
  email: z.string().email('email').or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

export default function ProfileScreen() {
  const { t } = useTranslation();
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

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {data?.phone ? maskPhone(data.phone) : ''}
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
                error={Boolean(errors.fullName)}
                testID="profile-name"
              />
              <HelperText type="error" visible={Boolean(errors.fullName)}>
                {t('common.required')}
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
                error={Boolean(errors.email)}
              />
              <HelperText type="error" visible={Boolean(errors.email)}>
                {t('common.required')}
              </HelperText>
            </View>
          )}
        />

        {notice ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
            {notice}
          </Text>
        ) : null}

        <Button
          mode="contained"
          onPress={onSubmit}
          loading={updateProfile.isPending}
          disabled={updateProfile.isPending}
          contentStyle={styles.buttonContent}
          testID="profile-save"
        >
          {t('common.submit')}
        </Button>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  buttonContent: { height: 52 },
});
