import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { useCreatePost, useShareableSessions, type NewPost } from '@/features/feed/api';
import { parseLap, splitLap } from '@/features/feed/format';
import { useApproxLocation } from '@/features/nearby/api';
import { useTracksMap } from '@/features/tracks/api';
import { distanceKm } from '@/lib/geo';
import { colors, radius, spacing } from '@/theme';

const CATEGORIES = ['270cc', '390cc', '2T', 'Rotax', 'Électrique', 'Enfant'];
type Conditions = 'none' | 'dry' | 'wet';

/** Publier : chrono (certifié par un Time Attack ou déclaré), photo ou vidéo, circuit et texte. */
export default function NewPostScreen() {
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const create = useCreatePost();
  const sessions = useShareableSessions();
  const tracks = useTracksMap();
  const location = useApproxLocation();
  const [sessionId, setSessionId] = useState<string | null>(params.sessionId ?? null);
  const [caption, setCaption] = useState('');
  const [lap, setLap] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [conditions, setConditions] = useState<Conditions>('none');
  const [weight, setWeight] = useState('');
  const [trackId, setTrackId] = useState<string | null>(null);
  const [media, setMedia] = useState<NewPost['media']>(null);
  const [error, setError] = useState<string | null>(null);

  const session = sessions.data?.find((s) => s.id === sessionId) ?? null;
  const nearTracks = useMemo(() => {
    const here = location.data;
    return [...(tracks.data ?? [])].sort((a, b) => (here ? distanceKm(here, a) - distanceKm(here, b) : a.name.localeCompare(b.name)));
  }, [tracks.data, location.data]);

  async function pick(source: 'camera' | 'library') {
    setError(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Autorise l’accès à l’appareil photo dans les réglages.');
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images', 'videos'],
        quality: 1,
        videoMaxDuration: 60,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const a = result.assets[0];
      if (a.type === 'video' && (a.duration ?? 0) > 61_000) throw new Error('Vidéo trop longue : 60 secondes maximum.');
      setMedia({ uri: a.uri, type: a.type === 'video' ? 'video' : 'image', width: a.width, height: a.height });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible d’ajouter le média.');
    }
  }

  function submit() {
    setError(null);
    const lapMs = session ? null : lap.trim() ? parseLap(lap) : null;
    if (!session && lap.trim() && !lapMs) return setError('Temps invalide : écris par exemple 58.972 ou 1:02.345.');
    if (!caption.trim() && !lapMs && !session && !media) return setError('Ajoute un texte, un chrono, une photo ou une vidéo.');
    create.mutate(
      {
        caption,
        trackId: session ? session.track_id : trackId,
        lapMs,
        kartCategory: category ?? '',
        conditions: conditions === 'none' ? null : conditions,
        weightClass: weight,
        sessionId: session?.id ?? null,
        media,
      },
      { onSuccess: () => router.back() },
    );
  }

  return (
    <Screen safeTop={false}>
      <Input
        label="Ton message"
        value={caption}
        onChangeText={setCaption}
        multiline
        maxLength={500}
        placeholder="Qualif, record perso, sortie de piste mémorable…"
        style={styles.multiline}
      />

      <Text variant="label">Photo ou vidéo (60 s max)</Text>
      {media ? (
        <View style={styles.preview}>
          {media.type === 'image' ? (
            <Image source={{ uri: media.uri }} style={styles.previewImage} contentFit="cover" />
          ) : (
            <View style={[styles.previewImage, styles.videoPreview]}>
              <Icon name={icons.video} size={32} color={colors.text} />
              <Text variant="caption">Vidéo prête à publier</Text>
            </View>
          )}
          <Pressable accessibilityLabel="Retirer le média" onPress={() => setMedia(null)} style={styles.remove} hitSlop={8}>
            <Icon name={icons.close} size={18} color={colors.text} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.row}>
          <Button title="Caméra" variant="secondary" style={styles.flex} icon={<Icon name={icons.camera} size={18} color={colors.text} />} onPress={() => pick('camera')} />
          <Button title="Galerie" variant="secondary" style={styles.flex} icon={<Icon name={icons.gallery} size={18} color={colors.text} />} onPress={() => pick('library')} />
        </View>
      )}

      <Text variant="label">Chrono</Text>
      {sessions.data && sessions.data.length > 0 ? (
        <>
          <Text variant="caption">Un Time Attack validé par ticket donne un chrono certifié (et peut-être un record).</Text>
          <Chips
            options={[
              { value: null as string | null, label: 'Temps déclaré' },
              ...sessions.data.map((s) => ({
                value: s.id as string | null,
                label: `✓ ${splitLap(s.best_lap_ms).main}${splitLap(s.best_lap_ms).ms} · ${s.track_name ?? 'Circuit'}`,
              })),
            ]}
            value={sessionId}
            onChange={setSessionId}
          />
        </>
      ) : null}
      {!session ? (
        <Input label="Meilleur tour (facultatif)" value={lap} onChangeText={setLap} placeholder="58.972" keyboardType="numbers-and-punctuation" maxLength={9} />
      ) : null}
      <Chips
        options={[{ value: null as string | null, label: 'Catégorie' }, ...CATEGORIES.map((c) => ({ value: c as string | null, label: c }))]}
        value={category}
        onChange={setCategory}
      />
      <Segmented
        options={[
          { value: 'none', label: 'Piste ?' },
          { value: 'dry', label: '☀ Sèche' },
          { value: 'wet', label: '💧 Mouillée' },
        ]}
        value={conditions}
        onChange={setConditions}
      />
      <Input label="Catégorie de poids (facultatif)" value={weight} onChangeText={setWeight} placeholder="80-85 kg" maxLength={20} />

      {!session ? (
        <>
          <Text variant="label">Circuit (facultatif)</Text>
          <Chips
            options={[{ value: null as string | null, label: 'Aucun' }, ...nearTracks.map((t) => ({ value: t.id as string | null, label: t.name }))]}
            value={trackId}
            onChange={setTrackId}
          />
        </>
      ) : (
        <Text variant="caption">Circuit : {session.track_name}</Text>
      )}

      {error || create.error ? <Text style={styles.error}>{error ?? create.error?.message}</Text> : null}
      <Button title={create.isPending && media?.type === 'video' ? 'Envoi de la vidéo…' : 'Publier'} size="lg" loading={create.isPending} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 100, paddingTop: 14, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  preview: { position: 'relative' },
  previewImage: { width: '100%', height: 200, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  videoPreview: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  remove: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.danger },
});
