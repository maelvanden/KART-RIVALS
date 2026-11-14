import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { socialError } from '@/features/social/errors';
import { TIME_ATTACK_ENABLED } from '@/features/time-attack/config';
import { isDemoMode } from '@/lib/demo';
import { supabase } from '@/lib/supabase';

/** Réglages de l'appli pilotés à distance par les admins appli (table app_settings, une seule ligne). */
export type AppSettings = {
  time_attack_enabled: boolean;
  /** Message affiché aux pilotes pendant la pause du Time Attack. */
  time_attack_message: string | null;
  maintenance: boolean;
  maintenance_message: string | null;
  /** En dessous de cette version, l'appli demande la mise à jour depuis la boutique. */
  min_version: string | null;
  ios_store_url: string | null;
  android_store_url: string | null;
  updated_at: string;
};

export type AppSettingsChanges = Partial<Omit<AppSettings, 'updated_at'>>;

const COLUMNS =
  'time_attack_enabled, time_attack_message, maintenance, maintenance_message, min_version, ios_store_url, android_store_url, updated_at';

/** Version de l'appli en cours d'exécution (champ « version » d'app.json, embarqué dans le bundle). */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

const demoSettings: AppSettings = {
  time_attack_enabled: TIME_ATTACK_ENABLED,
  time_attack_message: null,
  maintenance: false,
  maintenance_message: null,
  min_version: null,
  ios_store_url: null,
  android_store_url: null,
  updated_at: new Date().toISOString(),
};

export const isVersion = (v: string) => /^\d+(\.\d+){0,2}$/.test(v);

/** Compare deux versions « 1.2.0 » : négatif si a < b, 0 si égales, positif si a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Cette appli est-elle plus ancienne que la version minimale exigée ? */
export const isOutdated = (minVersion: string | null | undefined, current = APP_VERSION) =>
  !!minVersion && isVersion(minVersion) && compareVersions(current, minVersion) < 0;

/** Lien de la boutique pour ce téléphone (null sur le web ou si l'admin ne l'a pas renseigné). */
export const storeUrl = (s: Pick<AppSettings, 'ios_store_url' | 'android_store_url'>) =>
  Platform.OS === 'ios' ? s.ios_store_url : Platform.OS === 'android' ? s.android_store_url : null;

/**
 * Réglages en cours. Relus toutes les 5 minutes et à chaque retour de l'appli au premier plan, pour qu'une pause ou une
 * maintenance décidée par un admin arrive vite. En cas d'échec (hors ligne, base pas encore migrée), `data` reste
 * indéfini et l'appli garde son comportement par défaut : rien n'est bloqué.
 */
export function useAppSettings() {
  const query = useQuery({
    queryKey: ['app-settings'],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<AppSettings> => {
      if (isDemoMode) return { ...demoSettings };
      const { data, error } = await supabase.from('app_settings').select(COLUMNS).single();
      if (error) throw error;
      return data as AppSettings;
    },
  });
  const { refetch } = query;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });
    return () => sub.remove();
  }, [refetch]);
  return query;
}

/** Le Time Attack est-il ouvert ? Tant que les réglages ne sont pas chargés : la valeur par défaut du code. */
export function useTimeAttackEnabled(): boolean {
  return useAppSettings().data?.time_attack_enabled ?? TIME_ATTACK_ENABLED;
}

export function useUpdateAppSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: AppSettingsChanges): Promise<AppSettings> => {
      if (changes.min_version && !isVersion(changes.min_version.trim())) {
        throw new Error('Version invalide : écris-la comme 1.2.0.');
      }
      for (const url of [changes.ios_store_url, changes.android_store_url]) {
        if (url?.trim() && !/^https:\/\//.test(url.trim())) throw new Error('Le lien de la boutique doit commencer par https://');
      }
      if (isDemoMode) {
        const clean = Object.fromEntries(
          Object.entries(changes).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v]),
        );
        Object.assign(demoSettings, clean, { updated_at: new Date().toISOString() });
        return { ...demoSettings };
      }
      const { data, error } = await supabase.rpc('admin_update_app_settings', { p_changes: changes });
      if (error) throw socialError(error);
      return data as AppSettings;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(['app-settings'], settings);
      queryClient.invalidateQueries({ queryKey: ['admin-actions'] });
    },
  });
}
