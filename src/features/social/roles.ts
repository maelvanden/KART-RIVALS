import type { TeamRole } from '@/types/models';

export const roleLabel: Record<TeamRole, string> = {
  team_principal: 'Team Principal',
  directeur_sportif: 'Directeur Sportif',
  pilote_officiel: 'Pilote officiel',
};

/** Ordre d'affichage des rôles. */
export const roleOrder: Record<TeamRole, number> = { team_principal: 0, directeur_sportif: 1, pilote_officiel: 2 };

/** Le staff (Team Principal, Directeur Sportif) recrute et traite les candidatures. */
export const isStaff = (role: TeamRole | undefined) => role === 'team_principal' || role === 'directeur_sportif';
