/** Codes levés par buy_gear_item() / equip_gear_item(), traduits pour le pilote. */
const messages: Record<string, string> = {
  NOT_ENOUGH_POINTS: "Il te manque des points. Roule encore un peu pour t'offrir cet équipement !",
  RANK_REQUIRED: "Ton rang n'est pas encore assez élevé pour débloquer cet objet.",
  ALREADY_OWNED: 'Cet objet est déjà dans ton garage.',
  NOT_OWNED: "Cet objet n'est pas encore dans ton garage.",
  ITEM_NOT_FOUND: "Cet objet n'existe plus dans la boutique.",
};

export function gearErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const code = Object.keys(messages).find((c) => raw.includes(c));
  return code ? messages[code] : `Oups, ça n'a pas marché : ${raw}`;
}
