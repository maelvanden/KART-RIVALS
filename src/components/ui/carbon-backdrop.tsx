import { Image, StyleSheet, View } from 'react-native';

/** Texture fibre de carbone très discrète (3 %) posée sur le fond, pour casser l'aplat. */
export function CarbonBackdrop({ opacity = 0.03 }: { opacity?: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={require('../../../assets/images/carbon.png')}
        resizeMode="repeat"
        style={[styles.image, { opacity }]}
        accessible={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
});
