import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Menu, Text, TextInput, useTheme } from 'react-native-paper';
import { z } from 'zod';

import { ApiError } from '@/api/errors';
import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useCreateTicket } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import type { TicketCategory } from '@/types/domain';

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

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Controller
          control={control}
          name="subject"
          render={({ field: { onChange, onBlur, value } }) => (
            <View>
              <TextInput
                mode="outlined"
                label={t('support.subject')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={Boolean(errors.subject)}
                testID="ticket-subject"
              />
              <HelperText type="error" visible={Boolean(errors.subject)}>
                {t('common.required')}
              </HelperText>
            </View>
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
              <Button mode="outlined" onPress={() => setMenuVisible(true)} testID="ticket-category">
                {category}
              </Button>
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
            <View>
              <TextInput
                mode="outlined"
                label={t('support.message')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                multiline
                numberOfLines={6}
                error={Boolean(errors.message)}
                testID="ticket-message"
              />
              <HelperText type="error" visible={Boolean(errors.message)}>
                {t('common.required')}
              </HelperText>
            </View>
          )}
        />

        {notice ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error }} testID="ticket-error">
            {notice}
          </Text>
        ) : null}

        <Button
          mode="contained"
          onPress={onSubmit}
          loading={createTicket.isPending}
          disabled={createTicket.isPending}
          contentStyle={styles.buttonContent}
          testID="ticket-submit"
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
