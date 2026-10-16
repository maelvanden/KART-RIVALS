import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useEquipGearItem, useGarage, useGearCatalog, useMyPoints } from '@/features/garage/api';
import {
  equippedItem,
  gearSlots,
  isEquipped,
  isOwned,
  rarityMeta,
  type Garage,
  type GearItem,
  type GearSlot,
} from '@/features/garage/catalog';
import { GearArt } from '@/features/garage/components/gear-art';
import { PointsChip } from '@/features/garage/components/points-chip';
import { gearErrorMessage } from '@/features/garage/errors';
import { colors, radius, spacing } from '@/theme';

type Props = {
  profileId: string;
  /** Vrai sur le profil du pilote connecté : changer d'équipement, accès à la boutique. */
  editable?: boolean;
};

/**
 * Garage virtuel : les 5 équipements portés par le pilote, gagnés ou achetés avec ses points.
 * Visuels génériques (aucun logo de marque) ; un slot vide affiche l'équipement de location.
 */
export function VirtualGarage({ profileId, editable = false }: Props) {
  const catalog = useGearCatalog();
  const garage = useGarage(profileId);
  const points = useMyPoints();
  const [openSlot, setOpenSlot] = useState<GearSlot | null>(null);

  if (!catalog.data || !garage.data) return null;
  const items = catalog.data;
  const owned = garage.data;
  const collectible = items.filter((i) => i.rarity !== 'starter');
  const ownedCount = collectible.filter((i) => isOwned(i, owned)).length;

  const [big, small] = [gearSlots.slice(0, 2), gearSlots.slice(2)];
  const tile = (slot: GearSlot, size: number) => {
    const item = equippedItem(items, owned, slot)!;
    return (
      <SlotTile
        key={slot}
        item={item}
        label={gearSlots.find((s) => s.slot === slot)!.label}
        artSize={size}
        onPress={editable ? () => setOpenSlot(slot) : undefined}
      />
    );
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="label">Garage virtuel</Text>
          <Text variant="caption">
            Collection : {ownedCount} / {collectible.length} objets
          </Text>
        </View>
        {editable && points.data !== undefined ? <PointsChip points={points.data} /> : null}
      </View>

      <View style={styles.row}>{big.map((s) => tile(s.slot, 96))}</View>
      <View style={styles.row}>{small.map((s) => tile(s.slot, 60))}</View>

      {editable ? (
        <Button title="Ouvrir la boutique" variant="secondary" onPress={() => router.push('/shop')} />
      ) : null}

      {editable ? (
        <SlotSheet slot={openSlot} catalog={items} garage={owned} onClose={() => setOpenSlot(null)} />
      ) : null}
    </Card>
  );
}

function SlotTile({
  item,
  label,
  artSize,
  onPress,
}: {
  item: GearItem;
  label: string;
  artSize: number;
  onPress?: () => void;
}) {
  const rental = item.rarity === 'starter';
  const rarity = rarityMeta[item.rarity];
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label} : ${item.name}`}
      accessibilityHint={onPress ? "Changer d'équipement" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <GearArt item={item} size={artSize} showcase style={[styles.tileArt, rental && styles.rentalArt]} />
      <View style={styles.tileText}>
        <Text variant="label" style={styles.tileLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.tileName, rental && styles.rentalName]} numberOfLines={1}>
          {rental ? 'En location' : item.name}
        </Text>
        {!rental ? (
          <Text style={[styles.rarity, { color: rarity.color }]} numberOfLines={1}>
            {rarity.label}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Choix de l'équipement porté parmi sa collection, avec un raccourci vers la boutique. */
function SlotSheet({
  slot,
  catalog,
  garage,
  onClose,
}: {
  slot: GearSlot | null;
  catalog: GearItem[];
  garage: Garage;
  onClose: () => void;
}) {
  const equip = useEquipGearItem();
  const meta = gearSlots.find((s) => s.slot === slot);
  const ofSlot = catalog.filter((i) => i.slot === slot);
  const mine = ofSlot.filter((i) => isOwned(i, garage));
  const toUnlock = ofSlot.length - mine.length;

  const close = () => {
    equip.reset();
    onClose();
  };

  return (
    <BottomSheet
      visible={slot !== null}
      onClose={close}
      title={meta ? `Mon ${meta.label.toLowerCase()}` : undefined}
      leading={
        equip.isPending ? (
          <ActivityIndicator color={colors.neon} />
        ) : meta ? (
          <Icon name={meta.icon} color={colors.neon} />
        ) : null
      }>
      {equip.error ? (
        <Text variant="caption" style={styles.error}>
          {gearErrorMessage(equip.error)}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
        {mine.map((item) => {
          const on = isEquipped(item, garage);
          return (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: equip.isPending }}
              accessibilityLabel={item.name}
              disabled={equip.isPending}
              onPress={() => (on ? close() : equip.mutate(item, { onSuccess: close }))}
              style={({ pressed }) => [styles.choice, on && styles.choiceOn, pressed && styles.pressed]}>
              <GearArt item={item} size={84} showcase style={styles.choiceArt} />
              <Text style={styles.choiceName} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={[styles.rarity, { color: on ? colors.neon : rarityMeta[item.rarity].color }]}>
                {on ? 'Équipé' : rarityMeta[item.rarity].label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {toUnlock > 0 ? (
        <Button
          title={`${toUnlock} autre${toUnlock > 1 ? 's' : ''} à débloquer dans la boutique`}
          variant="ghost"
          onPress={() => {
            close();
            router.push({ pathname: '/shop', params: { slot: slot! } });
          }}
        />
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  headerText: { gap: 2, flexShrink: 1 },
  row: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, gap: spacing.sm },
  tileArt: { paddingVertical: spacing.sm },
  rentalArt: { borderStyle: 'dashed', borderColor: colors.border },
  tileText: { gap: 1, alignItems: 'center' },
  tileLabel: { fontSize: 9, letterSpacing: 0.6 },
  tileName: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  rentalName: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  rarity: { fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.7 },
  error: { color: colors.danger },
  choices: { gap: spacing.sm, paddingBottom: spacing.xs },
  choice: {
    width: 116,
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  choiceOn: { borderColor: colors.neon },
  choiceArt: { width: '100%', paddingVertical: spacing.xs },
  choiceName: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
});
