import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CarbonBackdrop } from '@/components/ui/carbon-backdrop';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { nextRankProgress } from '@/features/profile/components/license-card';
import { RankBadge } from '@/features/profile/components/rank-badge';
import { TeamTag } from '@/features/social/components/team-tag';
import { TIME_ATTACK_ENABLED } from '@/features/time-attack/config';
import { colors, fonts, gradients, radius, rankMeta, spacing } from '@/theme';
import type { Profile } from '@/types/models';

/** Carte héros du Paddock : identité, ELO géant et l'action principale « Entrer en piste ». */
export function PaddockHero({ profile }: { profile: Profile }) {
  const { next, progress, remaining } = nextRankProgress(profile.elo);
  const accent = rankMeta[profile.rank].color;

  return (
    <LinearGradient colors={gradients.voltGlow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <CarbonBackdrop opacity={0.04} />
      {/* Bandes obliques façon livrée : purement décoratives. */}
      <View style={styles.livery} pointerEvents="none">
        <View style={[styles.band, styles.bandVolt]} />
        <View style={[styles.band, styles.bandThin]} />
      </View>

      <View style={styles.identity}>
        <Avatar username={profile.username} url={profile.avatar_url} size={56} borderColor={accent} />
        <View style={styles.identityText}>
          <Text variant="heading" numberOfLines={1} style={styles.username}>
            {profile.username}
          </Text>
          <View style={styles.badges}>
            <TeamTag pilotId={profile.id} />
            <RankBadge rank={profile.rank} size="sm" />
          </View>
        </View>
        {profile.kart_number ? (
          <View style={styles.plate}>
            <Text style={styles.plateNumber}>{profile.kart_number}</Text>
          </View>
        ) : null}
      </View>

      <View>
        <Text variant="label" style={styles.eloLabel}>
          Cote ELO
        </Text>
        <Text style={styles.elo}>{profile.elo}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(4, progress * 100)}%` }]} />
        </View>
        <Text variant="caption" style={styles.progressText}>
          {next ? `${remaining} pts avant ${rankMeta[next].label}` : 'Rang maximum atteint'}
          {profile.home_track ? ` · Circuit : ${profile.home_track.name}` : ''}
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          title="Entrer en piste"
          size="lg"
          icon={<Icon name={icons.challenge} size={20} color={colors.onNeon} />}
          onPress={() => router.push(TIME_ATTACK_ENABLED ? '/time-attack' : '/nearby')}
        />
        <Button title="Trouver un rival" variant="secondary" onPress={() => router.push('/nearby')} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.xl,
    overflow: 'hidden',
  },
  livery: { position: 'absolute', top: -40, right: 24, bottom: -40, flexDirection: 'row', gap: 10 },
  band: { transform: [{ skewX: '-22deg' }] },
  bandVolt: { width: 34, backgroundColor: 'rgba(222, 255, 0, 0.07)' },
  bandThin: { width: 8, backgroundColor: 'rgba(222, 255, 0, 0.05)' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityText: { flex: 1, gap: spacing.xs },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start' },
  username: { fontSize: 24, lineHeight: 28 },
  plate: {
    backgroundColor: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
  },
  plateNumber: { fontFamily: fonts.display, color: colors.background, fontSize: 24, lineHeight: 30 },
  eloLabel: { color: colors.neon },
  elo: {
    fontFamily: fonts.display,
    fontSize: 88,
    lineHeight: 96,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  track: { height: 6, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.neon },
  progressText: { marginTop: spacing.sm },
  actions: { gap: spacing.sm },
});
