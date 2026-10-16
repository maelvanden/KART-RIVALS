import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chips } from '@/components/ui/chips';
import { Icon, icons } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { ErrorState, Loading } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { useBuyGearItem, useEquipGearItem, useGarage, useGearCatalog, useMyPoints } from '@/features/garage/api';
import {
  gearSlots,
  isEquipped,
  isOwned,
  POINTS_RULES,
  rarityMeta,
  slotLabels,
  type Garage,
  type GearItem,
  type GearSlot,
} from '@/features/garage/catalog';
import { GearArt } from '@/features/garage/components/gear-art';
import { PointsChip } from '@/features/garage/components/points-chip';
import { gearErrorMessage } from '@/features/garage/errors';
import { useMyProfile } from '@/features/profile/api';
import { colors, radius, rankAtLeast, rankMeta, spacing } from '@/theme';
import type { RankTier } from '@/types/models';

type Status =
  | { kind: 'equipped' }
  | { kind: 'owned' }
  | { kind: 'claim' }
  | { kind: 'locked'; rank: RankTier }
  | { kind: 'buy'; missing: number };

function statusOf(item: GearItem, garage: Garage, points: number, rank: RankTier): Status {
  if (isOwned(item, garage)) return { kind: isEquipped(item, garage) ? 'equipped' : 'owned' };
  if (item.unlock_rank && !rankAtLeast(rank, item.unlock_rank)) return { kind: 'locked', rank: item.unlock_rank };
  if (item.price === 0) return { kind: 'claim' };
  return { kind: 'buy', missing: Math.max(0, item.price - points) };
}

type Filter = GearSlot | 'all';

export default function ShopScreen() {
  const params = useLocalSearchParams<{ slot?: GearSlot }>();
  const profile = useMyProfile();
  const catalog = useGearCatalog();
  const garage = useGarage(profile.data?.id);
  const points = useMyPoints();
  const [filter, setFilter] = useState<Filter>(params.slot ?? 'all');
  const [selected, setSelected] = useState<GearItem | null>(null);

  const error = catalog.error ?? garage.error ?? points.error;
  const ready = catalog.data && garage.data && points.data !== undefined && profile.data;
  const items = (catalog.data ?? []).filter((i) => i.rarity !== 'starter' && (filter === 'all' || i.slot === filter));

  return (
    <Screen
      safeTop={false}
      refreshing={points.isRefetching}
      onRefresh={() => {
        catalog.refetch();
        garage.refetch();
        points.refetch();
      }}>
      {error ? <ErrorState error={error} /> : null}
      {!error && !ready ? <Loading /> : null}
      {ready ? (
        <>
          <Card style={styles.wallet}>
            <View style={styles.walletTop}>
              <View style={styles.walletText}>
                <Text variant="label">Mes points</Text>
                <Text variant="caption">Roule, gagne, équipe-toi.</Text>
              </View>
              <PointsChip points={points.data!} large />
            </View>
            <View style={styles.rules}>
              {POINTS_RULES.map((r) => (
                <View key={r.label} style={styles.rule}>
                  <Text style={styles.rulePoints}>+{r.points}</Text>
                  <Text variant="caption" style={styles.ruleLabel}>
                    {r.label}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          <Chips<Filter>
            options={[{ value: 'all', label: 'Tout' }, ...gearSlots.map((s) => ({ value: s.slot, label: s.label }))]}
            value={filter}
            onChange={setFilter}
          />

          <View style={styles.grid}>
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                status={statusOf(item, garage.data!, points.data!, profile.data!.rank)}
                onPress={() => setSelected(item)}
              />
            ))}
          </View>

          <ItemSheet
            item={selected}
            status={selected ? statusOf(selected, garage.data!, points.data!, profile.data!.rank) : null}
            myRank={profile.data!.rank}
            onClose={() => setSelected(null)}
          />
        </>
      ) : null}
    </Screen>
  );
}

function StatusLine({ item, status }: { item: GearItem; status: Status }) {
  switch (status.kind) {
    case 'equipped':
      return <Text style={[styles.status, { color: colors.neon }]}>✓ Équipé</Text>;
    case 'owned':
      return <Text style={[styles.status, { color: colors.text }]}>Dans mon garage</Text>;
    case 'claim':
      return (
        <View style={styles.statusRow}>
          <Icon name={icons.gift} size={14} color={colors.orange} />
          <Text style={[styles.status, { color: colors.orange }]}>À récupérer</Text>
        </View>
      );
    case 'locked':
      return (
        <View style={styles.statusRow}>
          <Icon name={icons.lock} size={12} color={rankMeta[status.rank].color} />
          <Text style={[styles.status, { color: rankMeta[status.rank].color }]}>Rang {rankMeta[status.rank].label}</Text>
        </View>
      );
    case 'buy':
      return (
        <View style={styles.statusRow}>
          <Icon name={icons.coin} size={14} color={status.missing ? colors.textMuted : colors.neon} />
          <Text style={[styles.status, { color: status.missing ? colors.textMuted : colors.neon }]}>
            {item.price.toLocaleString('fr-FR')} pts
          </Text>
        </View>
      );
  }
}

function ItemCard({ item, status, onPress }: { item: GearItem; status: Status; onPress: () => void }) {
  const rarity = rarityMeta[item.rarity];
  const locked = status.kind === 'locked';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${rarity.label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        status.kind === 'equipped' && styles.itemEquipped,
        pressed && styles.pressed,
      ]}>
      <GearArt item={item} size={104} showcase dimmed={locked} style={styles.itemArt} />
      {locked ? (
        <View style={styles.lockBadge}>
          <Icon name={icons.lock} size={14} color={colors.text} />
        </View>
      ) : null}
      <View style={styles.itemText}>
        <Text style={[styles.rarity, { color: rarity.color }]}>
          {rarity.label} · {slotLabels[item.slot]}
        </Text>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <StatusLine item={item} status={status} />
      </View>
    </Pressable>
  );
}

function ItemSheet({
  item,
  status,
  myRank,
  onClose,
}: {
  item: GearItem | null;
  status: Status | null;
  myRank: RankTier;
  onClose: () => void;
}) {
  const buy = useBuyGearItem();
  const equip = useEquipGearItem();
  const [unlocked, setUnlocked] = useState(false);
  const pending = buy.isPending || equip.isPending;
  const error = buy.error ?? equip.error;

  const close = () => {
    buy.reset();
    equip.reset();
    setUnlocked(false);
    onClose();
  };

  const onBuy = () =>
    buy.mutate(item!, {
      onSuccess: () => {
        setUnlocked(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      },
    });

  let action: { title: string; onPress?: () => void; hint?: string } = { title: '' };
  if (item && status) {
    switch (status.kind) {
      case 'equipped':
        action = { title: 'Équipé' };
        break;
      case 'owned':
        action = { title: 'Équiper', onPress: () => equip.mutate(item, { onSuccess: close }) };
        break;
      case 'claim':
        action = { title: 'Récupérer ma récompense', onPress: onBuy, hint: 'Offert pour ton rang : il est à toi !' };
        break;
      case 'locked':
        action = {
          title: `Débloqué au rang ${rankMeta[status.rank].label}`,
          hint: `Récompense gratuite dès le rang ${rankMeta[status.rank].label} (tu es ${rankMeta[myRank].label}). Gagne des défis pour monter !`,
        };
        break;
      case 'buy':
        action = status.missing
          ? { title: `${item.price.toLocaleString('fr-FR')} pts`, hint: `Encore ${status.missing.toLocaleString('fr-FR')} pts à gagner en piste.` }
          : { title: `Acheter pour ${item.price.toLocaleString('fr-FR')} pts`, onPress: onBuy };
        break;
    }
  }

  return (
    <BottomSheet visible={item !== null} onClose={close} title={item?.name}>
      {item && status ? (
        <View style={styles.sheetBody}>
          <GearArt item={item} size={180} showcase dimmed={status.kind === 'locked'} style={styles.sheetArt} />
          <Text style={[styles.sheetRarity, { color: rarityMeta[item.rarity].color }]}>
            {rarityMeta[item.rarity].label} · {slotLabels[item.slot]}
          </Text>
          {unlocked ? (
            <Text style={styles.success}>Nouvel équipement ! Il est dans ton garage et déjà équipé.</Text>
          ) : null}
          {error ? (
            <Text variant="caption" style={styles.error}>
              {gearErrorMessage(error)}
            </Text>
          ) : null}
          {action.hint && !unlocked ? (
            <Text variant="caption" style={styles.hint}>
              {action.hint}
            </Text>
          ) : null}
          {unlocked ? (
            <Button title="Super !" onPress={close} />
          ) : (
            <Button title={action.title} onPress={action.onPress} disabled={!action.onPress} loading={pending} />
          )}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wallet: { gap: spacing.lg },
  walletTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  walletText: { gap: 2, flexShrink: 1 },
  rules: { flexDirection: 'row', gap: spacing.sm },
  rule: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  rulePoints: { color: colors.neon, fontWeight: '900', fontSize: 18 },
  ruleLabel: { fontSize: 11, textAlign: 'center', lineHeight: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  item: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  itemEquipped: { borderColor: colors.neon },
  itemArt: { paddingVertical: spacing.md },
  lockBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  itemText: { gap: 2, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  rarity: { fontSize: 11, fontWeight: '800' },
  itemName: { fontSize: 15, fontWeight: '900' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  status: { fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.75 },
  sheetBody: { gap: spacing.md, paddingBottom: spacing.sm },
  sheetArt: { paddingVertical: spacing.lg },
  sheetRarity: { textAlign: 'center', fontWeight: '800' },
  hint: { textAlign: 'center' },
  success: { textAlign: 'center', color: colors.neon, fontWeight: '800' },
  error: { textAlign: 'center', color: colors.danger },
});
