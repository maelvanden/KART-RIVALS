import { View } from 'react-native';

import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { spacing } from '@/theme';

/** Choix « Public » ou « Privé », avec ce que ça change. */
export function PrivacyField({ isPrivate, onChange }: { isPrivate: boolean; onChange: (isPrivate: boolean) => void }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Segmented
        options={[
          { value: 'public', label: 'Public' },
          { value: 'private', label: 'Privé' },
        ]}
        value={isPrivate ? 'private' : 'public'}
        onChange={(v) => onChange(v === 'private')}
      />
      <Text variant="caption">
        {isPrivate
          ? 'Sur invitation seulement : le tournoi n’apparaît que chez les pilotes que tu invites, et eux seuls peuvent s’inscrire.'
          : 'Visible par tous dans « Inscriptions ouvertes » : n’importe quel pilote peut s’inscrire, et les inscrits peuvent inviter.'}
      </Text>
    </View>
  );
}
