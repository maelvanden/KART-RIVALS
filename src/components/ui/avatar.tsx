import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { colors } from '@/theme';

type Props = { username: string; url: string | null; size: number; borderColor: string };

/** Photo du pilote, ou ses initiales s'il n'en a pas. */
export function Avatar({ username, url, size, borderColor }: Props) {
  return (
    <View
      style={[
        styles.frame,
        { width: size, height: size, borderRadius: size / 2, borderColor, borderWidth: 2 },
      ]}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          accessibilityLabel={`Photo de ${username}`}
        />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.34 }]}>{username.slice(0, 2).toUpperCase()}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  initials: { fontWeight: '900', fontStyle: 'italic' },
});
