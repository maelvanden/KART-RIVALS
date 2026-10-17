import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors, fonts, radius, spacing } from '@/theme';
import type { SharePayload, ShareType } from '@/types/models';

const meta: Record<ShareType, { label: string; icon: IconName; color: string }> = {
  challenge: { label: 'Défi', icon: icons.challenge, color: colors.orange },
  race: { label: 'Course', icon: icons.group, color: colors.neon },
  lap_record: { label: 'Record du tour', icon: icons.timer, color: '#FFC83D' },
  time_attack: { label: 'Time Attack', icon: icons.bolt, color: '#22D3EE' },
};

type Props = { share: SharePayload; senderId: string; myId: string | null; mine: boolean };

/** Carte partagée dans la Radio : ouvre le défi, la course, le circuit du record ou la fiche du pilote. */
export function ShareCard({ share, senderId, myId, mine }: Props) {
  const m = meta[share.type];

  function open() {
    switch (share.type) {
      case 'challenge':
        return router.push({ pathname: '/challenge/[id]', params: { id: share.id } });
      case 'race':
        return router.push({ pathname: '/race/[id]', params: { id: share.id } });
      case 'lap_record':
        return router.push({ pathname: '/track/[id]', params: { id: share.id } });
      case 'time_attack':
        // Les sessions Time Attack sont privées : on ouvre les siennes, ou la fiche du pilote qui partage.
        return senderId === myId ? router.push('/time-attack') : router.push({ pathname: '/pilot/[id]', params: { id: senderId } });
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${m.label} : ${share.title}`}
      onPress={open}
      style={({ pressed }) => [styles.card, { borderLeftColor: m.color }, mine && styles.mine, pressed && styles.pressed]}>
      <View style={styles.header}>
        <Icon name={m.icon} size={14} color={m.color} />
        <Text style={[styles.kicker, { color: m.color }]}>{m.label}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={2}>
            {share.title}
          </Text>
          {share.subtitle ? (
            <Text variant="caption" numberOfLines={1}>
              {share.subtitle}
            </Text>
          ) : null}
        </View>
        {share.highlight ? <Text style={[styles.highlight, { color: m.color }]}>{share.highlight}</Text> : null}
      </View>
      <View style={styles.footer}>
        <Text variant="caption" style={styles.open}>
          Ouvrir
        </Text>
        <Icon name={icons.chevron} size={12} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 250,
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
  },
  mine: { borderColor: colors.neon, borderLeftColor: colors.neon },
  pressed: { opacity: 0.85 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  kicker: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  body: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.text, textTransform: 'uppercase' },
  highlight: { fontFamily: fonts.display, fontSize: 24, lineHeight: 32, fontVariant: ['tabular-nums'] },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  open: { fontSize: 12 },
});
