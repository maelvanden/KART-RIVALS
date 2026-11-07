import * as Haptics from 'expo-haptics';
import { useRef, useState, type ComponentType } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { CarbonBackdrop } from '@/components/ui/carbon-backdrop';
import { Text } from '@/components/ui/text';
import {
  ChallengeIllustration,
  EloIllustration,
  FeaturesIllustration,
  LogoIllustration,
  ResultIllustration,
} from '@/features/welcome/illustrations';
import { colors, spacing } from '@/theme';

type Slide = { title: string; accent: string; text: string; Illustration: ComponentType<{ active: boolean }> };

const SLIDES: Slide[] = [
  {
    title: 'Bienvenue au',
    accent: 'Paddock',
    text: 'Ton karting du samedi devient une vraie compétition.',
    Illustration: LogoIllustration,
  },
  {
    title: 'Défie tes',
    accent: 'rivaux',
    text: 'Trouve des pilotes près de chez toi et lance un défi sur ton circuit.',
    Illustration: ChallengeIllustration,
  },
  {
    title: 'Valide',
    accent: 'à deux',
    text: 'Après la course, l’un saisit le résultat, l’autre confirme. Simple, et sans triche.',
    Illustration: ResultIllustration,
  },
  {
    title: 'Grimpe au',
    accent: 'classement',
    text: 'Chaque victoire fait monter ton ELO. De Novice… jusqu’à Légende.',
    Illustration: EloIllustration,
  },
  {
    title: 'Tout ton',
    accent: 'karting',
    text: 'Circuits, chronos vérifiés, écuries et Actu : à toi de jouer !',
    Illustration: FeaturesIllustration,
  },
];

/** Présentation de l'appli : 5 écrans à faire glisser, chacun avec son animation. */
export function WelcomeTour({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.set(e.contentOffset.x);
  });

  function goTo(next: number) {
    if (next === index) return;
    setIndex(next);
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  }

  function next() {
    if (last) return onDone();
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    goTo(index + 1);
  }

  return (
    <View style={styles.screen}>
      <CarbonBackdrop opacity={0.05} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}>
          {last ? null : (
            <Pressable accessibilityRole="button" hitSlop={12} onPress={onDone}>
              <Text style={styles.skip}>Passer</Text>
            </Pressable>
          )}
        </View>

        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) => goTo(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={styles.pager}>
          {SLIDES.map((slide, i) => (
            <SlideView key={slide.accent} slide={slide} index={i} width={width} scrollX={scrollX} active={i === index} />
          ))}
        </Animated.ScrollView>

        <View style={styles.bottom}>
          <View style={styles.dots}>
            {SLIDES.map((slide, i) => (
              <Dot key={slide.accent} index={i} width={width} scrollX={scrollX} />
            ))}
          </View>
          <Button title={last ? 'C’est parti !' : 'Suivant'} size="lg" onPress={next} />
        </View>
      </SafeAreaView>
    </View>
  );
}

function SlideView({
  slide,
  index,
  width,
  scrollX,
  active,
}: {
  slide: Slide;
  index: number;
  width: number;
  scrollX: SharedValue<number>;
  active: boolean;
}) {
  const range = [(index - 1) * width, index * width, (index + 1) * width];
  // Profondeur : l'illustration glisse plus vite que le texte.
  const art = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.get(), range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(scrollX.get(), range, [width * 0.45, 0, -width * 0.45], Extrapolation.CLAMP) }],
  }));
  const copy = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.get(), range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(scrollX.get(), range, [width * 0.15, 0, -width * 0.15], Extrapolation.CLAMP) }],
  }));
  const { Illustration } = slide;
  return (
    <View style={[styles.slide, { width }]}>
      <Animated.View style={[styles.art, art]}>
        <Illustration active={active} />
      </Animated.View>
      <Animated.View style={[styles.copy, copy]}>
        <Text style={styles.title}>
          {slide.title} <Text style={[styles.title, styles.accent]}>{slide.accent}</Text>
        </Text>
        <Text style={styles.text}>{slide.text}</Text>
      </Animated.View>
    </View>
  );
}

/** Point de pagination : s'allonge et s'allume sur l'écran affiché. */
function Dot({ index, width, scrollX }: { index: number; width: number; scrollX: SharedValue<number> }) {
  const range = [(index - 1) * width, index * width, (index + 1) * width];
  const style = useAnimatedStyle(() => {
    const p = interpolate(scrollX.get(), range, [0, 1, 0], Extrapolation.CLAMP);
    return { width: 8 + p * 22, opacity: 0.3 + p * 0.7 };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  top: { height: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: spacing.xl },
  skip: { fontWeight: '700', color: colors.textMuted },
  pager: { flex: 1 },
  slide: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.xxl },
  art: { minHeight: 320, alignItems: 'center', justifyContent: 'center' },
  copy: { gap: spacing.md },
  title: { fontSize: 38, lineHeight: 44, fontWeight: '800', textTransform: 'uppercase', textAlign: 'center' },
  accent: { color: colors.neon },
  text: { fontSize: 17, lineHeight: 24, textAlign: 'center', color: colors.textMuted },
  bottom: { gap: spacing.xl, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { height: 8, borderRadius: 4, backgroundColor: colors.neon },
});
