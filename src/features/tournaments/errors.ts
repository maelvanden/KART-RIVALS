/** Messages des fonctions SQL des tournois (en anglais côté base) traduits pour le pilote. */
const messages: Record<string, string> = {
  'Account restricted': 'Ton compte est restreint : impossible de participer aux tournois pour l’instant.',
  'A tournament has': 'Un tournoi se joue à 4, 8, 16 ou 32 pilotes.',
  'Only the organizer can edit the tournament': 'Seul l’organisateur peut modifier le tournoi.',
  'Tournament name must be 3 to 60 characters': 'Le nom du tournoi doit faire entre 3 et 60 caractères.',
  'Too many open tournaments': 'Tu organises déjà trop de tournois en cours.',
  'Tournament not found': 'Tournoi introuvable.',
  'Registration deadline must be in the future': 'La clôture des inscriptions doit être dans le futur.',
  'Only the organizer can record results': 'Seul l’organisateur peut saisir les résultats.',
  'Results are recorded by the organizer only in on-site tournaments': 'La saisie par l’organisateur est réservée aux tournois sur place.',
  'Both positions are required': 'Indique le vainqueur du duel.',
  'Both lap times are required': 'Indique les deux chronos.',
  'You cannot record your own duel': 'Tu ne peux pas saisir le résultat de ton propre duel dans un tournoi officiel.',
  'Already on the waiting list': 'Tu es déjà sur la liste d’attente.',
  'Waiting list is full': 'La liste d’attente est complète.',
  'Entry conditions not met': 'Ton ELO ne correspond pas aux conditions d’entrée de ce tournoi.',
  'Invalid ELO range': 'Fourchette d’ELO invalide : le minimum dépasse le maximum.',
  'Only the track admins can organize an official tournament': 'Seuls les admins de ce karting peuvent organiser un tournoi officiel.',
  'Invitation required': 'Ce tournoi est privé : il faut une invitation pour s’inscrire.',
  'Only the organizer can invite to this tournament': 'Seul l’organisateur peut inviter à ce tournoi.',
  'Too many pending invitations': 'Trop d’invitations en attente (64 maximum).',
  'Registrations are closed': 'Les inscriptions sont closes.',
  'Already registered': 'Tu es déjà inscrit.',
  'Tournament is full': 'Le tableau est complet.',
  'Pilot unavailable': 'Inscription impossible : un pilote inscrit et toi vous êtes bloqués.',
  'The organizer cannot leave': 'L’organisateur ne peut pas se désinscrire : annule le tournoi.',
  'Only the organizer can start the tournament': 'Seul l’organisateur peut lancer le tournoi.',
  'Not enough pilots to start': 'Pas assez de pilotes pour lancer le tableau.',
  'Only the organizer can cancel the tournament': 'Seul l’organisateur peut annuler le tournoi.',
  'A running tournament cannot be cancelled': 'Le tableau est lancé : seul un admin peut annuler le tournoi.',
  'Tournament is over': 'Ce tournoi est terminé.',
  'Tournament match not found': 'Duel introuvable.',
  'This duel is not being played': 'Ce duel n’est pas en cours.',
  'A result is awaiting confirmation': 'Un résultat attend d’être validé : valide-le ou conteste-le d’abord.',
  'Only the organizer can award a walkover': 'Seul l’organisateur (s’il ne joue pas ce duel) peut prononcer un forfait.',
  'A tournament duel cannot end in a tie': 'Pas d’égalité en tournoi : il faut un vainqueur pour passer au tour suivant.',
  'Tournament duels cannot be cancelled': 'Un duel de tournoi ne s’annule pas : tu peux abandonner depuis le tableau.',
};

export function tournamentError(error: { message: string }): Error {
  const known = Object.entries(messages).find(([en]) => error.message.includes(en));
  return new Error(known ? known[1] : error.message);
}
