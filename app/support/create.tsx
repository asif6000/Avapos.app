import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Menu, Text, useTheme } from 'react-native-paper';

import { Field } from '@/components/ui/Field';
import { z } from 'zod';

import { ApiError } from '@/api/errors';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/Screen';
import { useCreateTicket } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import type { TicketCategory } from '@/types/domain';
import { useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';

const schema = z.object({
  subject: z.string().min(4, 'required').max(120, 'required'),
  message: z.string().min(10, 'required').max(2000, 'required'),
  category: z.enum(['PAYMENT', 'DEVICE', 'INSTALLMENT', 'ACCOUNT', 'OTHER']),
});

type FormValues = z.infer<typeof schema>;

const CATEGORIES: TicketCategory[] = ['PAYMENT', 'DEVICE', 'INSTALLMENT', 'ACCOUNT', 'OTHER'];

export default function CreateTicketScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { gutter } = useLayout();
  const router = useRouter();
  const createTicket = useCreateTicket();
  const [menuVisible, setMenuVisible] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { subject: '', message: '', category: 'PAYMENT' },
  });

  const category = useWatch({ control, name: 'category' });

  const onSubmit = handleSubmit(async (values) => {
    setNotice(null);
    try {
      const ticket = await createTicket.mutateAsync({
        subject: values.subject.trim(),
        message: values.message.trim(),
        category: values.category,
      });
      router.replace({ pathname: '/support/[id]', params: { id: ticket.id } });
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : t('errors.generic'));
    }
  });

  return (
    <Screen>
      <AppHeader title={t('support.createTicket')} />

      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]} keyboardShouldPersistTaps="handled">
        <Controller
          control={control}
          name="subject"
          render={({ field: { onChange, onBlur, value } }) => (
            <Field
              label={t('support.subject')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={Boolean(errors.subject)}
              helper={errors.subject ? t('common.required') : null}
              testID="ticket-subject"
            />
          )}
        />

        <View>
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('support.category')}
          </Text>
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <AppButton variant="outline" onPress={() => setMenuVisible(true)} testID="ticket-category" label={category} />
            }
          >
            {CATEGORIES.map((option) => (
              <Menu.Item
                key={option}
                title={option}
                onPress={() => {
                  setValue('category', option);
                  setMenuVisible(false);
                }}
              />
            ))}
          </Menu>
        </View>

        <Controller
          control={control}
          name="message"
          render={({ field: { onChange, onBlur, value } }) => (
            <Field
              label={t('support.message')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              multiline
              numberOfLines={6}
              error={Boolean(errors.message)}
              helper={errors.message ? t('common.required') : null}
              testID="ticket-message"
            />
          )}
        />

        {notice ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error }} testID="ticket-error">
            {notice}
          </Text>
        ) : null}

        <AppButton
          onPress={onSubmit}
          loading={createTicket.isPending}
          disabled={createTicket.isPending}
          testID="ticket-submit"
         label={t('common.submit')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 12, paddingBottom: 48 },
  buttonContent: { height: 52 },
});
