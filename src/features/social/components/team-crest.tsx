import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors, fonts, radius } from '@/theme';

type Props = { tag: string; logoUrl: string | null; size?: number };

/** Blason d'écurie : le logo envoyé par le Team Principal, sinon un écusson Volt frappé du tag. */
export function TeamCrest({ tag, logoUrl, size = 72 }: Props) {
  if (logoUrl) {
    return (
      <View style={[styles.logoFrame, { width: size, height: size }]}>
        <Image source={{ uri: logoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={`Blason ${tag}`} />
      </View>
    );
  }
  const height = size * 1.16;
  return (
    <View style={{ width: size, height }} accessibilityLabel={`Blason ${tag}`}>
      <Image source={require('../../../../assets/images/team-crest.svg')} style={StyleSheet.absoluteFill} contentFit="contain" />
      <View style={styles.tagWrap}>
        <Text style={[styles.tag, { fontSize: size * (tag.length > 3 ? 0.24 : 0.3), lineHeight: size * 0.36 }]}>{tag}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logoFrame: {
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.neon,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  tagWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: '8%' },
  tag: { fontFamily: fonts.display, color: colors.neon, letterSpacing: 1 },
});
