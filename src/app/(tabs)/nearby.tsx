import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { PilotRow } from '@/components/pilot-row';
import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useApproxLocation, useNearbyPilots, useSearchPilots } from '@/features/nearby/api';
import { formatKm } from '@/lib/format';
import { colors, radius as radii, spacing } from '@/theme';

type Radius = '10' | '30' | '100';

const challenge = (id: string, username: string) =>
  router.push({ pathname: '/challenge/new', params: { opponentId: id, username } });

export default function NearbyScreen() {
  const [radius, setRadius] = useState<Radius>('30');
  const [query, setQuery] = useState('');
  const searching = query.trim().length >= 2;
  const location = useApproxLocation();
  const pilots = useNearbyPilots(searching ? undefined : location.data, Number(radius));
  const search = useSearchPilots(query);

  return (
    <Screen
      subtitle={searching ? 'Recherche' : 'Autour de toi'}
      title="Pilotes"
      refreshing={searching ? search.isRefetching : pilots.isRefetching}
      onRefresh={searching ? search.refetch : pilots.refetch}>
      <View style={styles.searchBox}>
        <Icon name={icons.search} size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Chercher un pseudo"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.searchInput}
          accessibilityLabel="Chercher un pilote par pseudo"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Effacer la recherche">
            <Icon name={icons.close} size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {searching ? (
        <>
          {search.isLoading ? <Loading /> : null}
          {search.error ? <ErrorState error={search.error} /> : null}
          {search.data?.length === 0 ? (
            <EmptyState title="Aucun pilote trouvé" message={`Personne ne s’appelle « ${query.trim()} ».`} />
          ) : null}
          {search.data?.map((p) => (
            <PilotRow
              key={p.id}
              pilotId={p.id}
              username={p.username}
              avatarUrl={p.avatar_url}
              rank={p.rank}
              elo={p.elo}
              subtitle={`${p.elo} ELO · ${p.wins}V ${p.losses}D`}
              trailing={<Button title="Défier" style={styles.challenge} onPress={() => challenge(p.id, p.username)} />}
            />
          ))}
        </>
      ) : (
        <>
          <Segmented
            options={[
              { value: '10', label: '10 km' },
              { value: '30', label: '30 km' },
              { value: '100', label: '100 km' },
            ]}
            value={radius}
            onChange={setRadius}
          />
          {location.isPending || pilots.isLoading ? <Loading /> : null}
          {location.data === null ? (
            <EmptyState
              title="Localisation désactivée"
              message="Autorise la localisation pour trouver des pilotes près de toi, ou cherche un pilote par son pseudo."
            />
          ) : null}
          {location.error ? <ErrorState error={location.error} /> : null}
          {pilots.error ? <ErrorState error={pilots.error} /> : null}
          {pilots.data?.length === 0 ? (
            <EmptyState title="Personne en piste ici" message="Élargis le rayon ou cherche un ami par son pseudo." />
          ) : null}
          {pilots.data?.map((p) => (
            <PilotRow
              key={p.id}
              pilotId={p.id}
              username={p.username}
              avatarUrl={p.avatar_url}
              rank={p.rank}
              elo={p.elo}
              subtitle={`${formatKm(Number(p.distance_km))} · ${p.elo} ELO · ${p.wins}V ${p.losses}D`}
              trailing={<Button title="Défier" style={styles.challenge} onPress={() => challenge(p.id, p.username)} />}
            />
          ))}
          {pilots.data && pilots.data.length > 0 ? (
            <Text variant="caption" style={styles.footnote}>
              Seuls les pilotes visibles apparaissent ici. Les autres se trouvent par leur pseudo.
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: spacing.sm,
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : {}),
  },
  challenge: { minHeight: 38, paddingHorizontal: spacing.lg },
  footnote: { textAlign: 'center' },
});
