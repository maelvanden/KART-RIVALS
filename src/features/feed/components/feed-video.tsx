import { requireOptionalNativeModule } from 'expo';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { openLink } from '@/features/tracks/links';
import { colors, radius, spacing } from '@/theme';

// expo-video n'est chargé que si son module natif est présent (Expo Go l'inclut ; un ancien build peut ne pas l'avoir) :
// sinon la vidéo s'ouvre dans le navigateur intégré.
const hasNativeVideo = !!requireOptionalNativeModule('ExpoVideo');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExpoVideo: typeof import('expo-video') | null = hasNativeVideo ? require('expo-video') : null;

type Props = { url: string; ratio: number };

export function FeedVideo({ url, ratio }: Props) {
  if (ExpoVideo) return <InlineVideo url={url} ratio={ratio} video={ExpoVideo} />;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Lire la vidéo" onPress={() => openLink(url)} style={[styles.frame, styles.fallback, { aspectRatio: ratio }]}>
      <View style={styles.play}>
        <Icon name={icons.play} size={30} color={colors.text} />
      </View>
      <VideoTag />
    </Pressable>
  );
}

function InlineVideo({ url, ratio, video }: Props & { video: typeof import('expo-video') }) {
  const player = video.useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <View style={[styles.frame, { aspectRatio: ratio }]}>
      <video.VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls />
    </View>
  );
}

function VideoTag() {
  return (
    <View style={styles.tag}>
      <Icon name={icons.video} size={14} color={colors.text} />
      <Text style={styles.tagText}>Vidéo</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  play: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  tag: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  tagText: { fontWeight: '700', fontSize: 13 },
});
