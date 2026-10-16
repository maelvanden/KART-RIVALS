import { icons, type IconName } from '@/components/ui/icon';
import type { RankTier } from '@/types/models';

/** Types alignés sur la migration 20261020000016_user_gear.sql (gear_slot, gear_rarity, gear_items). */
export type GearSlot = 'helmet' | 'suit' | 'gloves' | 'shoes' | 'rib_protector';
export type GearRarity = 'starter' | 'common' | 'rare' | 'epic' | 'legendary';

export type GearItem = {
  id: string;
  slot: GearSlot;
  name: string;
  rarity: GearRarity;
  /** Prix en points (0 pour la location et les récompenses de rang). */
  price: number;
  /** Rang requis : récompense gratuite si price = 0, sinon condition d'achat. */
  unlock_rank: RankTier | null;
  sort: number;
};

/** Collection et équipement d'un pilote. Un slot absent de `equipped` = équipement de location. */
export type Garage = {
  owned: string[];
  equipped: Partial<Record<GearSlot, string>>;
};

export const gearSlots: { slot: GearSlot; label: string; icon: IconName }[] = [
  { slot: 'helmet', label: 'Casque', icon: icons.helmet },
  { slot: 'suit', label: 'Combinaison', icon: icons.suit },
  { slot: 'gloves', label: 'Gants', icon: icons.gloves },
  { slot: 'shoes', label: 'Bottines', icon: icons.shoes },
  { slot: 'rib_protector', label: 'Protège-côtes', icon: icons.ribProtector },
];

export const slotLabels = Object.fromEntries(gearSlots.map((s) => [s.slot, s.label])) as Record<GearSlot, string>;

export const rarityMeta: Record<GearRarity, { label: string; color: string }> = {
  starter: { label: 'Location', color: '#8A93A3' },
  common: { label: 'Commun', color: '#C0C7D1' },
  rare: { label: 'Rare', color: '#5AA9FF' },
  epic: { label: 'Épique', color: '#B26BFF' },
  legendary: { label: 'Légendaire', color: '#FFC83D' },
};

/** Barème des points (appliqué côté base, voir la migration). */
export const POINTS_RULES = [
  { label: 'Victoire (défi ou course)', points: 50 },
  { label: 'Défi ou course validé', points: 20 },
  { label: 'Time Attack validé', points: 30 },
];

/** Équipement de location du slot (porté quand rien d'autre n'est équipé). */
export function starterFor(catalog: GearItem[], slot: GearSlot) {
  return catalog.find((i) => i.slot === slot && i.rarity === 'starter');
}

export function equippedItem(catalog: GearItem[], garage: Garage, slot: GearSlot) {
  const id = garage.equipped[slot];
  return (id && catalog.find((i) => i.id === id)) || starterFor(catalog, slot);
}

export function isOwned(item: GearItem, garage: Garage) {
  return item.rarity === 'starter' || garage.owned.includes(item.id);
}

export function isEquipped(item: GearItem, garage: Garage) {
  return garage.equipped[item.slot] ? garage.equipped[item.slot] === item.id : item.rarity === 'starter';
}
