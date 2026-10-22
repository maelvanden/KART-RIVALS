import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useLiveAnnouncement, type Announcement } from '@/features/admin/panel';
import { colors, radius, spacing } from '@/theme';

const DISMISSED_KEY = 'kr.announcements.dismissed';

/** Carte d'une annonce officielle Kart Rivals (aussi utilisée pour l'aperçu côté admin). */
export function AnnouncementCard({ announcement: a, onClose }: { announcement: Announcement; onClose?: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Icon name={icons.megaphone} size={18} color={colors.onNeon} />
        <Text style={styles.kicker} numberOfLines={1}>
          Kart Rivals{a.track_name ? ` · ${a.track_name}` : a.region ? ` · ${a.region}` : ''}
        </Text>
        <View style={styles.flex} />
        {onClose ? (
          <Pressable accessibilityLabel="Masquer l’annonce" hitSlop={12} onPress={onClose}>
            <Icon name={icons.close} size={16} color={colors.onNeon} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.title}>{a.title}</Text>
      <Text style={styles.body}>{a.body}</Text>
      {a.link_url ? (
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(a.link_url!)} style={styles.link}>
          <Text style={styles.linkText}>En savoir plus</Text>
          <Icon name={icons.chevron} size={14} color={colors.onNeon} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Annonce en cours, masquable : une fois fermée, elle ne revient pas sur cet appareil. */
export function AnnouncementBanner() {
  const live = useLiveAnnouncement();
  const [dismissed, setDismissed] = useState<string[] | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => setDismissed(v ? (JSON.parse(v) as string[]) : []))
      .catch(() => setDismissed([]));
  }, []);

  const a = live.data;
  if (!a || !dismissed || dismissed.includes(a.id)) return null;

  const close = () => {
    const next = [...dismissed, a.id].slice(-20);
    setDismissed(next);
    AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(next)).catch(() => {});
  };
  return <AnnouncementCard announcement={a} onClose={close} />;
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.neon },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', color: colors.onNeon },
  title: { fontSize: 17, fontWeight: '900', color: colors.onNeon },
  body: { fontSize: 14, lineHeight: 20, color: colors.onNeon },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  linkText: { fontWeight: '800', color: colors.onNeon, textDecorationLine: 'underline' },
});
