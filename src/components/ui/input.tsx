import { Platform, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, fonts, radius, spacing } from '@/theme';

export function Input({ label, style, ...rest }: TextInputProps & { label: string }) {
  return (
    <View style={styles.wrapper}>
      <Text variant="label">{label}</Text>
      <TextInput placeholderTextColor={colors.textMuted} style={[styles.input, style]} {...rest} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  input: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontFamily: fonts.medium,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : {}),
  },
});
