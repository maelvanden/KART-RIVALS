import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AdminTournamentAction } from '@/features/admin/tournaments';
import { demoPilots } from '@/features/social/demo';
import { socialError } from '@/features/social/errors';
import { demoProfile, isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import type { RankTier, TeamRole } from '@/types/models';

export type TeamFilter = 'all' | 'recent' | 'inactive';

export type AdminTeamRow = {
  id: string;
  name: string;
  tag: string;
  logo_url: string | null;
  color: string;
  created_at: string;
  members: number;
  elo: number;
  recruiting: boolean;
  principal_id: string | null;
  principal: string | null;
  /** Team Principal suspendu ou banni. */
  principal_restricted: boolean;
  principal_last_activity: string | null;
};

export type AdminTeamMember = {
  id: string;
  username: string;
  avatar_url: string | null;
  elo: number;
  rank: RankTier;
  role: TeamRole;
  joined_at: string;
  restricted: boolean;
  last_activity: string | null;
};

export type AdminTeamDetail = {
  id: string;
  name: string;
  tag: string;
  logo_url: string | null;
  color: string;
  created_at: string;
  recruiting: boolean;
  recruiting_message: string | null;
  founder: string | null;
  members: AdminTeamMember[];
  actions: AdminTournamentAction[];
};

/** Au-delà de 60 jours sans activité, un Team Principal est considéré comme absent. */
export const INACTIVE_DAYS = 60;
export const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null);
export const isAbsent = (lastActivity: string | null) => (daysSince(lastActivity) ?? Infinity) > INACTIVE_DAYS;

// ---------- Mode démo ----------

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const member = (p: (typeof demoPilots)[keyof typeof demoPilots], role: TeamRole, joined: number, seen: number | null): AdminTeamMember => ({
  ...p,
  role,
  joined_at: ago(joined),
  restricted: false,
  last_activity: seen == null ? null : ago(seen),
});

let demoTeams: AdminTeamDetail[] = [
  {
    id: 'team-2',
    name: 'Apex Predators',
    tag: 'APX',
    logo_url: null,
    color: '#FF3B5C',
    created_at: ago(120),
    recruiting: true,
    recruiting_message: 'Pilotes motivés pour les guerres d’écuries du dimanche.',
    founder: demoPilots.p2.username,
    members: [member(demoPilots.p2, 'team_principal', 120, 95), member(demoPilots.p3, 'directeur_sportif', 80, 1), member(demoPilots.p1, 'pilote_officiel', 30, 3)],
    actions: [],
  },
  {
    id: 'team-3',
    name: 'Kart Republic',
    tag: 'KRT',
    logo_url: null,
    color: '#22D3EE',
    created_at: ago(5),
    recruiting: false,
    recruiting_message: null,
    founder: demoPilots.p4.username,
    members: [member(demoPilots.p4, 'team_principal', 5, 0)],
    actions: [],
  },
];

const toRow = (t: AdminTeamDetail): AdminTeamRow => {
  const principal = t.members.find((m) => m.role === 'team_principal');
  return {
    id: t.id,
    name: t.name,
    tag: t.tag,
    logo_url: t.logo_url,
    color: t.color,
    created_at: t.created_at,
    members: t.members.length,
    elo: Math.round(t.members.reduce((sum, m) => sum + m.elo, 0) / Math.max(1, t.members.length)),
    recruiting: t.recruiting,
    principal_id: principal?.id ?? null,
    principal: principal?.username ?? null,
    principal_restricted: !!principal?.restricted,
    principal_last_activity: principal?.last_activity ?? null,
  };
};

const demoFind = (id: string) => {
  const t = demoTeams.find((x) => x.id === id);
  if (!t) throw new Error('Écurie introuvable.');
  return t;
};

const demoLog = (t: AdminTeamDetail, action: string, pilotName: string | null, details: Record<string, unknown>) =>
  t.actions.unshift({ id: Date.now(), action, details, created_at: new Date().toISOString(), admin: demoProfile.username, pilot: pilotName });

const principalName = (t: AdminTeamDetail) => t.members.find((m) => m.role === 'team_principal')?.username ?? null;

// ---------- Hooks ----------

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw socialError(error);
  return data as T;
}

export function useAdminTeams(query: string, filter: TeamFilter, enabled: boolean) {
  const q = query.trim();
  return useQuery({
    queryKey: ['admin-teams', q, filter],
    enabled,
    queryFn: async (): Promise<AdminTeamRow[]> => {
      if (isDemoMode) {
        const needle = q.toLowerCase();
        return demoTeams
          .map(toRow)
          .filter((t) => !needle || t.name.toLowerCase().includes(needle) || t.tag.toLowerCase().startsWith(needle))
          .filter((t) =>
            filter === 'recent'
              ? (daysSince(t.created_at) ?? 0) <= 14
              : filter === 'inactive'
                ? t.principal_restricted || isAbsent(t.principal_last_activity)
                : true,
          );
      }
      return rpc<AdminTeamRow[]>('admin_teams', { p_query: q || null, p_filter: filter });
    },
  });
}

export function useAdminTeam(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-team', id],
    enabled: !!id && enabled,
    queryFn: async (): Promise<AdminTeamDetail> => {
      if (isDemoMode) {
        const t = demoFind(id!);
        return { ...t, members: [...t.members], actions: [...t.actions] };
      }
      return rpc<AdminTeamDetail>('admin_team_detail', { p_team_id: id });
    },
  });
}

function useInvalidateTeams() {
  const queryClient = useQueryClient();
  return () =>
    ['admin-teams', 'admin-team', 'admin-actions', 'teams', 'team', 'my-team', 'team-tags'].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    );
}

export function useAdminRenameTeam() {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: async ({ id, name, tag, reason }: { id: string; name: string; tag: string; reason?: string }) => {
      const cleanName = name.trim();
      const cleanTag = tag.trim().toUpperCase();
      if (cleanName.length < 3 || cleanName.length > 30) throw new Error('Le nom doit faire entre 3 et 30 caractères.');
      if (!/^[A-Z0-9]{2,4}$/.test(cleanTag)) throw new Error('Le tag fait 2 à 4 lettres ou chiffres, sans accent.');
      if (isDemoMode) {
        const t = demoFind(id);
        if (demoTeams.some((x) => x.id !== id && (x.name.toLowerCase() === cleanName.toLowerCase() || x.tag === cleanTag))) {
          throw new Error('Ce nom ou ce tag est déjà pris par une autre écurie.');
        }
        demoLog(t, 'rename_team', principalName(t), {
          before: `${t.name} [${t.tag}]`,
          after: `${cleanName} [${cleanTag}]`,
          reason: reason?.trim() || undefined,
        });
        t.name = cleanName;
        t.tag = cleanTag;
        return;
      }
      await rpc('admin_rename_team', { p_team_id: id, p_name: cleanName, p_tag: cleanTag, p_reason: reason?.trim() || null });
    },
    onSuccess: invalidate,
  });
}

export function useAdminModerateTeam() {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: 'remove_logo' | 'clear_message'; reason?: string }) => {
      if (isDemoMode) {
        const t = demoFind(id);
        demoLog(t, `team_${action}`, principalName(t), {
          name: t.name,
          reason: reason?.trim() || undefined,
          excerpt: action === 'clear_message' ? t.recruiting_message?.slice(0, 80) : undefined,
        });
        if (action === 'remove_logo') t.logo_url = null;
        else t.recruiting_message = null;
        return;
      }
      await rpc('admin_moderate_team', { p_team_id: id, p_action: action, p_reason: reason?.trim() || null });
    },
    onSuccess: invalidate,
  });
}

export function useAdminTransferTeam() {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: async ({ id, pilotId, reason }: { id: string; pilotId: string; reason?: string }) => {
      if (isDemoMode) {
        const t = demoFind(id);
        const next = t.members.find((m) => m.id === pilotId);
        if (!next) throw new Error('Ce pilote ne fait pas partie de cette écurie.');
        demoLog(t, 'transfer_team', next.username, { name: t.name, before: principalName(t), reason: reason?.trim() || undefined });
        t.members = t.members
          .map((m): AdminTeamMember => ({ ...m, role: m.id === pilotId ? 'team_principal' : m.role === 'team_principal' ? 'pilote_officiel' : m.role }))
          .sort((a, b) => Number(b.role === 'team_principal') - Number(a.role === 'team_principal'));
        return;
      }
      await rpc('admin_transfer_team', { p_team_id: id, p_new_principal: pilotId, p_reason: reason?.trim() || null });
    },
    onSuccess: invalidate,
  });
}

export function useAdminDissolveTeam() {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      if (isDemoMode) {
        demoFind(id);
        demoTeams = demoTeams.filter((t) => t.id !== id);
        return;
      }
      await rpc('admin_dissolve_team', { p_team_id: id, p_reason: reason?.trim() || null });
    },
    onSuccess: invalidate,
  });
}
