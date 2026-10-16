import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { gearArt } from '@/features/garage/art';
import { rarityMeta, type GearItem } from '@/features/garage/catalog';
import { colors, radius } from '@/theme';

type Props = {
  item: GearItem;
  size: number;
  /** Fond dégradé à la couleur de la rareté. */
  showcase?: boolean;
  /** Objet pas encore débloqué : visuel assombri. */
  dimmed?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Visuel d'un équipement (SVG générique embarqué, aucun logo de marque). */
export function GearArt({ item, size, showcase = false, dimmed = false, style }: Props) {
  const color = rarityMeta[item.rarity].color;
  const image = (
    <Image
      source={gearArt[item.id] ?? gearArt[`${item.slot === 'rib_protector' ? 'rib' : item.slot}-rental`]}
      style={{ width: size, height: size, opacity: dimmed ? 0.35 : 1 }}
      contentFit="contain"
      accessibilityLabel={item.name}
    />
  );
  if (!showcase) return <View style={style}>{image}</View>;
  return (
    <LinearGradient
      colors={[`${color}55`, `${color}10`, colors.surfaceAlt]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[styles.showcase, { borderColor: `${color}66` }, style]}>
      {image}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  showcase: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1 },
});
