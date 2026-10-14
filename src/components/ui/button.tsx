import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, radius, spacing } from '@/theme';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'quiet';
  loading?: boolean;
};

export function Button({ title, variant = 'primary', loading, disabled, style, ...rest }: Props) {
  const textColor = { primary: colors.onNeon, secondary: colors.text, ghost: colors.neon, quiet: colors.textMuted }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => [
        styles.base,
        styles[variant],
        (disabled || loading) && styles.disabled,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.title, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.neon },
  secondary: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent' },
  quiet: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  title: { fontSize: 15, fontWeight: '900', fontStyle: 'italic', letterSpacing: 0.6, textTransform: 'uppercase' },
});
