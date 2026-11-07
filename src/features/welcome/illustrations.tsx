import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon, icons, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors, radius, rankMeta, spacing } from '@/theme';

/** Ressort commun : vif, avec un léger rebond. */
const SPRING = { damping: 14, stiffness: 150 };

type Entrance = { x?: number; y?: number; scale?: number; rotate?: number };

/** Apparition rejouée à chaque fois que l'écran devient actif (glissé, fondu, zoom). */
function useEntrance(active: boolean, delay = 0, from: Entrance = { y: 18 }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(0);
    if (active) progress.set(withDelay(delay, withSpring(1, SPRING)));
  }, [active, delay, progress]);
  const { x = 0, y = 0, scale = 1, rotate = 0 } = from;
  return useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: Math.min(1, p * 1.5),
      transform: [
        { translateX: (1 - p) * x },
        { translateY: (1 - p) * y },
        { scale: 1 - (1 - p) * (1 - scale) },
        { rotate: `${(1 - p) * rotate}deg` },
      ],
    };
  });
}

/** Écran 1 : le logo arrive en tournant, puis pulse doucement. */
export function LogoIllustration({ active }: { active: boolean }) {
  const logo = useEntrance(active, 100, { scale: 0.3, rotate: -120 });
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.set(0);
    if (active) {
      glow.set(withDelay(700, withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0.35, { duration: 1100 })), -1)));
    }
  }, [active, glow]);
  const halo = useAnimatedStyle(() => ({ opacity: glow.get() * 0.22, transform: [{ scale: 0.8 + glow.get() * 0.3 }] }));
  const word = useEntrance(active, 650, { y: 14 });
  return (
    <View style={styles.center}>
      <View style={styles.logoSpot}>
        <Animated.View style={[styles.halo, halo]} />
        <Animated.View style={logo}>
          <Image source={require('../../../assets/images/splash-icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
        </Animated.View>
      </View>
      <Animated.View style={word}>
        <Text style={styles.wordmark}>
          KART <Text style={[styles.wordmark, { color: colors.neon }]}>RIVALS</Text>
        </Text>
      </Animated.View>
    </View>
  );
}

function PilotCard({ name, elo, color }: { name: string; elo: number; color: string }) {
  return (
    <View style={[styles.pilot, { borderColor: color }]}>
      <View style={[styles.avatar, { borderColor: color }]}>
        <Icon name={icons.helmet} size={26} color={color} />
      </View>
      <Text style={styles.pilotName}>{name}</Text>
      <Text style={styles.pilotElo}>{elo} ELO</Text>
    </View>
  );
}

/** Écran 2 : les deux pilotes arrivent de chaque côté, « VS » éclate, le défi est accepté. */
export function ChallengeIllustration({ active }: { active: boolean }) {
  const left = useEntrance(active, 100, { x: -140 });
  const right = useEntrance(active, 250, { x: 140 });
  const versus = useEntrance(active, 550, { scale: 0, rotate: 90 });
  const accepted = useEntrance(active, 1050, { y: 20, scale: 0.8 });
  return (
    <View style={styles.center}>
      <View style={styles.duel}>
        <Animated.View style={left}>
          <PilotCard name="TOI" elo={1000} color={colors.neon} />
        </Animated.View>
        <Animated.View style={[styles.vs, versus]}>
          <Text style={styles.vsText}>VS</Text>
        </Animated.View>
        <Animated.View style={right}>
          <PilotCard name="RIVAL" elo={1020} color={colors.orange} />
        </Animated.View>
      </View>
      <Animated.View style={[styles.chip, accepted]}>
        <Icon name={icons.challenge} size={16} color={colors.onNeon} />
        <Text style={styles.chipText}>Défi accepté · Inwall Kart</Text>
      </Animated.View>
    </View>
  );
}

function Step({ label, active, delay }: { label: string; active: boolean; delay: number }) {
  const style = useEntrance(active, delay, { x: -30 });
  return (
    <Animated.View style={[styles.step, style]}>
      <Icon name={icons.checkCircle} size={20} color={colors.neon} />
      <Text style={styles.stepText}>{label}</Text>
    </Animated.View>
  );
}

/** Écran 3 : la feuille de résultat, les deux validations, puis le tampon « VALIDÉ ». */
export function ResultIllustration({ active }: { active: boolean }) {
  const card = useEntrance(active, 50, { y: 40, scale: 0.92 });
  const stamp = useEntrance(active, 1350, { scale: 2.4, rotate: 25 });
  return (
    <View style={styles.center}>
      <Animated.View style={[styles.sheet, card]}>
        <Text variant="label" style={{ color: colors.neon }}>
          Résultat · Inwall Kart
        </Text>
        <View style={styles.podium}>
          <View style={styles.podiumRow}>
            <Text style={[styles.place, { color: colors.neon }]}>1</Text>
            <Text style={styles.podiumName}>TOI</Text>
            <Text style={styles.lap}>34.455</Text>
          </View>
          <View style={styles.podiumRow}>
            <Text style={styles.place}>2</Text>
            <Text style={styles.podiumName}>RIVAL</Text>
            <Text style={styles.lap}>34.812</Text>
          </View>
        </View>
        <Step label="Tu saisis le résultat" active={active} delay={550} />
        <Step label="Ton rival confirme" active={active} delay={950} />
        <Animated.View style={[styles.stampSpot, stamp]}>
          <View style={styles.stamp}>
            <Text style={styles.stampText}>VALIDÉ</Text>
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const ELO_FROM = 1000;
const ELO_TO = 1120;
const BRONZE = 1100;

/** Écran 4 : l'ELO grimpe, la barre se remplit, le rang passe de Novice à Bronze. */
export function EloIllustration({ active }: { active: boolean }) {
  const [elo, setElo] = useState(ELO_FROM);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const t = Math.min(1, Math.max(0, (now - start - 350) / 1500));
      const eased = 1 - (1 - t) ** 3;
      setElo(Math.round(ELO_FROM + (ELO_TO - ELO_FROM) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      setElo(ELO_FROM);
    };
  }, [active]);

  const bronze = elo >= BRONZE;
  const rank = bronze ? rankMeta.bronze : rankMeta.novice;
  const fill = Math.min(1, (elo - ELO_FROM) / (BRONZE - ELO_FROM));
  const card = useEntrance(active, 50, { y: 30 });
  const gain = useEntrance(active, 1700, { y: 16, scale: 0.6 });
  const pop = useSharedValue(1);
  useEffect(() => {
    if (bronze) pop.set(withSequence(withTiming(1.35, { duration: 160, easing: Easing.out(Easing.quad) }), withSpring(1, SPRING)));
  }, [bronze, pop]);
  const rankStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  return (
    <View style={styles.center}>
      <Animated.View style={[styles.eloCard, card]}>
        <Text variant="label" style={{ color: colors.neon }}>
          Cote ELO
        </Text>
        <Text style={styles.elo}>{elo}</Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${fill * 100}%`, backgroundColor: bronze ? rank.color : colors.neon }]} />
        </View>
        <View style={styles.rankRow}>
          <Animated.View style={[styles.rank, { borderColor: rank.color }, rankStyle]}>
            <Text style={[styles.rankText, { color: rank.color }]}>{rank.label}</Text>
          </Animated.View>
          <Animated.View style={[styles.gain, gain]}>
            <Text style={styles.gainText}>+{ELO_TO - ELO_FROM}</Text>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

function Feature({ icon, label, active, delay }: { icon: IconName; label: string; active: boolean; delay: number }) {
  const style = useEntrance(active, delay, { scale: 0.4, y: 20 });
  return (
    <Animated.View style={[styles.feature, style]}>
      <View style={styles.featureIcon}>
        <Icon name={icon} size={26} color={colors.onNeon} />
      </View>
      <Text style={styles.featureText}>{label}</Text>
    </Animated.View>
  );
}

/** Écran 5 : le reste de l'appli, en quatre tuiles qui apparaissent l'une après l'autre. */
export function FeaturesIllustration({ active }: { active: boolean }) {
  return (
    <View style={[styles.center, styles.grid]}>
      <Feature icon={icons.map} label="350+ circuits" active={active} delay={80} />
      <Feature icon={icons.timer} label="Chronos vérifiés" active={active} delay={250} />
      <Feature icon={icons.team} label="Écuries" active={active} delay={420} />
      <Feature icon={icons.feed} label="L’Actu" active={active} delay={590} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  logoSpot: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: colors.neon },
  logo: { width: 170, height: 170 },
  wordmark: { fontSize: 30, fontWeight: '800', fontStyle: 'italic', letterSpacing: 2, color: colors.text },
  duel: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pilot: {
    width: 118,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  avatar: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  pilotName: { fontSize: 20, fontWeight: '800', textTransform: 'uppercase' },
  pilotElo: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  vs: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  vsText: { fontSize: 20, fontWeight: '800', color: colors.onNeon },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.neon,
  },
  chipText: { fontWeight: '800', color: colors.onNeon },
  sheet: {
    width: 290,
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  podium: { gap: spacing.xs },
  podiumRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  place: { width: 22, fontSize: 24, fontWeight: '800', color: colors.textMuted },
  podiumName: { flex: 1, fontSize: 20, fontWeight: '800' },
  lap: { fontSize: 16, fontWeight: '700', color: colors.textMuted },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepText: { fontWeight: '700' },
  stampSpot: { position: 'absolute', right: -12, top: -16 },
  stamp: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderWidth: 3,
    borderColor: colors.neon,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    transform: [{ rotate: '-12deg' }],
  },
  stampText: { fontSize: 22, fontWeight: '800', color: colors.neon, letterSpacing: 2 },
  eloCard: {
    width: 290,
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  elo: { fontSize: 76, lineHeight: 84, fontWeight: '800' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  rankRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  rank: { paddingHorizontal: spacing.md, paddingVertical: 4, borderWidth: 1.5, borderRadius: radius.sm },
  rankText: { fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  gain: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.neonDim },
  gainText: { fontSize: 18, fontWeight: '800', color: colors.neon },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 300, gap: spacing.md },
  feature: {
    width: 144,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  featureIcon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' },
  featureText: { fontWeight: '800', textAlign: 'center' },
});
