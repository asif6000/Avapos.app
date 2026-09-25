import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Snackbar, Text, TextInput, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useTranslation } from '@/hooks/useTheme';
import { requestSupabaseCode, verifySupabaseCode } from '@/supabase/session';
import { useAuthStore } from '@/store/authStore';
import { maskEmail } from '@/utils/format';

/**
 * Optional second verification that gives RLS an `auth.uid()` to scope reads
 * with. It is never required: if this step is skipped or fails, the app keeps
 * reading everything through the REST API and stays fully usable.
 *
 * This grants no write access and no extra authority. It only lets the customer
 * read their own rows directly from Postgres.
 */
export default function SupabaseLinkScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const profile = useAuthStore((state) => state.profile);
  const linkSupabase = useAuthStore((state) => state.linkSupabase);
  const supabaseLink = useAuthStore((state) => state.supabaseLink);

  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'sent' | 'busy' | 'done'>('idle');
  const [notice, setNotice] = useState<string | null>(null);

  const email = profile?.email ?? '';

  const onSendCode = async () => {
    setNotice(null);
    const result = await requestSupabaseCode(email);
    if (result === 'error') {
      setNotice(t('errors.generic'));
      return;
    }
    if (result === 'unlinked') {
      setNotice(t('supabaseLink.unavailable'));
      return;
    }
    setStatus('sent');
  };

  const onVerify = async () => {
    setStatus('busy');
    setNotice(null);
    const result = await verifySupabaseCode(email, code);
    await linkSupabase(email);
    if (result.status === 'linked') {
      setStatus('done');
      setNotice(t('supabaseLink.done'));
      return;
    }
    setStatus('sent');
    setNotice(result.message ?? t('errors.generic'));
    setCode('');
  };

  return (
    <Screen>
      <AppHeader title={t('supabaseLink.title')} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('supabaseLink.explain')}
        </Text>

        <SectionCard>
          <InfoRow label={t('auth.emailLabel')} value={maskEmail(email)} />
          <InfoRow label={t('supabaseLink.status')} value={t(`supabaseLink.state.${supabaseLink}`)} />
        </SectionCard>

        {status === 'sent' || status === 'busy' ? (
          <View>
            <TextInput
              mode="outlined"
              label={t('auth.codeLabel')}
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              testID="supabase-link-code"
            />
            <HelperText type="info" visible>
              {t('supabaseLink.codeHelp')}
            </HelperText>
          </View>
        ) : null}

        <Button
          mode="contained"
          onPress={status === 'sent' || status === 'busy' ? onVerify : onSendCode}
          loading={status === 'busy'}
          disabled={status === 'busy' || email.length === 0}
          contentStyle={styles.buttonContent}
          testID="supabase-link-submit"
        >
          {status === 'sent' || status === 'busy' ? t('common.continue') : t('supabaseLink.sendCode')}
        </Button>

        {status === 'done' ? (
          <Button mode="text" onPress={() => router.back()}>
            {t('common.done')}
          </Button>
        ) : null}
      </ScrollView>

      <Snackbar visible={Boolean(notice)} onDismiss={() => setNotice(null)} duration={5000}>
        {notice ?? ''}
      </Snackbar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  buttonContent: { height: 52 },
});
