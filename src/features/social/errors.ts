/** Messages des fonctions SQL sociales (en anglais côté base) traduits pour le pilote. */
const messages: Record<string, string> = {
  'You cannot add yourself': 'Tu ne peux pas t’ajouter toi-même.',
  'Pilot not found': 'Pilote introuvable.',
  'Already teammates': 'Vous êtes déjà coéquipiers.',
  'Request already sent': 'Demande déjà envoyée.',
  'No pending request': 'Cette demande n’est plus en attente.',
  'You already belong to a team': 'Tu fais déjà partie d’une écurie.',
  'Team name already taken': 'Ce nom d’écurie est déjà pris.',
  'Team tag already taken': 'Ce tag est déjà pris par une autre écurie.',
  'Only the Team Principal can change the crest': 'Seul le Team Principal peut changer le blason.',
  'Only the Team Principal can change the colors': 'Seul le Team Principal peut changer les couleurs.',
  'Only the Team Principal can recruit': 'Seul le Team Principal peut recruter.',
  'Pilot already belongs to a team': 'Ce pilote court déjà pour une écurie.',
  'Team is full': 'L’écurie est complète (12 pilotes maximum).',
  'No pending invitation': 'Cette invitation n’est plus valable.',
  'You do not belong to a team': 'Tu ne fais partie d’aucune écurie.',
  'Only the Team Principal can release a pilot': 'Seul le Team Principal peut libérer un pilote.',
  'Pilot is not in your team': 'Ce pilote ne fait pas partie de ton écurie.',
  'Radio is reserved to teammates': 'La Radio Paddock est réservée à tes coéquipiers.',
};

/** Erreur Supabase → Error avec un message en français si on le connaît. */
export function socialError(error: { message: string }): Error {
  const known = Object.entries(messages).find(([en]) => error.message.includes(en));
  return new Error(known ? known[1] : error.message);
}
