import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';

import { spacing } from '@/theme/layout';

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Shown under the field. `error` puts it in the error style. */
  helper?: string | null;
  error?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  autoComplete?: 'email' | 'name' | 'current-password' | 'new-password' | 'off';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  numberOfLines?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A labelled input with its validation message.
 *
 * Every field in the app is this component, so the label sits above the box, the
 * error appears in the same place every time, and nothing has to remember to
 * add the four pixels of space that stops the message touching the next field.
 */
export function Field({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  helper,
  error = false,
  secureTextEntry,
  keyboardType = 'default',
  autoComplete,
  autoCapitalize,
  multiline = false,
  numberOfLines,
  testID,
  style,
}: FieldProps) {
  return (
    <View style={[styles.wrapper, style]}>
      <TextInput
        mode="outlined"
        label={label}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoComplete === 'email' ? false : undefined}
        error={error}
        multiline={multiline}
        numberOfLines={numberOfLines}
        testID={testID}
        outlineStyle={styles.outline}
        contentStyle={multiline ? styles.multiline : styles.input}
      />
      {helper ? (
        <HelperText type={error ? 'error' : 'info'} visible padding="none" style={styles.helper}>
          {helper}
        </HelperText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs, marginBottom: spacing.md },
  outline: { borderRadius: 14 },
  // 52dp: a thumb-sized target, and a line of text that is not cramped on a
  // 1.5x display.
  input: { minHeight: 52, paddingVertical: spacing.md },
  multiline: { minHeight: 120, paddingTop: spacing.md, textAlignVertical: 'top' },
  helper: { marginTop: 2 },
});
