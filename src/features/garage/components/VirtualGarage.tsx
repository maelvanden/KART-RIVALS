import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/card';
import { Icon, icons } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useSetGear } from '@/features/garage/api';
import { brandLabels, gearSlots, type GearBrand, type UserGear } from '@/features/garage/catalog';
import { colors, radius, spacing } from '@/theme';

const RENTAL_LABEL = 'Équipement de location';

type Slot = (typeof gearSlots)[number];

type Props = {
  gear: UserGear;
  /** Vrai sur le profil du pilote connecté : les slots s'ouvrent pour choisir une marque. */
  editable?: boolean;
};

/**
 * Garage virtuel : 5 slots d'équipement illustrés par des icônes génériques (aucun logo de marque).
 * Un slot vide affiche « Équipement de location ».
 */
export function VirtualGarage({ gear, editable = false }: Props) {
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="label">Garage virtuel</Text>
        {editable ? <Text variant="caption">Touchez un slot pour le modifier</Text> : null}
      </View>
      <View style={styles.grid}>
        {gearSlots.map((slot) => (
          <GearSlot
            key={slot.category}
            slot={slot}
            brand={gear[slot.category]}
            onPress={editable ? () => setOpenSlot(slot) : undefined}
          />
        ))}
      </View>
      {editable ? (
        <BrandSheet slot={openSlot} value={openSlot ? gear[openSlot.category] : null} onClose={() => setOpenSlot(null)} />
      ) : null}
    </Card>
  );
}

function GearSlot({ slot, brand, onPress }: { slot: Slot; brand: GearBrand | null; onPress?: () => void }) {
  const owned = brand !== null;
  const value = owned ? brandLabels[brand] : RENTAL_LABEL;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${slot.label} : ${value}`}
      accessibilityHint={onPress ? 'Choisir la marque' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.slot, owned && styles.slotOwned, pressed && styles.pressed]}>
      <View style={[styles.slotIcon, owned && styles.slotIconOwned]}>
        <Icon name={slot.icon} size={22} color={owned ? colors.neon : colors.textMuted} />
      </View>
      <Text variant="label" style={styles.slotLabel} numberOfLines={1}>
        {slot.label}
      </Text>
      <Text
        style={[styles.slotValue, !owned && styles.slotRental]}
        numberOfLines={owned ? 1 : 2}
        adjustsFontSizeToFit={owned}
        minimumFontScale={0.75}>
        {value}
      </Text>
    </Pressable>
  );
}

/** BottomSheet de sélection : liste des marques prédéfinies de la catégorie + « location ». */
function BrandSheet({ slot, value, onClose }: { slot: Slot | null; value: GearBrand | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const setGear = useSetGear();

  const choose = (brand: GearBrand | null) => {
    if (!slot) return;
    if (brand === value) return onClose();
    setGear.mutate({ category: slot.category, brand }, { onSuccess: onClose });
  };

  const close = () => {
    setGear.reset();
    onClose();
  };

  return (
    <Modal visible={slot !== null} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} accessibilityLabel="Fermer" onPress={close} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.grabber} />
        <View style={styles.sheetHeader}>
          {slot ? <Icon name={slot.icon} size={22} color={colors.neon} /> : null}
          <Text variant="heading" style={styles.sheetTitle}>
            {slot?.label}
          </Text>
          {setGear.isPending ? <ActivityIndicator color={colors.neon} /> : null}
          <Pressable accessibilityLabel="Fermer" onPress={close} hitSlop={12}>
            <Icon name={icons.close} color={colors.textMuted} />
          </Pressable>
        </View>
        {setGear.error ? (
          <Text variant="caption" style={styles.error}>
            Enregistrement impossible : {setGear.error.message}
          </Text>
        ) : null}
        <ScrollView contentContainerStyle={styles.options} accessibilityRole="radiogroup">
          {slot?.brands.map((brand) => (
            <BrandOption
              key={brand}
              label={brandLabels[brand]}
              selected={value === brand}
              disabled={setGear.isPending}
              onPress={() => choose(brand)}
            />
          ))}
          <BrandOption
            label={RENTAL_LABEL}
            muted
            selected={value === null}
            disabled={setGear.isPending}
            onPress={() => choose(null)}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

function BrandOption({
  label,
  selected,
  disabled,
  muted,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  muted?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <Text style={[styles.optionLabel, muted && styles.optionMuted]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  header: { gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 112,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  slotOwned: { borderStyle: 'solid', borderColor: colors.neon, backgroundColor: '#12190F' },
  slotIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  slotIconOwned: { backgroundColor: colors.neonDim },
  slotLabel: { fontSize: 9, letterSpacing: 0.6 },
  slotValue: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  slotRental: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  pressed: { opacity: 0.7 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  sheet: {
    maxHeight: '75%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sheetTitle: { flex: 1 },
  error: { color: colors.danger },
  options: { gap: spacing.sm, paddingBottom: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  optionSelected: { borderColor: colors.neon, backgroundColor: '#12190F' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.neon },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.neon },
  optionLabel: { fontSize: 16, fontWeight: '800' },
  optionMuted: { color: colors.textMuted, fontWeight: '600' },
});
