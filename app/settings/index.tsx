import * as Application from 'expo-application';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Dialog, List, Portal, Switch, Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { useProfile, useSettings, useUpdateSettings } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { registerForPushNotifications } from '@/services/notifications';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { maskPhone } from '@/utils/format';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const signOut = useAuthStore((state) => state.signOut);
  const language = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const themePreference = usePreferencesStore((state) => state.theme);
  const setThemePreference = usePreferencesStore((state) => state.setTheme);

  const { data: profile } = useProfile();
  const supabaseLink = useAuthStore((state) => state.supabaseLink);
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  return (
    <Screen>
      <AppHeader title={t('settings.title')} />

      <ScrollView contentContainerStyle={styles.content}>
        <List.Section>
          <List.Subheader>{t('settings.profile')}</List.Subheader>
          <List.Item
            title={profile?.fullName ?? '—'}
            description={[profile?.phone ? maskPhone(profile.phone) : null, profile?.email]
              .filter(Boolean)
              .join(' · ')}
            onPress={() => router.push('/settings/profile')}
            testID="settings-profile"
          />
        </List.Section>

        <List.Section>
          <List.Subheader>{t('settings.language')}</List.Subheader>
          <List.Item
            title={t('settings.english')}
            right={() => (
              <Switch value={language === 'en'} onValueChange={() => void setLanguage('en')} />
            )}
          />
          <List.Item
            title={t('settings.bengali')}
            right={() => (
              <Switch value={language === 'bn'} onValueChange={() => void setLanguage('bn')} />
            )}
          />
        </List.Section>

        <List.Section>
          <List.Subheader>{t('settings.theme')}</List.Subheader>
          {(['system', 'light', 'dark'] as const).map((option) => (
            <List.Item
              key={option}
              title={t(
                option === 'system'
                  ? 'settings.system'
                  : option === 'light'
                    ? 'settings.light'
                    : 'settings.dark',
              )}
              onPress={() => void setThemePreference(option)}
            right={() => (
              <Switch
                value={themePreference === option}
                onValueChange={() => {
                  void setThemePreference(option);
                }}
              />
            )}
            />
          ))}
        </List.Section>

        <List.Section>
          <List.Subheader>{t('settings.notifications')}</List.Subheader>
          <List.Item
            title={t('notifications.paymentReminders')}
            right={() => (
              <Switch
                value={settings?.paymentRemindersEnabled ?? true}
                onValueChange={(value) => {
                  void updateSettings
                    .mutateAsync({ paymentRemindersEnabled: value })
                    .catch(() => undefined);
                }}
              />
            )}
          />
          <List.Item
            title={t('notifications.deviceAlerts')}
            right={() => (
              <Switch
                value={settings?.deviceStatusAlertsEnabled ?? true}
                onValueChange={(value) => {
                  void updateSettings
                    .mutateAsync({ deviceStatusAlertsEnabled: value })
                    .catch(() => undefined);
                }}
              />
            )}
          />
          <List.Item
            title={t('notifications.settings')}
            description={t('notifications.pushDenied')}
            onPress={() => {
              void registerForPushNotifications();
            }}
            testID="settings-notifications"
          />
        </List.Section>

        <List.Section>
          <List.Subheader>{t('settings.legal')}</List.Subheader>
          <List.Item title={t('settings.terms')} onPress={() => router.push('/settings/terms')} />
          <List.Item title={t('settings.privacy')} onPress={() => router.push('/settings/privacy')} />
          <List.Item
            title={t('settings.managementAgreement')}
            onPress={() => router.push('/settings/management-agreement')}
          />
        </List.Section>

        <List.Section>
          <List.Item
            title={t('supabaseLink.title')}
            description={t(`supabaseLink.state.${supabaseLink}`)}
            onPress={() => router.push('/settings/supabase-link')}
            testID="settings-supabase-link"
          />
        </List.Section>

        <List.Section>
          <List.Item
            title={t('settings.about')}
            description={`${t('settings.version')} ${Application.nativeApplicationVersion ?? '1.0.0'}`}
            onPress={() => router.push('/settings/about')}
          />
        </List.Section>

        <Button
          mode="outlined"
          onPress={() => setConfirmSignOut(true)}
          buttonColor={theme.colors.error}
          textColor={theme.colors.error}
          contentStyle={styles.buttonContent}
          testID="settings-signout"
        >
          {t('settings.signOut')}
        </Button>

      </ScrollView>

      <Portal>
        <Dialog visible={confirmSignOut} onDismiss={() => setConfirmSignOut(false)}>
          <Dialog.Title>{t('settings.signOut')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{t('settings.signOutConfirm')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmSignOut(false)}>{t('common.cancel')}</Button>
            <Button
              onPress={async () => {
                setConfirmSignOut(false);
                await signOut();
                router.replace('/(auth)/login');
              }}
            >
              {t('auth.signOut')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 48 },
  buttonContent: { height: 52, marginHorizontal: 16, marginTop: 8 },
});
