import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { useEffect } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { useMyChallenges } from '@/features/challenges/api';
import { usePilotStandings } from '@/features/leaderboard/api';
import { useMyProfile } from '@/features/profile/api';
import { isDemoMode } from '@/lib/demo';
import { nextChallengeFor, widgetPropsFor, type PilotWidgetProps } from '@/features/widgets/pilot-widget-props';

/**
 * Widget d'écran d'accueil (et d'écran verrouillé) : ELO, rang avec progression vers le suivant, et prochain défi.
 * Fonction « widget » : sérialisée puis exécutée par l'extension iOS, elle ne voit que ses props et son
 * environnement (aucune constante du module). Les vues optionnelles sont des tableaux (vides) plutôt que null :
 * le rendu natif ne reçoit que des vues.
 */
const PilotWidget = (props: PilotWidgetProps, env: WidgetEnvironment) => {
  'widget';
  const volt = '#DEFF00';
  const muted = '#8A95A5';
  const background = '#111418';
  const family = env.widgetFamily ?? 'systemSmall';
  const bg = containerBackground(background, 'widget');

  if (!props.signedIn) {
    return (
      <VStack alignment="leading" spacing={6} modifiers={[bg, widgetURL('kartrivals://')]}>
        <Image systemName="flag.checkered" color={volt} size={18} />
        <Text modifiers={[font({ size: 15, weight: 'heavy' }), foregroundStyle('#FFFFFF')]}>Kart Rivals</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>Connecte-toi pour voir ton ELO</Text>
      </VStack>
    );
  }

  const hasChallenge = props.challengeOpponent !== '';
  const nextRank = props.nextRankLabel !== '' ? `${props.toNext} pts → ${props.nextRankLabel}` : 'Rang maximum';
  const position = props.position > 0 ? [<Text key="pos" modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(muted)]}>{`${props.position}e en France`}</Text>] : [];

  if (family === 'accessoryInline') {
    return (
      <Text modifiers={[bg, widgetURL('kartrivals://')]}>
        {hasChallenge ? `${props.elo} ELO · vs ${props.challengeOpponent}` : `${props.elo} ELO · ${props.rankLabel}`}
      </Text>
    );
  }

  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[bg, widgetURL(hasChallenge ? props.challengeUrl : 'kartrivals://')]}>
        <HStack spacing={4}>
          <Image systemName="flag.checkered" size={11} />
          <Text modifiers={[font({ size: 13, weight: 'heavy' }), monospacedDigit()]}>{`${props.elo} · ${props.rankLabel}`}</Text>
        </HStack>
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1)]}>
          {hasChallenge ? `vs ${props.challengeOpponent}` : 'Aucun défi en cours'}
        </Text>
        <Text modifiers={[font({ size: 11 }), lineLimit(1)]}>{hasChallenge ? props.challengeWhen : nextRank}</Text>
      </VStack>
    );
  }

  const eloBlock = (
    <VStack alignment="leading" spacing={4}>
      <HStack spacing={5}>
        <Image systemName="trophy.fill" color={props.rankColor} size={12} />
        <Text modifiers={[font({ size: 12, weight: 'heavy' }), foregroundStyle(props.rankColor)]}>{props.rankLabel.toUpperCase()}</Text>
      </HStack>
      <Text modifiers={[font({ size: 34, weight: 'heavy', design: 'rounded' }), monospacedDigit(), foregroundStyle('#FFFFFF'), minimumScaleFactor(0.6)]}>
        {`${props.elo}`}
      </Text>
      <ProgressView value={props.progress} modifiers={[tint(props.rankColor)]} />
      <Text modifiers={[font({ size: 11 }), foregroundStyle(muted), lineLimit(1)]}>{nextRank}</Text>
    </VStack>
  );

  if (family === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={4} modifiers={[bg, widgetURL(hasChallenge ? props.challengeUrl : 'kartrivals://')]}>
        {eloBlock}
        <Spacer />
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(hasChallenge ? volt : muted), lineLimit(1)]}>
          {hasChallenge ? `vs ${props.challengeOpponent}` : 'Lance un défi !'}
        </Text>
      </VStack>
    );
  }

  // systemMedium : ELO à gauche, prochain défi à droite.
  const challenge = hasChallenge ? (
    <VStack alignment="leading" spacing={3}>
      <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(volt)]}>PROCHAIN DÉFI</Text>
      <Text modifiers={[font({ size: 16, weight: 'heavy' }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>{`vs ${props.challengeOpponent}`}</Text>
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>{props.challengeTrack}</Text>
      <Text modifiers={[font({ size: 11 }), foregroundStyle(muted), lineLimit(1)]}>{props.challengeWhen}</Text>
      <Spacer />
      <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(props.challengeNeedsMe ? volt : muted), lineLimit(1)]}>
        {props.challengeStatus}
      </Text>
    </VStack>
  ) : (
    <VStack alignment="leading" spacing={4}>
      <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(volt)]}>PROCHAIN DÉFI</Text>
      <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle('#FFFFFF')]}>Aucun défi en cours</Text>
      <Spacer />
      <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>Touche pour défier un pilote</Text>
    </VStack>
  );

  return (
    <HStack alignment="top" spacing={14} modifiers={[bg, widgetURL(hasChallenge ? props.challengeUrl : 'kartrivals://challenges')]}>
      <VStack alignment="leading" spacing={4}>
        {eloBlock}
        <Spacer />
        {position}
      </VStack>
      {challenge}
      <Spacer />
    </HStack>
  );
};

const pilotWidget = createWidget<PilotWidgetProps>('PilotCard', PilotWidget);

/**
 * Tient le widget à jour avec le profil, le classement et les défis du pilote connecté. Après une déconnexion,
 * le widget n'affiche plus rien de personnel.
 */
export function usePilotWidget(enabled: boolean) {
  const { userId } = useAuth();
  const profile = useMyProfile();
  const challenges = useMyChallenges();
  const standings = usePilotStandings(enabled ? userId : null);
  const me = profile.data;
  const list = challenges.data;
  const position = standings.data?.national ?? null;

  useEffect(() => {
    if (isDemoMode) return;
    try {
      if (!userId || !enabled || !me) {
        // Pas encore chargé : on garde le dernier affichage, sauf déconnexion.
        if (!userId) pilotWidget.updateSnapshot(widgetPropsFor(null, null, null, null));
        return;
      }
      const next = list ? nextChallengeFor(list, userId) : null;
      pilotWidget.updateSnapshot(widgetPropsFor(me, position, next, userId));
    } catch {
      // Extension absente (build sans widget) : l'appli fonctionne sans.
    }
  }, [enabled, userId, me, list, position]);
}
