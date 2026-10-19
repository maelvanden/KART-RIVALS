import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useOpenSessions } from '@/features/sessions/api';
import { SessionCard } from '@/features/sessions/components/session-card';
import { colors, spacing } from '@/theme';

/** Fiche circuit : sessions ouvertes sur ce circuit, et « Je roule ici ». */
export function TrackSessions({ trackId }: { trackId: string }) {
  const sessions = useOpenSessions(trackId);
  const list = sessions.data ?? [];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text variant="label" style={styles.title}>
          Qui roule ici ?
        </Text>
        {list.length > 0 ? <Text variant="label">{list.length}</Text> : null}
      </View>
      {list.map((s) => (
        <SessionCard key={s.id} session={s} hideTrack />
      ))}
      <Button
        title="Je roule ici"
        variant="secondary"
        icon={<Icon name={icons.challenge} size={18} color={colors.text} />}
        onPress={() => router.push({ pathname: '/sessions/new', params: { trackId } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
});
