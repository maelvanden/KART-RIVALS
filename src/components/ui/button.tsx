import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, fonts, radius, spacing } from '@/theme';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'quiet';
  /** Bouton héros (plus haut, texte plus grand) pour l'action principale d'un écran. */
  size?: 'md' | 'lg';
  /** Icône affichée avant le libellé. */
  icon?: ReactNode;
  loading?: boolean;
};

/**
 * Bouton du design system : aplat Volt pour l'action principale, angles vifs (6 px) et double
 * barre oblique « racing » sur la droite en guise de découpe.
 */
export function Button({ title, variant = 'primary', size = 'md', icon, loading, disabled, style, ...rest }: Props) {
  const textColor = { primary: colors.onNeon, secondary: colors.text, ghost: colors.neon, quiet: colors.textMuted }[variant];
  const slashes = variant === 'primary' || variant === 'secondary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => [
        styles.base,
        size === 'lg' && styles.large,
        styles[variant],
        (disabled || loading) && styles.disabled,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {slashes ? (
        <View style={styles.slashes} pointerEvents="none">
          <View style={[styles.slash, variant === 'primary' ? styles.slashOnVolt : styles.slashOnDark]} />
          <View style={[styles.slash, variant === 'primary' ? styles.slashOnVolt : styles.slashOnDark]} />
        </View>
      ) : null}
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.title, size === 'lg' && styles.titleLarge, { color: textColor }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  large: { minHeight: 60 },
  primary: { backgroundColor: colors.neon },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderStrong },
  ghost: { backgroundColor: 'transparent' },
  quiet: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 17, letterSpacing: 1.2, textTransform: 'uppercase' },
  titleLarge: { fontSize: 21, letterSpacing: 1.6 },
  slashes: { position: 'absolute', right: 14, top: -10, bottom: -10, flexDirection: 'row', gap: 5 },
  slash: { width: 6, transform: [{ skewX: '-24deg' }] },
  slashOnVolt: { backgroundColor: 'rgba(22, 25, 32, 0.14)' },
  slashOnDark: { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
});
