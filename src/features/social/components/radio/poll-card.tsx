import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors, fonts, radius, spacing } from '@/theme';
import type { PollPayload, PollVote } from '@/types/models';

type Props = {
  poll: PollPayload;
  votes: PollVote[];
  myId: string | null;
  onVote: (option: number) => void;
  disabled?: boolean;
};

/** Sondage rapide : une option par pilote, modifiable ; les résultats s'affichent en direct. */
export function PollCard({ poll, votes, myId, onVote, disabled }: Props) {
  const total = votes.length;
  const mine = votes.find((v) => v.profile_id === myId)?.option_index;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Icon name={icons.poll} size={14} color={colors.neon} />
        <Text style={styles.kicker}>Sondage</Text>
      </View>
      <Text style={styles.question}>{poll.question}</Text>
      <View style={styles.options}>
        {poll.options.map((option, i) => {
          const count = votes.filter((v) => v.option_index === i).length;
          const share = total > 0 ? count / total : 0;
          const selected = mine === i;
          return (
            <Pressable
              key={i}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${option}, ${count} vote${count > 1 ? 's' : ''}`}
              disabled={disabled}
              onPress={() => onVote(i)}
              style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}>
              <View style={[styles.bar, { width: `${Math.max(share * 100, 0)}%` }, selected && styles.barSelected]} />
              <Text style={[styles.optionText, selected && styles.optionSelected]} numberOfLines={2}>
                {option}
              </Text>
              <Text style={[styles.count, selected && styles.optionSelected]}>{total > 0 ? `${Math.round(share * 100)}%` : ''}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption">
        {total} vote{total > 1 ? 's' : ''}
        {mine === undefined ? ' · touche une option pour voter' : ' · tu peux changer ton vote'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 260,
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.neon,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  kicker: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 1.2, color: colors.neon, textTransform: 'uppercase' },
  question: { fontWeight: '800', fontSize: 16, lineHeight: 21 },
  options: { gap: spacing.xs },
  option: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
  },
  selected: { borderColor: colors.neon },
  pressed: { opacity: 0.8 },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255, 255, 255, 0.06)' },
  barSelected: { backgroundColor: colors.neonDim },
  optionText: { flex: 1, fontWeight: '600' },
  optionSelected: { color: colors.neon },
  count: { fontFamily: fonts.display, fontSize: 14, color: colors.textMuted, fontVariant: ['tabular-nums'] },
});
