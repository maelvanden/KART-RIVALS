import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CarbonBackdrop } from '@/components/ui/carbon-backdrop';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TeamCrest } from '@/features/social/components/team-crest';
import { TEAM_MAX_MEMBERS } from '@/features/social/teams';
import { colors, fonts, gradients, radius, rankMeta, spacing } from '@/theme';
import type { Team } from '@/types/models';

type Props = {
  team: Team;
  /** Messages non lus sur le canal de l'écurie. */
  unread?: number;
  onChat: () => void;
  /** Absent si le pilote ne peut pas recruter (seul le Team Principal recrute). */
  onInvite?: () => void;
};

/**
 * Carte héros « Mon Écurie » : blason, nom et tag, ELO d'écurie, effectif, et les deux actions
 * Radio Paddock et Recruter. Même construction que la carte héros du Paddock (lueur Volt,
 * bandes de livrée obliques, fibre de carbone).
 */
export function TeamCard({ team, unread = 0, onChat, onInvite }: Props) {
  const lineup = team.members.slice(0, 5);
  return (
    <LinearGradient colors={gradients.voltGlow} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <CarbonBackdrop opacity={0.05} />
      <View style={styles.livery} pointerEvents="none">
        <View style={[styles.band, styles.bandWide]} />
        <View style={[styles.band, styles.bandThin]} />
        <View style={[styles.band, styles.bandThin]} />
      </View>

      <View style={styles.header}>
        <TeamCrest tag={team.tag} logoUrl={team.logo_url} size={78} />
        <View style={styles.identity}>
          <View style={styles.kicker}>
            <View style={styles.kickerBar} />
            <Text variant="label" style={styles.kickerText}>
              Mon écurie
            </Text>
          </View>
          <Text style={styles.name} numberOfLines={2}>
            {team.name}
          </Text>
          <View style={styles.tagChip}>
            <Text style={styles.tagText}>{team.tag}</Text>
          </View>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat label="ELO écurie" value={team.elo} accent />
        <View style={styles.divider} />
        <Stat label="Pilotes" value={`${team.members.length}/${TEAM_MAX_MEMBERS}`} />
        <View style={styles.divider} />
        <Stat label="Rang" value={`#${team.position}`} />
      </View>

      <View style={styles.lineup}>
        {lineup.map((m, i) => (
          <View key={m.pilot.id} style={[styles.lineupAvatar, { marginLeft: i === 0 ? 0 : -12, zIndex: lineup.length - i }]}>
            <Avatar username={m.pilot.username} url={m.pilot.avatar_url} size={36} borderColor={rankMeta[m.pilot.rank].color} />
          </View>
        ))}
        {team.members.length > lineup.length ? (
          <Text variant="caption" style={styles.more}>
            +{team.members.length - lineup.length}
          </Text>
        ) : null}
        <Text variant="caption" style={styles.lineupText} numberOfLines={1}>
          {team.members.length > 1 ? `${team.members.length} pilotes sous les couleurs` : 'Recrute tes premiers pilotes'}
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          title={unread > 0 ? `Radio Paddock · ${unread}` : 'Radio Paddock'}
          size="lg"
          icon={<Icon name={icons.radio} size={20} color={colors.onNeon} />}
          onPress={onChat}
          style={styles.action}
        />
        {onInvite ? (
          <Button
            title="Recruter"
            variant="secondary"
            icon={<Icon name={icons.recruit} size={18} color={colors.text} />}
            onPress={onInvite}
            style={styles.action}
          />
        ) : null}
      </View>
    </LinearGradient>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: colors.neon }]}>{value}</Text>
      <Text variant="label" numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 3,
    borderTopColor: colors.neon,
    padding: spacing.xl,
    gap: spacing.xl,
    overflow: 'hidden',
  },
  livery: { position: 'absolute', top: -60, right: 6, bottom: -60, flexDirection: 'row', gap: 8 },
  band: { transform: [{ skewX: '-22deg' }] },
  bandWide: { width: 46, backgroundColor: 'rgba(222, 255, 0, 0.08)' },
  bandThin: { width: 7, backgroundColor: 'rgba(222, 255, 0, 0.05)' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  identity: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kickerBar: { width: 14, height: 3, backgroundColor: colors.neon },
  kickerText: { color: colors.neon },
  name: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: colors.text, textTransform: 'uppercase' },
  tagChip: {
    backgroundColor: colors.neon,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    transform: [{ skewX: '-12deg' }],
  },
  tagText: { fontFamily: fonts.display, fontSize: 15, letterSpacing: 1.5, color: colors.onNeon },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(22, 25, 32, 0.55)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: spacing.xs },
  statValue: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: colors.text, fontVariant: ['tabular-nums'] },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  lineup: { flexDirection: 'row', alignItems: 'center' },
  lineupAvatar: { borderRadius: 20, borderWidth: 2, borderColor: colors.surface },
  more: { marginLeft: spacing.sm, color: colors.text, fontWeight: '700' },
  lineupText: { flex: 1, marginLeft: spacing.md },
  actions: { gap: spacing.sm },
  action: { alignSelf: 'stretch' },
});
