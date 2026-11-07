import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { activityBackgroundTint, font, foregroundStyle, monospacedDigit, padding, tint } from '@expo/ui/swift-ui/modifiers';
import { after, createLiveActivity } from 'expo-widgets';
import { useEffect } from 'react';

import { useTimeAttackSessions } from '@/features/time-attack/api';
import { isDemoMode } from '@/lib/demo';
import { formatLapTime } from '@/lib/format';

type TimeAttackActivityProps = {
  /** Session suivie (pour savoir quelle activité terminer). */
  sessionId: string;
  track: string;
  checkIn: string;
  deadline: string;
  /** running : compte à rebours ; validated : chrono validé (affiché quelques minutes après la fin). */
  state: 'running' | 'validated';
  lap?: string;
};

/**
 * Activité en direct d'une session Time Attack : compte à rebours des 90 min jusqu'à l'envoi du ticket, sur l'écran
 * verrouillé et dans la Dynamic Island. Le chronomètre défile tout seul, même appli fermée.
 * Fonction « widget » : sérialisée puis exécutée par l'extension iOS, elle ne voit que ses props. La barre de
 * progression est un tableau (vide une fois validé) plutôt que null : le rendu natif ne reçoit que des vues.
 */
const TimeAttackActivity = (props: TimeAttackActivityProps) => {
  'widget';
  const volt = '#DEFF00';
  const muted = '#8A95A5';
  const range = { lower: new Date(props.checkIn), upper: new Date(props.deadline) };
  const done = props.state === 'validated';
  const countdown = (size: number) => (
    <Text
      timerInterval={range}
      countsDown
      modifiers={[font({ size, weight: 'heavy', design: 'rounded' }), monospacedDigit(), foregroundStyle(volt)]}
    />
  );
  const status = done ? (
    <Text modifiers={[font({ size: 28, weight: 'heavy', design: 'rounded' }), foregroundStyle(volt)]}>{props.lap ?? 'Validé'}</Text>
  ) : (
    countdown(30)
  );
  const caption = done ? 'Chrono validé, bien roulé !' : 'Photographie ton ticket avant la fin du compte à rebours';
  const bar = done ? [] : [<ProgressView key="bar" timerInterval={range} countsDown modifiers={[tint(volt)]} />];

  return {
    banner: (
      <VStack alignment="leading" spacing={8} modifiers={[padding({ all: 16 }), activityBackgroundTint('#161920')]}>
        <HStack spacing={6}>
          <Image systemName="flag.checkered" color={volt} size={14} />
          <Text modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(volt)]}>TIME ATTACK</Text>
          <Spacer />
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle('#FFFFFF')]}>{props.track}</Text>
        </HStack>
        {status}
        {bar}
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>{caption}</Text>
      </VStack>
    ),
    compactLeading: <Image systemName={done ? 'checkmark.seal.fill' : 'flag.checkered'} color={volt} />,
    compactTrailing: done ? (
      <Text modifiers={[font({ size: 14, weight: 'heavy' }), foregroundStyle(volt)]}>{props.lap ?? 'OK'}</Text>
    ) : (
      <Text timerInterval={range} countsDown modifiers={[font({ size: 14, weight: 'heavy' }), monospacedDigit(), foregroundStyle(volt)]} />
    ),
    minimal: <Image systemName={done ? 'checkmark.seal.fill' : 'stopwatch'} color={volt} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 12, weight: 'heavy' }), foregroundStyle(volt)]}>TIME ATTACK</Text>
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle('#FFFFFF')]}>{props.track}</Text>
      </VStack>
    ),
    expandedTrailing: status,
    expandedBottom: (
      <VStack alignment="leading" spacing={6}>
        {bar}
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>{caption}</Text>
      </VStack>
    ),
  };
};

const timeAttackActivity = createLiveActivity<TimeAttackActivityProps>('TimeAttack', TimeAttackActivity);

/**
 * Tient l'activité en direct à jour avec les sessions du pilote : démarrée au check-in (le serveur fixe l'heure),
 * terminée quand la session se clôt. Un chrono validé reste affiché 10 minutes.
 */
export function useTimeAttackLiveActivity(enabled: boolean) {
  const sessions = useTimeAttackSessions();
  const list = sessions.data;
  useEffect(() => {
    if (!enabled || !list || isDemoMode) return;
    try {
      const running = timeAttackActivity.getInstances();
      const current = list.find((s) => s.status === 'on_track' && Date.parse(s.deadline_at) > Date.now());
      if (current) {
        const props: TimeAttackActivityProps = {
          sessionId: current.id,
          track: current.track?.name ?? 'Time Attack',
          checkIn: current.check_in_at,
          deadline: current.deadline_at,
          state: 'running',
        };
        const stale = new Date(current.deadline_at);
        if (running.length === 0) {
          timeAttackActivity.start(props, 'kartrivals://time-attack', stale);
        } else {
          running[0].update(props, stale).catch(() => {});
          running.slice(1).forEach((a) => a.end('immediate').catch(() => {}));
        }
        return;
      }
      if (running.length === 0) return;
      // Session close : chrono validé affiché quelques minutes, sinon l'activité disparaît.
      const last = list[0];
      if (last?.status === 'validated') {
        const final: TimeAttackActivityProps = {
          sessionId: last.id,
          track: last.track?.name ?? 'Time Attack',
          checkIn: last.check_in_at,
          deadline: last.deadline_at,
          state: 'validated',
          lap: last.best_lap_ms ? formatLapTime(last.best_lap_ms) : undefined,
        };
        running.forEach((a) => a.end(after(new Date(Date.now() + 10 * 60_000)), final).catch(() => {}));
      } else {
        running.forEach((a) => a.end('immediate').catch(() => {}));
      }
    } catch {
      // Activités désactivées par le pilote ou iOS trop ancien : l'écran Time Attack suffit.
    }
  }, [enabled, list]);
}
