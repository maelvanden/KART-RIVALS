import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { TeamCrest } from '@/features/social/components/team-crest';
import { useFriendships } from '@/features/social/friends';
import { useConversations } from '@/features/social/radio';
import { useTeamApplications, useTeamsDirectory } from '@/features/social/recruitment';
import { isStaff } from '@/features/social/roles';
import { useMyTeam, useMyTeamInvites } from '@/features/social/teams';
import { colors, fonts, radius, spacing } from '@/theme';

/** Bloc « Communauté » du Paddock : accès à l'écurie, aux coéquipiers et à la Radio Paddock. */
export function CommunityCard() {
  const team = useMyTeam();
  const invites = useMyTeamInvites();
  const friendships = useFriendships();
  const conversations = useConversations();

  const t = team.data;
  const teammates = friendships.data?.filter((f) => f.status === 'accepted').length ?? 0;
  const requests = friendships.data?.filter((f) => f.status === 'pending' && !f.outgoing).length ?? 0;
  const unread = conversations.data?.reduce((n, c) => n + c.unread, 0) ?? 0;
  const pendingInvites = invites.data?.length ?? 0;
  const { userId } = useAuth();
  const directory = useTeamsDirectory();
  const applications = useTeamApplications(t?.id);
  const staff = isStaff(t?.members.find((m) => m.pilot.id === userId)?.role);
  const pendingApplications = staff ? (applications.data?.length ?? 0) : 0;
  const recruitingTeams = directory.data?.filter((x) => x.recruiting).length ?? 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.kicker}>
        <View style={styles.kickerBar} />
        <Text variant="label" style={styles.kickerText}>
          Communauté
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/team')}
        style={({ pressed }) => [styles.team, t ? { borderLeftColor: t.color } : null, pressed && styles.pressed]}>
        <View style={styles.teamBand} pointerEvents="none" />
        <TeamCrest tag={t?.tag ?? '?'} logoUrl={t?.logo_url ?? null} color={t?.color} size={52} />
        <View style={styles.teamText}>
          <Text variant="label">{t ? 'Mon écurie' : 'Écurie'}</Text>
          <Text style={styles.teamName} numberOfLines={1}>
            {t ? t.name : 'Fonder ou rejoindre'}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {t
              ? `${t.tag} · ${t.members.length} pilote${t.members.length > 1 ? 's' : ''} · ${t.elo} ELO`
              : pendingInvites > 0
                ? `${pendingInvites} invitation${pendingInvites > 1 ? 's' : ''} en attente`
                : recruitingTeams > 0
                  ? `${recruitingTeams} écurie${recruitingTeams > 1 ? 's' : ''} recrute${recruitingTeams > 1 ? 'nt' : ''}`
                  : 'Crée ton équipe et recrute'}
          </Text>
        </View>
        {pendingInvites > 0 && !t ? <Badge value={pendingInvites} /> : null}
        {pendingApplications > 0 ? <Badge value={pendingApplications} orange /> : null}
        <Icon name={icons.chevron} color={colors.textMuted} size={16} />
      </Pressable>

      <View style={styles.tiles}>
        <Tile
          icon={icons.teammates}
          label="Coéquipiers"
          value={`${teammates}`}
          badge={requests}
          onPress={() => router.push('/friends')}
        />
        <Tile
          icon={icons.radio}
          label={unread > 0 ? 'Radio · non lus' : 'Radio Paddock'}
          value={unread > 0 ? `${unread}` : 'Radio'}
          badge={0}
          onPress={() => router.push('/radio')}
          live={unread > 0}
        />
      </View>
    </View>
  );
}

function Tile({
  icon,
  label,
  value,
  badge,
  onPress,
  live,
}: {
  icon: IconName;
  label: string;
  value: string;
  badge: number;
  onPress: () => void;
  live?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.tileTop}>
        <Icon name={icon} size={18} color={live ? colors.neon : colors.text} />
        {badge > 0 ? <Badge value={badge} orange /> : null}
      </View>
      <Text style={[styles.tileValue, live && { color: colors.neon }]}>{value}</Text>
      <Text variant="label">{label}</Text>
    </Pressable>
  );
}

function Badge({ value, orange }: { value: number; orange?: boolean }) {
  return (
    <View style={[styles.badge, orange && { backgroundColor: colors.orange }]}>
      <Text style={styles.badgeText}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kickerBar: { width: 14, height: 3, backgroundColor: colors.neon },
  kickerText: { color: colors.neon },
  team: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.neon,
    overflow: 'hidden',
  },
  teamBand: {
    position: 'absolute',
    right: 40,
    top: -20,
    bottom: -20,
    width: 30,
    backgroundColor: 'rgba(222, 255, 0, 0.05)',
    transform: [{ skewX: '-22deg' }],
  },
  teamText: { flex: 1, gap: 1 },
  teamName: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: colors.text, textTransform: 'uppercase' },
  tiles: { flexDirection: 'row', gap: spacing.md },
  tile: {
    flex: 1,
    padding: spacing.lg,
    gap: 2,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  tileValue: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, color: colors.text, textTransform: 'uppercase' },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.neon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.display, fontSize: 13, color: colors.onNeon },
  pressed: { opacity: 0.85 },
});
