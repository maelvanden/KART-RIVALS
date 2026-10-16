import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { demoPilots, demoSocial, me } from '@/features/social/demo';
import { socialError } from '@/features/social/errors';
import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { PilotSummary, Team, TeamInvite, TeamMember } from '@/types/models';

const PILOT = 'id, username, avatar_url, elo, rank';

/** Taille maximale d'une écurie (même limite qu'en base). */
export const TEAM_MAX_MEMBERS = 12;

const byElo = (a: TeamMember, b: TeamMember) => b.pilot.elo - a.pilot.elo;

/** ELO d'écurie : moyenne des ELO de ses pilotes. */
export const teamElo = (members: TeamMember[]) =>
  members.length ? Math.round(members.reduce((s, m) => s + m.pilot.elo, 0) / members.length) : 0;

/** L'écurie du pilote connecté (null s'il n'en a pas), membres triés par ELO (classement interne). */
export function useMyTeam() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['team', 'mine', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Team | null> => {
      if (isDemoMode) {
        const t = demoSocial.team;
        if (!t) return null;
        const members = t.members.map((m) => (m.pilot.id === me().id ? { ...m, pilot: me() } : m)).sort(byElo);
        return { ...t, members, elo: teamElo(members) };
      }
      const { data: membership, error } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('profile_id', userId!)
        .maybeSingle();
      if (error) throw error;
      if (!membership) return null;
      return fetchTeam(membership.team_id);
    },
  });
}

async function fetchTeam(teamId: string): Promise<Team | null> {
  const [standing, members, conversation] = await Promise.all([
    supabase.from('team_standings').select('id, name, tag, logo_url, created_at, elo, position').eq('id', teamId).maybeSingle(),
    supabase.from('team_members').select(`role, joined_at, pilot:profiles (${PILOT})`).eq('team_id', teamId),
    supabase.from('conversations').select('id').eq('team_id', teamId).maybeSingle(),
  ]);
  if (standing.error) throw standing.error;
  if (members.error) throw members.error;
  if (!standing.data) return null;
  return {
    ...standing.data,
    members: (members.data as unknown as TeamMember[]).sort(byElo),
    conversation_id: conversation.data?.id ?? null,
  };
}

/** Invitations d'écurie reçues, en attente. */
export function useMyTeamInvites() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ['team-invites', 'received', userId],
    enabled: !!userId,
    queryFn: async (): Promise<TeamInvite[]> => {
      if (isDemoMode) return [...demoSocial.invites];
      const { data, error } = await supabase
        .from('team_invites')
        .select('id, created_at, team:teams (id, name, tag, logo_url), invited_by:profiles!team_invites_invited_by_fkey (username)')
        .eq('invitee_id', userId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as TeamInvite[];
    },
  });
}

/** Pilotes que mon écurie a invités et qui n'ont pas encore répondu. */
export function useSentTeamInvites(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team-invites', 'sent', teamId],
    enabled: !!teamId,
    queryFn: async (): Promise<PilotSummary[]> => {
      if (isDemoMode) return [...demoSocial.sentInvites];
      const { data, error } = await supabase
        .from('team_invites')
        .select(`invitee:profiles!team_invites_invitee_id_fkey (${PILOT})`)
        .eq('team_id', teamId!)
        .eq('status', 'pending');
      if (error) throw error;
      return (data as unknown as { invitee: PilotSummary }[]).map((r) => r.invitee);
    },
  });
}

function useInvalidateTeam() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['team'] }),
      queryClient.invalidateQueries({ queryKey: ['team-invites'] }),
      queryClient.invalidateQueries({ queryKey: ['conversations'] }),
      queryClient.invalidateQueries({ queryKey: ['team-tags'] }),
    ]);
}

export type NewTeam = { name: string; tag: string; logoUri: string | null };

export function useCreateTeam() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: async ({ name, tag, logoUri }: NewTeam): Promise<string> => {
      if (isDemoMode) {
        if (demoSocial.team) throw new Error('Tu fais déjà partie d’une écurie.');
        demoSocial.team = {
          id: `team-${Date.now()}`,
          name: name.trim(),
          tag: tag.trim().toUpperCase(),
          logo_url: logoUri,
          created_at: new Date().toISOString(),
          elo: 0,
          position: 12,
          conversation_id: 'conv-team',
          members: [{ role: 'team_principal', joined_at: new Date().toISOString(), pilot: me() }],
        };
        demoSocial.messages['conv-team'] = [];
        return demoSocial.team.id;
      }
      const { data: teamId, error } = await supabase.rpc('create_team', { p_name: name.trim(), p_tag: tag.trim().toUpperCase() });
      if (error) throw socialError(error);
      // Le blason s'envoie une fois l'écurie créée (seul son Team Principal peut écrire dans son dossier).
      if (logoUri) {
        const url = await uploadTeamLogo(teamId as string, logoUri);
        const { error: logoError } = await supabase.rpc('update_team_logo', { p_team_id: teamId, p_logo_url: url });
        if (logoError) throw socialError(logoError);
      }
      return teamId as string;
    },
    onSuccess: invalidate,
  });
}

async function uploadTeamLogo(teamId: string, localUri: string): Promise<string> {
  const bytes = await (await fetch(localUri)).arrayBuffer();
  const isPng = localUri.toLowerCase().endsWith('.png') || localUri.startsWith('data:image/png');
  const path = `${teamId}/logo.${isPng ? 'png' : 'jpg'}`;
  const { error } = await supabase.storage
    .from('team-logos')
    .upload(path, bytes, { contentType: isPng ? 'image/png' : 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('team-logos').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Change le blason (Team Principal). */
export function useSetTeamLogo() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: async ({ teamId, logoUri }: { teamId: string; logoUri: string }) => {
      if (isDemoMode) {
        if (demoSocial.team) demoSocial.team.logo_url = logoUri;
        return;
      }
      const url = await uploadTeamLogo(teamId, logoUri);
      const { error } = await supabase.rpc('update_team_logo', { p_team_id: teamId, p_logo_url: url });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export function useInviteToTeam() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: async (pilot: PilotSummary) => {
      if (isDemoMode) {
        if (demoSocial.team?.members.some((m) => m.pilot.id === pilot.id)) throw new Error('Ce pilote court déjà pour ton écurie.');
        if (!demoSocial.sentInvites.some((p) => p.id === pilot.id)) demoSocial.sentInvites.push(pilot);
        return;
      }
      const { error } = await supabase.rpc('invite_to_team', { p_pilot_id: pilot.id });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export function useRespondTeamInvite() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      if (isDemoMode) {
        const invite = demoSocial.invites.find((i) => i.id === id);
        demoSocial.invites = [];
        if (accept && invite) {
          demoSocial.team = {
            ...invite.team,
            created_at: new Date().toISOString(),
            elo: 0,
            position: 1,
            conversation_id: 'conv-team',
            members: [
              { role: 'team_principal', joined_at: invite.created_at, pilot: demoPilots.p3 },
              { role: 'pilote_officiel', joined_at: new Date().toISOString(), pilot: me() },
            ],
          };
          demoSocial.messages['conv-team'] = [];
        }
        return;
      }
      const { error } = await supabase.rpc('respond_team_invite', { p_invite_id: id, p_accept: accept });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export function useLeaveTeam() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: async () => {
      if (isDemoMode) {
        demoSocial.team = null;
        delete demoSocial.messages['conv-team'];
        // En démo, une invitation arrive pour pouvoir rejoindre une autre écurie.
        demoSocial.invites = [
          {
            id: 'inv-demo',
            created_at: new Date().toISOString(),
            team: { id: 'team-2', name: 'Apex Predators', tag: 'APX', logo_url: null },
            invited_by: { username: demoPilots.p3.username },
          },
        ];
        return;
      }
      const { error } = await supabase.rpc('leave_team');
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}

export function useKickTeamMember() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: async (pilotId: string) => {
      if (isDemoMode) {
        if (demoSocial.team) demoSocial.team.members = demoSocial.team.members.filter((m) => m.pilot.id !== pilotId);
        return;
      }
      const { error } = await supabase.rpc('kick_team_member', { p_pilot_id: pilotId });
      if (error) throw socialError(error);
    },
    onSuccess: invalidate,
  });
}
