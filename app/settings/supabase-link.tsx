import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/ui/AppButton';
import { Screen } from '@/components/Screen';
import { InfoRow, SectionCard } from '@/components/SectionCard';
import { useTranslation } from '@/hooks/useTheme';
import { canReadDirectly } from '@/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';

/**
 * Sign-in happens through Supabase Auth, so there is no separate "link" step
 * left to perform — the customer is already authenticated by the time they see
 * this screen.
 *
 * What is worth showing here is *how* their data is being read, because that is
 * a privacy commitment rather than a setting: with a signed-in Supabase session
 * every query is scoped by RLS to their own rows, and the payments and device
 * state on the other side of the API are never read directly from the app.
 */
export default function SupabaseLinkScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { gutter } = useLayout();
  const router = useRouter();
  const directReadsEnabled = useAuthStore((state) => state.directReadsEnabled);
  const [checkedAt] = useState(() => new Date().toISOString());

  const configured = canReadDirectly();

  return (
    <Screen>
      <AppHeader title={t('supabaseLink.title')} />

      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {t('supabaseLink.explain')}
        </Text>

        <SectionCard>
          <InfoRow
            label={t('supabaseLink.status')}
            value={configured ? t('supabaseLink.state.configured') : t('supabaseLink.state.disabled')}
          />
          <InfoRow
            label={t('supabaseLink.directReads')}
            value={
              directReadsEnabled ? t('supabaseLink.state.enabled') : t('supabaseLink.state.off')
            }
          />
          <InfoRow
            label={t('supabaseLink.identity')}
            value={t('supabaseLink.state.emailCode')}
            tone="muted"
          />
          <InfoRow
            label={t('supabaseLink.checkedAt')}
            value={new Date(checkedAt).toLocaleString()}
            tone="muted"
          />
        </SectionCard>

        {!directReadsEnabled ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error }}>
            {t('supabaseLink.readsDisabled')}
          </Text>
        ) : null}

        <AppButton
          variant="text"
          onPress={() => router.back()}
         label={t('common.done')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: 0, gap: 14, paddingBottom: 48 },
  buttonContent: { height: 48 },
});
