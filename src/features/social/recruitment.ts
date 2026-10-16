import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { demoPilots, demoSocial, me } from '@/features/social/demo';
import { socialError } from '@/features/social/errors';
import { fetchTeam, teamElo } from '@/features/social/teams';
import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { Team, TeamApplication, TeamRole, TeamSummary } from '@/types/models';

const PILOT = 'id, username, avatar_url, elo, rank';
const TEAM = 'id, name, tag, logo_url, color';

// ---------- Annuaire des écuries ----------

/** Toutes les écuries, classées par ELO (classement des écuries, et celles qui recrutent). */
export function useTeamsDirectory() {
  return useQuery({
    queryKey: ['teams-directory'],
    staleTime: 60_000,
    queryFn: async (): Promise<TeamSummary[]> => {
      if (isDemoMode) return demoDirectory();
      const { data, error } = await supabase
        .from('team_standings')
        .select('id, name, tag, logo_url, color, recruiting, recruiting_message, elo, position, member_count')
        .order('position')
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
}

/** Page publique d'une écurie (effectif compris). */
export function useTeam(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team', 'public', teamId],
    enabled: !!teamId,
    queryFn: async (): Promise<Team | null> => {
      if (isDemoMode) return demoTeam(teamId!);
      return fetchTeam(teamId!);
    },
  });
}

// ---------- Candidatures ----------

/** Candidatures en attente pour une écurie (visibles par ses membres, traitées par le staff). */
export function useTeamApplications(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team-applications', 'team', teamId],
    enabled: !!teamId,
    queryFn: async (): Promise<TeamApplication[]> => {
      if (isDemoMode) return demoSocial.applications.filter((a) => a.team_id === teamId && a.status === 'pending');
      const { data, error } = await supabase
        .from('team_applications')
        .select(`id, team_id, message, status, created_at, applicant:profiles!team_applications_applicant_id_fkey (${PILOT}), team:teams (${TEAM})`)
        .eq('team_id', teamId!)
        .eq('status', 'pending')
        .order('created_at');
      if (error) throw error;
      return data as unknown as TeamApplication[];
    },
  });
}

/** Mes candidatures en attente. */
export function useMyApplications() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['team-applications', 'mine', userId],
    enabled: !!userId,
    queryFn: async (): Promise<TeamApplication[]> => {
      if (isDemoMode) return demoSocial.applications.filter((a) => a.applicant.id === me().id && a.status === 'pending');
      const { data, error } = await supabase
        .from('team_applications')
        .select(`id, team_id, message, status, created_at, applicant:profiles!team_applications_applicant_id_fkey (${PILOT}), team:teams (${TEAM})`)
        .eq('applicant_id', userId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as TeamApplication[];
    },
  });
}

function useInvalidateRecruitment() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ['team', 'team-applications', 'teams-directory', 'team-tags', 'team-invites', 'conversations'].map((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      ),
    );
}

export function useApplyToTeam() {
  const invalidate = useInvalidateRecruitment();
  return useMutation({
    mutationFn: async ({ teamId, message }: { teamId: string; message: string }) => {
      if (isDemoMode) return demoApply(teamId, message);
      const { error } = await supabase.rpc('apply_to_team', { p_team_id: teamId, p_message: message.trim() || null });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export function useCancelApplication() {
  const invalidate = useInvalidateRecruitment();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      if (isDemoMode) {
        const a = demoSocial.applications.find((x) => x.id === applicationId);
        if (a) a.status = 'cancelled';
        return;
      }
      const { error } = await supabase.rpc('cancel_team_application', { p_application_id: applicationId });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export function useRespondApplication() {
  const invalidate = useInvalidateRecruitment();
  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      if (isDemoMode) return demoRespond(id, accept);
      const { error } = await supabase.rpc('respond_team_application', { p_application_id: id, p_accept: accept });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

// ---------- Réglages du staff ----------

/** Ouvre ou ferme le recrutement (Team Principal). */
export function useSetRecruiting() {
  const invalidate = useInvalidateRecruitment();
  return useMutation({
    mutationFn: async ({ open, message }: { open: boolean; message: string }) => {
      if (isDemoMode) {
        if (demoSocial.team) {
          demoSocial.team.recruiting = open;
          demoSocial.team.recruiting_message = message.trim() || null;
        }
        return;
      }
      const { error } = await supabase.rpc('set_team_recruiting', { p_open: open, p_message: message.trim() || null });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

/** Nomme ou rétrograde un Directeur Sportif (Team Principal). */
export function useSetMemberRole() {
  const invalidate = useInvalidateRecruitment();
  return useMutation({
    mutationFn: async ({ pilotId, role }: { pilotId: string; role: Exclude<TeamRole, 'team_principal'> }) => {
      if (isDemoMode) {
        const m = demoSocial.team?.members.find((x) => x.pilot.id === pilotId);
        if (m) m.role = role;
        return;
      }
      const { error } = await supabase.rpc('set_team_member_role', { p_pilot_id: pilotId, p_role: role });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

// ---------- Mode démo ----------

function demoDirectory(): TeamSummary[] {
  const list: TeamSummary[] = demoSocial.directory.map((t) => ({ ...t }));
  const mine = demoSocial.team;
  if (mine) {
    list.push({
      id: mine.id,
      name: mine.name,
      tag: mine.tag,
      logo_url: mine.logo_url,
      color: mine.color,
      recruiting: mine.recruiting,
      recruiting_message: mine.recruiting_message,
      elo: teamElo(mine.members),
      position: 0,
      member_count: mine.members.length,
    });
  }
  return list.sort((a, b) => b.elo - a.elo).map((t, i) => ({ ...t, position: i + 1 }));
}

function demoTeam(teamId: string): Team | null {
  if (demoSocial.team?.id === teamId) {
    const members = demoSocial.team.members.map((m) => ({ ...m }));
    return { ...demoSocial.team, members, elo: teamElo(members) };
  }
  const t = demoDirectory().find((x) => x.id === teamId);
  if (!t) return null;
  const members = (demoSocial.directoryMembers[teamId] ?? []).map((id, i) => ({
    role: (i === 0 ? 'team_principal' : 'pilote_officiel') as TeamRole,
    joined_at: new Date().toISOString(),
    pilot: demoPilots[id],
  }));
  return { ...t, created_at: new Date().toISOString(), members, conversation_id: null };
}

function demoApply(teamId: string, message: string) {
  if (demoSocial.team) throw new Error('Tu fais déjà partie d’une écurie.');
  if (demoSocial.applications.some((a) => a.team_id === teamId && a.status === 'pending')) throw new Error('Candidature déjà envoyée.');
  const t = demoDirectory().find((x) => x.id === teamId);
  if (!t?.recruiting) throw new Error('Cette écurie ne recrute pas en ce moment.');
  demoSocial.applications.push({
    id: `app-${Date.now()}`,
    team_id: teamId,
    message: message.trim() || null,
    status: 'pending',
    created_at: new Date().toISOString(),
    applicant: me(),
    team: { id: t.id, name: t.name, tag: t.tag, logo_url: t.logo_url, color: t.color },
  });
}

function demoRespond(id: string, accept: boolean) {
  const a = demoSocial.applications.find((x) => x.id === id);
  if (!a) return;
  a.status = accept ? 'accepted' : 'declined';
  if (accept && demoSocial.team) {
    demoSocial.team.members.push({ role: 'pilote_officiel', joined_at: new Date().toISOString(), pilot: a.applicant });
  }
}
