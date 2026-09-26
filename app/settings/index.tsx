import * as Application from 'expo-application';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Dialog, Portal, Switch, Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { AppIcon } from '@/components/AppIcon';
import { SectionCard } from '@/components/SectionCard';
import { AppButton } from '@/components/ui/AppButton';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/Screen';
import { useProfile, useSettings, useUpdateSettings } from '@/hooks/queries';
import { useTranslation } from '@/hooks/useTheme';
import { registerForPushNotifications } from '@/services/notifications';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { maskPhone } from '@/utils/format';
import { radius, spacing, useLayout, CONTENT_MAX_WIDTH } from '@/theme/layout';
import type { AppTheme } from '@/theme/theme';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { gutter } = useLayout();
  const router = useRouter();
  const signOut = useAuthStore((state) => state.signOut);
  const language = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const themePreference = usePreferencesStore((state) => state.theme);
  const setThemePreference = usePreferencesStore((state) => state.setTheme);

  const { data: profile } = useProfile();
  const directReads = useAuthStore((state) => state.directReadsEnabled);
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  return (
    <Screen>
      <AppHeader title={t('settings.title')} />

      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
        {/* Cards and rows, like every other screen. Paper's `List` drew its own
            dividers, padding and type scale, and Settings was the one page in the
            app that looked like it had been built by somebody else. */}
        <SectionCard title={t('settings.profile')}>
          <ListRow
            title={profile?.fullName ?? '—'}
            subtitle={[profile?.phone ? maskPhone(profile.phone) : null, profile?.email]
              .filter(Boolean)
              .join(' · ')}
            icon="account-circle-outline"
            onPress={() => router.push('/settings/profile')}
            testID="settings-profile"
          />
        </SectionCard>

        <SectionCard title={t('settings.language')}>
          <ListRow
            title={t('settings.english')}
            leading={<Selection value={language === 'en'} />}
            onPress={() => void setLanguage('en')}
            showChevron={false}
          />
          <Divider />
          <ListRow
            title={t('settings.bengali')}
            leading={<Selection value={language === 'bn'} />}
            onPress={() => void setLanguage('bn')}
            showChevron={false}
          />
        </SectionCard>

        <SectionCard title={t('settings.theme')}>
          {(['system', 'light', 'dark'] as const).map((option, index) => (
            <View key={option}>
              {index > 0 ? <Divider /> : null}
              <ListRow
                title={t(
                  option === 'system'
                    ? 'settings.system'
                    : option === 'light'
                      ? 'settings.light'
                      : 'settings.dark',
                )}
                leading={<Selection value={themePreference === option} />}
                onPress={() => void setThemePreference(option)}
                showChevron={false}
              />
            </View>
          ))}
        </SectionCard>

        <SectionCard title={t('settings.notifications')}>
          <ListRow
            title={t('notifications.paymentReminders')}
            leading={<Toggle value={settings?.paymentRemindersEnabled ?? true} />}
            onPress={() => {
              void updateSettings
                .mutateAsync({ paymentRemindersEnabled: !(settings?.paymentRemindersEnabled ?? true) })
                .catch(() => undefined);
            }}
            showChevron={false}
          />
          <Divider />
          <ListRow
            title={t('notifications.deviceAlerts')}
            leading={<Toggle value={settings?.deviceStatusAlertsEnabled ?? true} />}
            onPress={() => {
              void updateSettings
                .mutateAsync({
                  deviceStatusAlertsEnabled: !(settings?.deviceStatusAlertsEnabled ?? true),
                })
                .catch(() => undefined);
            }}
            showChevron={false}
          />
          <Divider />
          <ListRow
            title={t('notifications.settings')}
            subtitle={t('notifications.pushDenied')}
            icon="bell-outline"
            onPress={() => {
              void registerForPushNotifications();
            }}
            testID="settings-notifications"
          />
        </SectionCard>

        <SectionCard title={t('settings.legal')}>
          <ListRow
            title={t('settings.terms')}
            onPress={() => router.push('/settings/terms')}
            testID="settings-terms"
          />
          <Divider />
          <ListRow
            title={t('settings.privacy')}
            onPress={() => router.push('/settings/privacy')}
            testID="settings-privacy"
          />
          <Divider />
          <ListRow
            title={t('settings.managementAgreement')}
            onPress={() => router.push('/settings/management-agreement')}
          />
          <Divider />
          <ListRow
            title={t('supabaseLink.title')}
            subtitle={directReads ? t('supabaseLink.state.linked') : t('supabaseLink.state.disabled')}
            icon="shield-lock-outline"
            onPress={() => router.push('/settings/supabase-link')}
            testID="settings-supabase-link"
          />
        </SectionCard>

        <SectionCard title={t('settings.about')}>
          <ListRow
            title={t('settings.about')}
            subtitle={`${t('settings.version')} ${Application.nativeApplicationVersion ?? '1.0.0'}`}
            icon="information-outline"
            onPress={() => router.push('/settings/about')}
          />
        </SectionCard>

        <AppButton
          block
          variant="outline"
          onPress={() => setConfirmSignOut(true)}
          testID="settings-signout"
          label={t('settings.signOut')}
        />
      </ScrollView>

      <Portal>
        <Dialog visible={confirmSignOut} onDismiss={() => setConfirmSignOut(false)}>
          <Dialog.Title>{t('settings.signOut')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{t('settings.signOutConfirm')}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <AppButton variant="text" onPress={() => setConfirmSignOut(false)} label={t('common.cancel')} />
            <AppButton
              variant="danger"
              onPress={async () => {
                setConfirmSignOut(false);
                await signOut();
                router.replace('/(auth)/login');
              }}
              label={t('auth.signOut')}
            />
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

/**
 * The on/off control, in the leading slot.
 *
 * Paper's `Switch` in a `right` prop is what made this page look borrowed, and it
 * also put a small target at the far edge of a row whose whole width is the
 * target. Here the switch only shows the state, and the row does the tapping —
 * `pointerEvents="none"` makes that literal rather than a doubled-up control
 * under a thumb.
 */
/**
 * The marker for a single-choice list.
 *
 * Language and appearance allow exactly one answer, so a row of them wearing
 * on/off switches was a control that lied: two of them could be read as "on" at
 * once. The same filled ring the payment method list uses keeps one visual
 * language for "this one is chosen" across the app.
 */
function Selection({ value }: { value: boolean }) {
  const theme = useTheme<AppTheme>();
  return (
    <View
      style={[
        styles.radio,
        {
          borderColor: value ? theme.colors.primary : theme.colors.outlineVariant,
          backgroundColor: value ? theme.colors.primary : 'transparent',
        },
      ]}
    >
      {value ? <AppIcon name="check" size={14} color="#FFFFFF" /> : null}
    </View>
  );
}

function Toggle({ value }: { value: boolean }) {
  return (
    <View pointerEvents="none" style={styles.toggle}>
      <Switch value={value} />
    </View>
  );
}

function Divider() {
  const theme = useTheme<AppTheme>();
  return <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />;
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingBottom: 48,
    gap: spacing.md,
  },
  toggle: { width: 52, alignItems: 'flex-end' },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.lg },
});
