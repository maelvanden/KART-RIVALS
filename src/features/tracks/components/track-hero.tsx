import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { trackLayout } from '@/features/tracks/layouts';
import { OfficialBadge } from '@/features/tracks/components/official-badge';
import { TrackTypeBadge } from '@/features/tracks/components/track-row';
import { useTrackPhotos } from '@/features/tracks/photos';
import { useTrackRatings } from '@/features/tracks/reviews';
import { colors, spacing } from '@/theme';
import type { TrackDetails } from '@/types/models';

const HEIGHT = 300;

/**
 * En-tête de la fiche circuit : photo principale plein cadre (sinon la plus récente des photos des pilotes, sinon le
 * tracé), fondu vers le fond, type de piste, badges, nom et ville, bouton retour par-dessus.
 */
export function TrackHero({ track }: { track: TrackDetails }) {
  const insets = useSafeAreaInsets();
  const photos = useTrackPhotos(track.id);
  const rating = useTrackRatings().data?.[track.id];
  const cover = track.cover_url ?? photos.data?.[0]?.url ?? null;
  const layout = cover ? null : trackLayout(track);

  return (
    <View style={[styles.hero, { height: HEIGHT + insets.top }]}>
      {cover ? (
        <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <LinearGradient colors={['#2A3524', '#1C2119', colors.background]} style={StyleSheet.absoluteFill}>
          {layout ? (
            <Image source={layout.source} style={[StyleSheet.absoluteFill, styles.layout]} contentFit="contain" />
          ) : null}
        </LinearGradient>
      )}
      <LinearGradient
        colors={['rgba(22,25,32,0.55)', 'rgba(22,25,32,0)', 'rgba(22,25,32,0.35)', colors.background]}
        locations={[0, 0.3, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retour"
        hitSlop={8}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/tracks'))}
        style={({ pressed }) => [styles.back, { top: insets.top + spacing.sm }, pressed && styles.pressed]}>
        <Icon name={icons.chevron} size={20} color={colors.text} />
      </Pressable>

      <View style={styles.bottom}>
        <View style={styles.badges}>
          <TrackTypeBadge indoor={track.is_indoor} />
          {track.is_official ? <OfficialBadge /> : null}
          {rating ? (
            <View style={styles.rating}>
              <Icon name={icons.star} size={13} color="#FFC83D" />
              <Text style={styles.ratingText}>{rating.overall.toLocaleString('fr-FR')}</Text>
            </View>
          ) : null}
        </View>
        <Text variant="display" style={styles.name} numberOfLines={2}>
          {track.name}
        </Text>
        <Text style={styles.city}>
          {track.city}
          {track.length_m ? ` · ${track.length_m.toLocaleString('fr-FR')} m` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Plein cadre : annule les marges du Screen.
  hero: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg, justifyContent: 'flex-end', overflow: 'hidden', backgroundColor: colors.surface },
  layout: { opacity: 0.35, margin: spacing.xl },
  back: {
    position: 'absolute',
    left: spacing.lg,
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(14,16,20,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scaleX: -1 }],
  },
  pressed: { opacity: 0.8 },
  bottom: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(14,16,20,0.6)' },
  ratingText: { fontSize: 12, fontWeight: '800', color: '#FFC83D' },
  name: { fontSize: 38, lineHeight: 46 },
  city: { fontWeight: '700', color: colors.textMuted },
});
