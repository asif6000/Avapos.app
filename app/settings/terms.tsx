import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { AppHeader } from '@/components/AppHeader';
import { Screen } from '@/components/Screen';
import { TERMS_SECTIONS } from '@/content/legal';
import { useTranslation } from '@/hooks/useTheme';

export default function TermsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Screen>
      <AppHeader title={t('settings.terms')} />
      <ScrollView contentContainerStyle={styles.content}>
        {TERMS_SECTIONS.map((section) => (
          <View key={section.heading}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
              {section.heading}
            </Text>
            {section.body.map((paragraph, index) => (
              <Text key={index} variant="bodyMedium" style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 18, paddingBottom: 48 },
  paragraph: { marginTop: 4 },
});
