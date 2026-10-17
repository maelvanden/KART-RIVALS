import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Icon, icons } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { colors, spacing } from '@/theme';
import type { PollPayload } from '@/types/models';

type Props = { visible: boolean; onClose: () => void; onSend: (poll: PollPayload) => void; sending?: boolean };

/** Création d'un sondage rapide : une question, 2 à 4 options. */
export function PollComposer({ visible, onClose, onSend, sending }: Props) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const valid = question.trim().length >= 3 && filled.length >= 2;

  function send() {
    onSend({ question: question.trim(), options: filled });
    setQuestion('');
    setOptions(['', '']);
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Sondage" leading={<Icon name={icons.poll} color={colors.neon} />}>
      <View style={styles.form}>
        <Input label="Question" value={question} onChangeText={setQuestion} placeholder="Samedi 14h ou dimanche 10h ?" maxLength={120} />
        {options.map((o, i) => (
          <Input
            key={i}
            label={`Option ${i + 1}`}
            value={o}
            onChangeText={(t) => setOptions((list) => list.map((x, j) => (j === i ? t : x)))}
            placeholder={i === 0 ? 'Samedi 14h' : i === 1 ? 'Dimanche 10h' : 'Autre créneau'}
            maxLength={60}
          />
        ))}
        {options.length < 4 ? (
          <Button title="Ajouter une option" variant="ghost" onPress={() => setOptions((list) => [...list, ''])} />
        ) : null}
        <Button title="Lancer le sondage" disabled={!valid} loading={sending} onPress={send} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
});
