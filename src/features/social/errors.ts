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
  'Only the team staff can recruit': 'Seuls le Team Principal et les Directeurs Sportifs recrutent.',
  'Only the team staff can release a pilot': 'Seuls le Team Principal et les Directeurs Sportifs libèrent des pilotes.',
  'Only the Team Principal can release staff': 'Seul le Team Principal peut libérer un Directeur Sportif.',
  'Only the Team Principal can assign roles': 'Seul le Team Principal attribue les rôles.',
  'Invalid role': 'Rôle invalide.',
  'Only the Team Principal can open recruitment': 'Seul le Team Principal ouvre ou ferme le recrutement.',
  'This team is not recruiting': 'Cette écurie ne recrute pas en ce moment.',
  'Application already sent': 'Candidature déjà envoyée.',
  'Too many pending applications': 'Tu as déjà 3 candidatures en attente.',
  'No pending application': 'Cette candidature n’est plus en attente.',
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
