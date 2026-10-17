import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, icons, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { callPhone, openLink } from '@/features/tracks/links';
import { colors, fonts, radius, spacing } from '@/theme';
import type { TrackDetails } from '@/types/models';

const SOCIALS = [
  { key: 'instagram_url', label: 'Instagram' },
  { key: 'facebook_url', label: 'Facebook' },
  { key: 'tiktok_url', label: 'TikTok' },
  { key: 'youtube_url', label: 'YouTube' },
] as const;

/**
 * Réservation / billetterie en un geste (en ligne, sinon par téléphone), puis site, téléphone et réseaux sociaux.
 */
export function TrackLinks({ track }: { track: TrackDetails }) {
  const socials = SOCIALS.flatMap((s) => (track[s.key] ? [{ label: s.label, url: track[s.key]! }] : []));
  // Sans réservation en ligne, le téléphone devient l'action principale.
  const bookByPhone = !track.booking_url && !!track.phone;
  const contact = track.website || (track.phone && !bookByPhone);
  if (!track.booking_url && !contact && socials.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {track.booking_url ? (
        <Button
          title="Réserver une session"
          size="lg"
          icon={<Icon name={icons.ticket} size={20} color={colors.onNeon} />}
          onPress={() => openLink(track.booking_url!)}
        />
      ) : bookByPhone ? (
        <Button
          title="Réserver par téléphone"
          size="lg"
          icon={<Icon name={icons.phone} size={20} color={colors.onNeon} />}
          onPress={() => callPhone(track.phone!)}
        />
      ) : null}
      {contact ? (
        <View style={styles.row}>
          {track.website ? (
            <LinkTile icon={icons.globe} label="Site officiel" onPress={() => openLink(track.website!)} />
          ) : null}
          {track.phone && !bookByPhone ? <LinkTile icon={icons.phone} label={track.phone} onPress={() => callPhone(track.phone!)} /> : null}
        </View>
      ) : null}
      {socials.length > 0 ? (
        <View style={styles.socials}>
          {socials.map((s) => (
            <Pressable
              key={s.label}
              accessibilityRole="link"
              accessibilityLabel={`${track.name} sur ${s.label}`}
              onPress={() => openLink(s.url)}
              style={({ pressed }) => [styles.social, pressed && styles.pressed]}>
              <Icon name={icons.link} size={14} color={colors.neon} />
              <Text style={styles.socialText}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function LinkTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <Icon name={icon} size={18} color={colors.neon} />
      <Text style={styles.tileText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileText: { flex: 1, fontWeight: '700' },
  socials: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  social: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  socialText: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  pressed: { opacity: 0.75 },
});
