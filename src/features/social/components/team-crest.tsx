import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { DEFAULT_TEAM_COLOR } from '@/features/social/colors';
import { colors, fonts, radius } from '@/theme';

type Props = { tag: string; logoUrl: string | null; color?: string | null; size?: number };

/**
 * Blason d'écurie : le logo envoyé par le Team Principal, sinon un écusson frappé du tag.
 * L'écusson est fait de deux calques : le corps sombre, et le liseré + bandes teintés à la couleur de l'écurie.
 */
export function TeamCrest({ tag, logoUrl, color, size = 72 }: Props) {
  const accent = color ?? DEFAULT_TEAM_COLOR;
  if (logoUrl) {
    return (
      <View style={[styles.logoFrame, { width: size, height: size, borderColor: accent }]}>
        <Image source={{ uri: logoUrl }} style={styles.fill} contentFit="cover" accessibilityLabel={`Blason ${tag}`} />
      </View>
    );
  }
  const height = size * 1.16;
  return (
    <View style={{ width: size, height }} accessibilityLabel={`Blason ${tag}`}>
      <Image source={require('../../../../assets/images/team-crest-body.svg')} style={styles.fill} contentFit="contain" />
      <Image
        source={require('../../../../assets/images/team-crest-trim.svg')}
        style={styles.fill}
        contentFit="contain"
        tintColor={accent}
      />
      <View style={styles.tagWrap}>
        <Text style={[styles.tag, { color: accent, fontSize: size * (tag.length > 3 ? 0.24 : 0.3), lineHeight: size * 0.4 }]}>
          {tag}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  logoFrame: {
    borderRadius: radius.md,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  tagWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: '8%' },
  tag: { fontFamily: fonts.display, letterSpacing: 1 },
});
