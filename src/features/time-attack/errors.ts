/**
 * Refus renvoyés par l'Edge Function time-attack-ticket (codes : supabase/functions/_shared/time-attack-rules.ts),
 * traduits en explication pour le pilote.
 */
export type TicketRejection = {
  code: string;
  check_in_at?: string;
  ticket_at?: string;
  deadline_at?: string;
};

export class TicketRejectedError extends Error {
  constructor(public readonly rejection: TicketRejection) {
    super(describeTicketRejection(rejection).title);
    this.name = 'TicketRejectedError';
  }
}

export type RejectionMessage = {
  title: string;
  message: string;
  /** Que faire ensuite (si le pilote peut encore réessayer). */
  hint?: string;
  /** Tentative de triche détectée : affichée en rouge. */
  severe?: boolean;
};

const hourFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dayHourFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** "14:25", ou "12 oct. 14:25" si ce n'est pas le même jour que la référence. */
export function formatHour(iso: string, reference?: string): string {
  const d = new Date(iso);
  const sameDay = !reference || new Date(reference).toDateString() === d.toDateString();
  return (sameDay ? hourFormat : dayHourFormat).format(d);
}

const RETAKE = 'Reprends une photo nette du ticket entier, à plat et bien éclairé.';

export function describeTicketRejection(r: TicketRejection): RejectionMessage {
  const checkIn = r.check_in_at ? formatHour(r.check_in_at) : null;
  const ticket = r.ticket_at ? formatHour(r.ticket_at, r.check_in_at) : null;
  const deadline = r.deadline_at ? formatHour(r.deadline_at) : null;

  switch (r.code) {
    case 'TICKET_BEFORE_CHECK_IN':
      return {
        severe: true,
        title: 'Ticket refusé : session antérieure à ton check-in',
        message:
          ticket && checkIn
            ? `Ton ticket indique une session à ${ticket}, mais ton check-in « Je pars rouler » a été enregistré à ${checkIn}. ` +
              'Seules les sessions qui démarrent après le check-in comptent : on s’engage avant de rouler, pas après avoir vu son chrono.'
            : 'L’heure de session imprimée sur ton ticket est antérieure à ton check-in. Seules les sessions qui démarrent après le check-in comptent.',
        hint:
          'Si l’heure a été mal lue, reprends la photo en cadrant bien l’heure de la session. ' +
          'Sinon, envoie le ticket d’une session courue après ton check-in.' +
          ' Tu es sûr de ton ticket ? Demande une vérification manuelle par un admin' +
          (deadline ? `, avant ${deadline}.` : '.'),
      };
    case 'TICKET_ALREADY_USED':
      return {
        severe: true,
        title: 'Ticket déjà utilisé',
        message:
          'Ce ticket (ou cette photo) a déjà validé une session Time Attack, la tienne ou celle d’un autre pilote. Chaque ticket ne compte qu’une fois.',
        hint: 'Photographie le ticket de la session que tu viens de courir.',
      };
    case 'TICKET_IN_FUTURE':
      return {
        title: 'Heure du ticket incohérente',
        message: ticket
          ? `L’heure lue sur le ticket (${ticket}) est plus tard que l’heure actuelle : elle a sûrement été mal lue.`
          : 'L’heure lue sur le ticket est plus tard que l’heure actuelle : elle a sûrement été mal lue.',
        hint: RETAKE,
      };
    case 'TICKET_DATE_UNREADABLE':
      return {
        title: 'Date du ticket illisible',
        message:
          'La date de la session doit être visible sur la photo : sans elle, impossible de vérifier que le ticket est bien celui d’aujourd’hui.',
        hint: RETAKE,
      };
    case 'TICKET_TIME_UNREADABLE':
      return {
        title: 'Heure du ticket illisible',
        message: 'L’heure de la session n’a pas pu être lue sur la photo. C’est elle qui prouve que tu as roulé après ton check-in.',
        hint: RETAKE,
      };
    case 'NOT_A_TICKET':
      return {
        title: 'Ce n’est pas un ticket de chronométrage',
        message:
          'La photo doit montrer le ticket imprimé remis par le circuit après ta session : on doit y lire tes temps au tour (au moins 3), la date et l’heure de la session.',
        hint: RETAKE,
      };
    case 'DEADLINE_PASSED':
      return {
        title: 'Délai de 90 minutes dépassé',
        message: deadline
          ? `Le ticket devait être envoyé avant ${deadline}. La session est comptée comme abandon (DNF).`
          : 'Le ticket devait être envoyé dans les 90 minutes suivant le check-in. La session est comptée comme abandon (DNF).',
      };
    case 'SESSION_CLOSED':
      return { title: 'Session déjà clôturée', message: 'Cette session Time Attack est déjà validée ou terminée.' };
    case 'SESSION_NOT_FOUND':
      return { title: 'Session introuvable', message: 'Cette session Time Attack n’existe pas ou ne t’appartient pas.' };
    case 'TRACK_NOT_FOUND':
      return {
        title: 'Circuit introuvable sur le ticket',
        message: 'Le nom ou la ville du circuit choisi au check-in n’apparaît pas sur le ticket. Seuls les tickets du circuit où tu as fait ton check-in comptent.',
        hint: 'Photographie le ticket en entier, en-tête compris (c’est là que le circuit est imprimé).',
      };
    case 'NAME_NOT_FOUND':
      return {
        title: 'Nom introuvable sur le ticket',
        message: 'Le nom que tu as indiqué n’a pas été trouvé sur la photo.',
        hint: 'Tape le nom exactement comme il est imprimé sur le ticket (celui donné à l’accueil du circuit), puis reprends une photo nette si besoin.',
      };
    case 'LAP_NOT_FOUND':
      return {
        severe: true,
        title: 'Meilleur tour introuvable',
        message:
          'Le temps que tu as indiqué n’apparaît pas sur le ticket à côté de ton nom. Seul ton propre meilleur tour, imprimé sur le ticket, est accepté.',
        hint: 'Vérifie le temps (avec les millièmes s’ils sont imprimés) et que la photo est bien lisible.',
      };
    case 'TOO_MANY_ATTEMPTS':
      return {
        title: 'Trop de tickets envoyés pour cette session',
        message: 'La lecture automatique est limitée à 10 tickets par session.',
        hint: 'Envoie ton dernier ticket en vérification manuelle : un admin regarde la photo, sans DNF en attendant.',
      };
    case 'OCR_UNAVAILABLE':
      return {
        title: 'Lecture du ticket indisponible',
        message: 'Le service de lecture des tickets ne répond pas pour le moment.',
        hint: `Réessaie dans un instant${deadline ? ` : ton délai court jusqu’à ${deadline}` : ''}.`,
      };
    default:
      return { title: 'Ticket refusé', message: 'Le ticket n’a pas pu être validé.', hint: RETAKE };
  }
}
