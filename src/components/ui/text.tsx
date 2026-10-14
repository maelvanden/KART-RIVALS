import { StyleSheet, Text as RNText, type TextProps } from 'react-native';

import { colors } from '@/theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'mono';

export function Text({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  return <RNText style={[styles.base, styles[variant], style]} {...rest} />;
}

const styles = StyleSheet.create({
  base: { color: colors.text },
  display: { fontSize: 44, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1 },
  title: { fontSize: 28, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5 },
  heading: { fontSize: 18, fontWeight: '800' },
  body: { fontSize: 15, fontWeight: '500', lineHeight: 21 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase', color: colors.textMuted },
  caption: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  mono: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
