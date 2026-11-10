import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { colors, radius } from '@/theme';

type Props = {
  /** Bannière de l'organisateur ; à défaut la photo du circuit, à défaut un fond aux couleurs de l'appli. */
  bannerUrl: string | null;
  coverUrl?: string | null;
  height: number;
  /** Contenu posé en bas de la bannière (titre, statut). */
  children?: ReactNode;
};

/** Bannière d'un tournoi : image plein cadre fondue vers le bas pour garder le texte lisible. */
export function TournamentBanner({ bannerUrl, coverUrl, height, children }: Props) {
  const image = bannerUrl ?? coverUrl ?? null;
  return (
    <View style={[styles.banner, { height }]}>
      {image ? (
        <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <LinearGradient
          colors={['#3A4416', '#232B1C', '#33221C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.fallback]}>
          <View style={styles.watermark}>
            <Icon name={icons.trophy} size={height * 0.75} color="rgba(222, 255, 0, 0.10)" />
          </View>
        </LinearGradient>
      )}
      <LinearGradient
        colors={['rgba(22,25,32,0.15)', 'rgba(22,25,32,0.35)', 'rgba(22,25,32,0.92)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {children ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, justifyContent: 'flex-end' },
  fallback: { alignItems: 'flex-end', justifyContent: 'center' },
  watermark: { marginRight: -12, transform: [{ rotate: '-12deg' }] },
  content: { padding: 14, gap: 4 },
});
