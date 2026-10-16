import { StyleSheet, Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts } from '@/theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'mono';

const DISPLAY_VARIANTS: Variant[] = ['display', 'title', 'heading'];

/**
 * Avec des polices chargées, chaque graisse est une famille à part : `fontWeight` seul ne suffit pas
 * (Android retombe sur la police système). On traduit donc la graisse demandée en famille :
 * Oswald pour les titres et les gros chiffres, Inter pour tout le reste.
 */
function resolveFont(variant: Variant, style: TextStyle): TextStyle {
  if (style.fontFamily) return {};
  const weight = Number(style.fontWeight === 'bold' ? 700 : (style.fontWeight ?? 400));
  const size = style.fontSize ?? 15;
  const display = DISPLAY_VARIANTS.includes(variant) || (size >= 22 && weight >= 800);
  const family = display
    ? weight >= 700
      ? fonts.display
      : fonts.displayMedium
    : weight >= 800
      ? fonts.extrabold
      : weight >= 700
        ? fonts.bold
        : weight >= 600
          ? fonts.semibold
          : weight >= 500
            ? fonts.medium
            : fonts.regular;
  return { fontFamily: family, fontWeight: 'normal', fontStyle: 'normal' };
}

/**
 * Oswald dépasse de sa boîte de ligne par défaut : sans hauteur de ligne explicite, iOS rogne le haut et
 * le bas des lettres (les « O » deviennent des « 0 »). On en fixe une proportionnelle à la taille.
 */
function displayLineHeight(style: TextStyle, font: TextStyle): TextStyle {
  const family = style.fontFamily ?? font.fontFamily;
  if (style.lineHeight || (family !== fonts.display && family !== fonts.displayMedium)) return {};
  return { lineHeight: Math.ceil((style.fontSize ?? 15) * 1.35) };
}

export function Text({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  const flat = StyleSheet.flatten([styles.base, styles[variant], style]);
  const font = resolveFont(variant, flat);
  return <RNText style={[flat, font, displayLineHeight(flat, font)]} {...rest} />;
}

const styles = StyleSheet.create({
  base: { color: colors.text },
  display: { fontSize: 52, fontWeight: '700', textTransform: 'uppercase', lineHeight: 56, letterSpacing: 0.3 },
  title: { fontSize: 34, fontWeight: '700', textTransform: 'uppercase', lineHeight: 40, letterSpacing: 0.3 },
  heading: { fontSize: 20, fontWeight: '600', textTransform: 'uppercase', lineHeight: 25, letterSpacing: 0.4 },
  body: { fontSize: 15, fontWeight: '500', lineHeight: 21 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase', color: colors.textMuted },
  caption: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  mono: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
