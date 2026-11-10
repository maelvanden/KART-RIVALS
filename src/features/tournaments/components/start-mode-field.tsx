import { View } from 'react-native';

import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { spacing } from '@/theme';

/** Lancement du tableau : tout seul quand il est plein, ou par l'organisateur (avec liste d'attente). */
export function StartModeField({ autoStart, onChange }: { autoStart: boolean; onChange: (autoStart: boolean) => void }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Segmented
        options={[
          { value: 'auto', label: 'Dès que c’est plein' },
          { value: 'manual', label: 'Je le lance' },
        ]}
        value={autoStart ? 'auto' : 'manual'}
        onChange={(v) => onChange(v === 'auto')}
      />
      <Text variant="caption">
        {autoStart
          ? 'Le tirage se fait tout seul à la dernière inscription. Pas de liste d’attente.'
          : 'Tu lances le tableau quand tu veux. Une fois plein, les pilotes s’inscrivent en liste d’attente : le premier remplaçant prend la place de celui qui se désiste.'}
      </Text>
    </View>
  );
}
