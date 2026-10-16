import { icons, type IconName } from '@/components/ui/icon';

/**
 * Catalogue du garage virtuel — doit rester aligné sur les enums de la migration
 * 20261020000016_user_gear.sql. Marques en texte brut uniquement : aucun logo officiel dans l'app.
 */
export const HELMET_BRANDS = ['arai', 'bell', 'shoei', 'stilo', 'zamp', 'ls2', 'omp', 'sparco', 'autre'] as const;
export const APPAREL_BRANDS = ['sparco', 'alpinestars', 'omp', 'freem', 'sabelt', 'puma', 'autre'] as const;
export const RIB_PROTECTOR_BRANDS = ['bengio', 'tillett', 'sodi', 'omp', 'sparco', 'autre'] as const;

export type HelmetBrand = (typeof HELMET_BRANDS)[number];
export type ApparelBrand = (typeof APPAREL_BRANDS)[number];
export type RibProtectorBrand = (typeof RIB_PROTECTOR_BRANDS)[number];
export type GearBrand = HelmetBrand | ApparelBrand | RibProtectorBrand;

/** Une ligne de la table user_gear (null = équipement de location). */
export type UserGear = {
  helmet: HelmetBrand | null;
  suit: ApparelBrand | null;
  gloves: ApparelBrand | null;
  shoes: ApparelBrand | null;
  rib_protector: RibProtectorBrand | null;
};

export type GearCategory = keyof UserGear;

export const EMPTY_GEAR: UserGear = { helmet: null, suit: null, gloves: null, shoes: null, rib_protector: null };

export const brandLabels: Record<GearBrand, string> = {
  arai: 'Arai',
  bell: 'Bell',
  shoei: 'Shoei',
  stilo: 'Stilo',
  zamp: 'Zamp',
  ls2: 'LS2',
  omp: 'OMP',
  sparco: 'Sparco',
  alpinestars: 'Alpinestars',
  freem: 'FreeM',
  sabelt: 'Sabelt',
  puma: 'Puma',
  bengio: 'Bengio',
  tillett: 'Tillett',
  sodi: 'Sodi',
  autre: 'Autre',
};

/** Les 5 slots, dans l'ordre d'affichage, avec une icône générique par catégorie. */
export const gearSlots: { category: GearCategory; label: string; icon: IconName; brands: readonly GearBrand[] }[] = [
  { category: 'helmet', label: 'Casque', icon: icons.helmet, brands: HELMET_BRANDS },
  { category: 'suit', label: 'Combinaison', icon: icons.suit, brands: APPAREL_BRANDS },
  { category: 'gloves', label: 'Gants', icon: icons.gloves, brands: APPAREL_BRANDS },
  { category: 'shoes', label: 'Bottines', icon: icons.shoes, brands: APPAREL_BRANDS },
  { category: 'rib_protector', label: 'Protège-côtes', icon: icons.ribProtector, brands: RIB_PROTECTOR_BRANDS },
];
